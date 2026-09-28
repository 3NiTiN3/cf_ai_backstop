import { cacheKey, type CacheEntry, type CacheStore } from "./cache";
import { isCacheable, ttlFor } from "./cache-policy";
import { Coalescer } from "./coalesce";
import type { Counters } from "./counters";
import { isHealthFailure } from "./health";
import { fromCache, fromUpstream, stale, unavailable } from "./responses";
import type { GatewayRoute, Namespace } from "./routes";
import { toUpstreamRequest, type UpstreamResult } from "./upstream";

export interface ReadDeps {
  now: () => number;
  upstream: (namespace: Namespace, request: Request) => Promise<UpstreamResult>;
}

type FetchOutcome =
  | { kind: "fresh"; result: UpstreamResult }
  | { kind: "revalidated"; entry: CacheEntry }
  | { kind: "stale"; entry: CacheEntry }
  | { kind: "unavailable"; retryAfterSeconds: number };

const DEFAULT_RETRY_AFTER_SECONDS = 5;

export class ReadThroughCache {
  private readonly coalescer = new Coalescer<FetchOutcome>();

  constructor(
    private readonly store: CacheStore,
    private readonly counters: Counters,
    private readonly deps: ReadDeps,
  ) {}

  async read(request: Request, route: GatewayRoute): Promise<Response> {
    const key = await cacheKey(request, route);
    const cached = this.store.get(key);
    if (cached && cached.expiresAt > this.deps.now()) {
      this.store.recordHit(key);
      this.counters.increment("upstream_avoided");
      return fromCache(cached, "HIT");
    }
    const { promise, shared } = this.coalescer.run(key, () =>
      this.refetch(key, request, route, cached),
    );
    const response = this.toResponse(await promise);
    if (shared) {
      this.counters.increment("upstream_avoided");
      response.headers.set("x-backstop-coalesced", "1");
    }
    return response;
  }

  private toResponse(outcome: FetchOutcome): Response {
    switch (outcome.kind) {
      case "fresh":
        return fromUpstream(outcome.result, "MISS");
      case "revalidated":
        return fromCache(outcome.entry, "REVALIDATED");
      case "stale":
        return stale(outcome.entry, this.deps.now());
      case "unavailable":
        return unavailable(outcome.retryAfterSeconds);
    }
  }

  private async refetch(
    key: string,
    request: Request,
    route: GatewayRoute,
    cached: CacheEntry | null,
  ): Promise<FetchOutcome> {
    const result = await this.fetch(request, route, cached);
    if (isUnhealthy(result)) return this.fallback(result, cached);
    if (cached && result.status === 304) {
      this.store.refresh(key, this.deps.now(), this.expiry(route));
      this.counters.increment("revalidated");
      return { kind: "revalidated", entry: cached };
    }
    this.storeIfCacheable(key, request.method, route, result);
    return { kind: "fresh", result };
  }

  private fallback(
    result: UpstreamResult,
    cached: CacheEntry | null,
  ): FetchOutcome {
    if (result.outcome === "circuit_open") {
      this.counters.increment("upstream_avoided");
    }
    if (cached) return { kind: "stale", entry: cached };
    return { kind: "unavailable", retryAfterSeconds: retryAfterOf(result) };
  }

  private async fetch(
    request: Request,
    route: GatewayRoute,
    cached: CacheEntry | null,
  ): Promise<UpstreamResult> {
    const result = await this.deps.upstream(
      route.namespace,
      toUpstreamRequest(request, route, validators(cached)),
    );
    if (result.outcome !== "circuit_open") {
      this.counters.increment("upstream_calls");
    }
    return result;
  }

  private storeIfCacheable(
    key: string,
    method: string,
    route: GatewayRoute,
    result: UpstreamResult,
  ): void {
    if (!isCacheable(method, result.status, result.body)) return;
    this.store.put({
      key,
      status: result.status,
      headers: result.headers,
      body: result.body,
      etag: result.etag,
      lastModified: result.lastModified,
      fetchedAt: this.deps.now(),
      expiresAt: this.expiry(route),
    });
  }

  private expiry(route: GatewayRoute): number {
    return (
      this.deps.now() +
      ttlFor(route.upstreamPath, new URLSearchParams(route.search))
    );
  }
}

function isUnhealthy(result: UpstreamResult): boolean {
  return result.outcome === "circuit_open" || isHealthFailure(result.outcome);
}

function retryAfterOf(result: UpstreamResult): number {
  const seconds = Number(result.headers["retry-after"]);
  return Number.isInteger(seconds) && seconds > 0
    ? seconds
    : DEFAULT_RETRY_AFTER_SECONDS;
}

function validators(entry: CacheEntry | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (entry?.etag) headers["if-none-match"] = entry.etag;
  if (entry?.lastModified) headers["if-modified-since"] = entry.lastModified;
  return headers;
}
