import { cacheKey, type CacheEntry, type CacheStore } from "./cache";
import { isCacheable, ttlFor } from "./cache-policy";
import type { Counters } from "./counters";
import { fromCache, fromUpstream } from "./responses";
import type { GatewayRoute, Namespace } from "./routes";
import { toUpstreamRequest, type UpstreamResult } from "./upstream";

export interface ReadDeps {
  now: () => number;
  upstream: (namespace: Namespace, request: Request) => Promise<UpstreamResult>;
}

export class ReadThroughCache {
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
    const result = await this.fetch(request, route, cached);
    if (cached && result.status === 304) {
      this.store.refresh(key, this.deps.now(), this.expiry(route));
      this.counters.increment("revalidated");
      return fromCache(cached, "REVALIDATED");
    }
    this.storeIfCacheable(key, request.method, route, result);
    return fromUpstream(result, "MISS");
  }

  private fetch(
    request: Request,
    route: GatewayRoute,
    cached: CacheEntry | null,
  ): Promise<UpstreamResult> {
    this.counters.increment("upstream_calls");
    return this.deps.upstream(
      route.namespace,
      toUpstreamRequest(request, route, validators(cached)),
    );
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

function validators(entry: CacheEntry | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (entry?.etag) headers["if-none-match"] = entry.etag;
  if (entry?.lastModified) headers["if-modified-since"] = entry.lastModified;
  return headers;
}
