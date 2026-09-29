import { DurableObject } from "cloudflare:workers";
import type { Breaker, Transition } from "./breaker";
import { BreakerStore } from "./breaker-store";
import { CacheStore } from "./cache";
import { CachedChaos } from "./chaos";
import { Counters, type CounterTotals } from "./counters";
import { EventLog, type GatewayEvent } from "./events";
import { GuardedUpstream, type GatewayMode } from "./guarded-upstream";
import { HealthWindow, type HealthSnapshot } from "./health";
import { workersAiGenerator } from "./incident-summary";
import { IncidentTracker } from "./incident-tracker";
import type { Incident } from "./incidents";
import { ReadThroughCache } from "./read-through";
import { REGISTRY_NAME } from "./registry";
import { MODE_HEADER, cacheLabel } from "./responses";
import type { GatewayRoute, Namespace } from "./routes";
import { RepoReporter } from "./repo-reporter";
import { TIMELINE_LIMIT, buildTimeline, type TimelineEntry } from "./timeline";
import { fetchUpstream, type UpstreamResult } from "./upstream";
import type { SendOutcome, SettleDecision } from "./replay-sender";
import type { ReplayTarget, StartResult } from "./replay-trigger";
import type { QueueChange, QueueListing } from "./queue-control";
import { WriteSide, type PauseResult } from "./write-side";

const MAX_EVENTS_PER_CALL = 500;
const MAX_INCIDENTS_PER_CALL = 50;

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
  private readonly incidents = new IncidentTracker({
    sql: this.ctx.storage.sql,
    errorRate: () => this.health.snapshot().errorRate,
    queueDepth: () => this.writes.queueDepth(),
    repo: () => this.route?.repoKey ?? null,
    generate: workersAiGenerator(this.env.AI),
    waitUntil: (promise) => this.ctx.waitUntil(promise),
  });
  private readonly upstream = new GuardedUpstream(
    new BreakerStore(this.ctx.storage.sql),
    this.health,
    {
      now: () => Date.now(),
      fetch: (namespace, request) =>
        this.chaos.wrap(namespace, () => fetchUpstream(namespace, request)),
      onTransition: (transition) => this.onTransition(transition),
    },
  );
  private readonly reads = new ReadThroughCache(
    new CacheStore(this.ctx.storage.sql),
    this.counters,
    {
      now: () => Date.now(),
      upstream: (namespace, request) => this.callUpstream(namespace, request),
    },
  );
  private readonly writes = new WriteSide({
    sql: this.ctx.storage.sql,
    secret: this.env.QUEUE_ENCRYPTION_KEY,
    workflow: this.env.ReplayWorkflow,
    upstream: (namespace, request) => this.callUpstream(namespace, request),
    mode: () => this.upstream.mode(),
    target: () => this.route,
    record: (event) => this.note(event),
    waitUntil: (promise) => this.ctx.waitUntil(promise),
  });
  private route: GatewayRoute | null = null;
  private readonly reporter = new RepoReporter(
    {
      route: () => this.route,
      health: () => this.getHealth(),
      queueDepth: () => this.writes.queueDepth(),
    },
    {
      now: () => Date.now(),
      send: (snapshot) =>
        this.ctx.waitUntil(
          this.env.Registry.getByName(REGISTRY_NAME)
            .report(snapshot)
            .catch(() => undefined),
        ),
    },
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

  forgetChaos(namespace: Namespace): void {
    this.chaos.forget(namespace);
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

  listIncidents(limit: number): Incident[] {
    return this.incidents.list(
      Math.min(Math.max(Math.floor(limit), 1), MAX_INCIDENTS_PER_CALL),
    );
  }

  async getTimeline(namespace: Namespace): Promise<TimelineEntry[]> {
    const chaos = await this.env.Registry.getByName(REGISTRY_NAME).chaosEvents(
      namespace,
      TIMELINE_LIMIT,
    );
    return buildTimeline({
      events: this.events.recent(MAX_EVENTS_PER_CALL),
      chaos,
      incidents: this.incidents.list(MAX_INCIDENTS_PER_CALL),
    });
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

  listQueue(): QueueListing {
    return this.writes.listQueue();
  }

  retryQueuedWrite(target: ReplayTarget, id: string): QueueChange {
    return this.writes.retry(target, id);
  }

  dropQueuedWrite(id: string): QueueChange {
    return this.writes.drop(id);
  }

  setWritesPaused(target: ReplayTarget, paused: boolean): Promise<PauseResult> {
    return this.writes.setPaused(target, paused);
  }

  private async callUpstream(
    namespace: Namespace,
    request: Request,
  ): Promise<UpstreamResult> {
    const result = await this.upstream.call(namespace, request);
    this.reporter.countUpstream(result.outcome);
    return result;
  }

  private dispatch(request: Request, route: GatewayRoute): Promise<Response> {
    if (request.method === "GET") return this.reads.read(request, route);
    return this.writes.handle(request, route);
  }

  private record(event: GatewayEvent): void {
    this.counters.increment("requests");
    this.reporter.countRequest();
    if (event.cache === "HIT") this.counters.increment("hits");
    if (event.cache === "COALESCED") this.counters.increment("coalesced");
    this.log(event);
  }

  private note(event: Omit<GatewayEvent, "ts">): void {
    this.log({ ts: Date.now(), ...event });
  }

  private log(event: GatewayEvent): void {
    this.events.record(event);
    this.incidents.observe(event);
    this.reporter.report();
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
    this.incidents.onTransition(transition);
    this.reporter.reportNow();
    if (transition.to === "closed") this.writes.onRecovered();
  }
}
