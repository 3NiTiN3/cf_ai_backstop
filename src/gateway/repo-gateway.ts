import { DurableObject } from "cloudflare:workers";
import { CacheStore } from "./cache";
import { Counters, type CounterTotals } from "./counters";
import { EventLog, type GatewayEvent } from "./events";
import { ReadThroughCache } from "./read-through";
import { REGISTRY_NAME } from "./registry";
import { fromUpstream } from "./responses";
import type { GatewayRoute } from "./routes";
import { TrailingThrottle } from "./throttle";
import { fetchUpstream, toUpstreamRequest } from "./upstream";

const REPORT_INTERVAL_MS = 2000;
const MAX_EVENTS_PER_CALL = 500;

export interface RepoStats {
  counters: CounterTotals;
  lastEventAt: number | null;
}

export class RepoGateway extends DurableObject<Env> {
  private readonly counters = new Counters(this.ctx.storage.sql);
  private readonly events = new EventLog(this.ctx.storage.sql);
  private readonly reads = new ReadThroughCache(
    new CacheStore(this.ctx.storage.sql),
    this.counters,
    { now: () => Date.now(), upstream: (ns, req) => fetchUpstream(ns, req) },
  );
  private route: GatewayRoute | null = null;
  private readonly reporter = new TrailingThrottle(REPORT_INTERVAL_MS, () =>
    this.reportToRegistry(),
  );

  async handle(request: Request, route: GatewayRoute): Promise<Response> {
    this.route = route;
    const started = Date.now();
    const response = await this.dispatch(request, route);
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

  getRecentEvents(limit: number): GatewayEvent[] {
    const bounded = Math.min(
      Math.max(Math.floor(limit), 1),
      MAX_EVENTS_PER_CALL,
    );
    return this.events.recent(Number.isFinite(bounded) ? bounded : 1);
  }

  private async dispatch(
    request: Request,
    route: GatewayRoute,
  ): Promise<Response> {
    if (request.method === "GET") return this.reads.read(request, route);
    const result = await fetchUpstream(
      route.namespace,
      toUpstreamRequest(request, route),
    );
    return fromUpstream(result, "BYPASS");
  }

  private record(event: GatewayEvent): void {
    this.counters.increment("requests");
    if (event.cache === "HIT") this.counters.increment("hits");
    if (event.cache === "COALESCED") this.counters.increment("coalesced");
    this.events.record(event);
    this.reporter.trigger();
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
        })
        .catch(() => undefined),
    );
  }
}

function cacheLabel(response: Response): string {
  if (response.headers.get("x-backstop-coalesced") === "1") return "COALESCED";
  return response.headers.get("x-backstop-cache") ?? "NONE";
}
