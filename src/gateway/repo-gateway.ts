import { DurableObject } from "cloudflare:workers";
import type { Breaker, Transition } from "./breaker";
import { BreakerStore } from "./breaker-store";
import { CacheStore } from "./cache";
import { CachedChaos, applyChaos } from "./chaos";
import { Counters, type CounterTotals } from "./counters";
import { EventLog, type GatewayEvent } from "./events";
import { GuardedUpstream, type GatewayMode } from "./guarded-upstream";
import { HealthWindow, type HealthSnapshot } from "./health";
import { ReadThroughCache } from "./read-through";
import { REGISTRY_NAME } from "./registry";
import { MODE_HEADER } from "./responses";
import type { GatewayRoute, Namespace } from "./routes";
import { TrailingThrottle } from "./throttle";
import { fetchUpstream, type UpstreamResult } from "./upstream";
import type { SendOutcome, SettleDecision } from "./replay-sender";
import type { ReplayTarget, StartResult } from "./replay-trigger";
import { WriteSide, type PauseResult } from "./write-side";

const REPORT_INTERVAL_MS = 2000;
const MAX_EVENTS_PER_CALL = 500;

export interface RepoStats {
  counters: CounterTotals;
  lastEventAt: number | null;
}

export interface RepoHealth extends RepoStats {
  mode: GatewayMode;
  breaker: Breaker;
  health: HealthSnapshot;
  writesPaused: boolean;
}

export class RepoGateway extends DurableObject<Env> {
  private readonly counters = new Counters(this.ctx.storage.sql);
  private readonly events = new EventLog(this.ctx.storage.sql);
  private readonly chaos = new CachedChaos(
    (namespace) =>
      this.env.Registry.getByName(REGISTRY_NAME).getChaos(namespace),
    () => Date.now(),
  );
  private readonly health = new HealthWindow(() => Date.now());
  private readonly upstream = new GuardedUpstream(
    new BreakerStore(this.ctx.storage.sql),
    this.health,
    {
      now: () => Date.now(),
      fetch: (namespace, request) => this.fetchWithChaos(namespace, request),
      onTransition: (transition) => this.onTransition(transition),
    },
  );
  private readonly reads = new ReadThroughCache(
    new CacheStore(this.ctx.storage.sql),
    this.counters,
    {
      now: () => Date.now(),
      upstream: (namespace, request) => this.upstream.call(namespace, request),
    },
  );
  private readonly writes = new WriteSide({
    sql: this.ctx.storage.sql,
    secret: this.env.QUEUE_ENCRYPTION_KEY,
    workflow: this.env.ReplayWorkflow,
    upstream: (namespace, request) => this.upstream.call(namespace, request),
    mode: () => this.upstream.mode(),
    target: () => this.route,
    record: (event) => this.note(event),
    waitUntil: (promise) => this.ctx.waitUntil(promise),
  });
  private route: GatewayRoute | null = null;
  private readonly reporter = new TrailingThrottle(REPORT_INTERVAL_MS, () =>
    this.reportToRegistry(),
  );

  async handle(request: Request, route: GatewayRoute): Promise<Response> {
    this.route = route;
    const started = Date.now();
    const response = await this.dispatch(request, route);
    if (!response.headers.has(MODE_HEADER)) {
      response.headers.set(MODE_HEADER, this.upstream.mode());
    }
    this.record({
      ts: started,
      kind: request.method === "GET" ? "read" : "write",
      method: request.method,
      path: `${route.upstreamPath}${route.search}`,
      status: response.status,
      cache: cacheLabel(response),
      latencyMs: Date.now() - started,
    });
    return response;
  }

  getStats(): RepoStats {
    return {
      counters: this.counters.snapshot(),
      lastEventAt: this.events.lastEventAt(),
    };
  }

  getHealth(): RepoHealth {
    return {
      ...this.getStats(),
      mode: this.upstream.mode(),
      breaker: this.upstream.state(),
      health: this.health.snapshot(),
      writesPaused: this.writes.paused(),
    };
  }

  getRecentEvents(limit: number): GatewayEvent[] {
    const bounded = Math.min(
      Math.max(Math.floor(limit), 1),
      MAX_EVENTS_PER_CALL,
    );
    return this.events.recent(Number.isFinite(bounded) ? bounded : 1);
  }

  claimReplayBatch(): string[] {
    return this.writes.claimBatch();
  }

  sendQueuedWrite(namespace: Namespace, id: string): Promise<SendOutcome> {
    return this.writes.send(namespace, id);
  }

  settleQueuedWrite(id: string): SettleDecision {
    return this.writes.settle(id);
  }

  triggerReplay(target: ReplayTarget): Promise<StartResult> {
    return this.writes.replay(target);
  }

  setWritesPaused(target: ReplayTarget, paused: boolean): Promise<PauseResult> {
    return this.writes.setPaused(target, paused);
  }

  private dispatch(request: Request, route: GatewayRoute): Promise<Response> {
    if (request.method === "GET") return this.reads.read(request, route);
    return this.writes.handle(request, route);
  }

  private async fetchWithChaos(
    namespace: Namespace,
    request: Request,
  ): Promise<UpstreamResult> {
    return applyChaos(
      await this.chaos.get(namespace),
      () => fetchUpstream(namespace, request),
      {
        random: Math.random,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      },
    );
  }

  private record(event: GatewayEvent): void {
    this.counters.increment("requests");
    if (event.cache === "HIT") this.counters.increment("hits");
    if (event.cache === "COALESCED") this.counters.increment("coalesced");
    this.events.record(event);
    this.reporter.trigger();
  }

  private note(event: Omit<GatewayEvent, "ts">): void {
    this.events.record({ ts: Date.now(), ...event });
    this.reporter.trigger();
  }

  private onTransition(transition: Transition): void {
    this.events.record({
      ts: transition.at,
      kind: "breaker",
      method: "",
      path: "",
      status: 0,
      cache: "NONE",
      latencyMs: 0,
      detail: `${transition.from} -> ${transition.to} (${transition.reason})`,
    });
    this.reportToRegistry();
    if (transition.to === "closed") this.writes.onRecovered();
  }

  private reportToRegistry(): void {
    if (!this.route) return;
    const registry = this.env.Registry.getByName(REGISTRY_NAME);
    const { counters, lastEventAt } = this.getStats();
    this.ctx.waitUntil(
      registry
        .report({
          namespace: this.route.namespace,
          repoKey: this.route.repoKey,
          counters,
          lastEventAt,
          breaker: this.upstream.state().state,
        })
        .catch(() => undefined),
    );
  }
}

function cacheLabel(response: Response): string {
  if (response.headers.get("x-backstop-coalesced") === "1") return "COALESCED";
  return response.headers.get("x-backstop-cache") ?? "NONE";
}
