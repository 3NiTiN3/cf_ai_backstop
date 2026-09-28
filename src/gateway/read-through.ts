import { cacheKey, type CacheStore } from "./cache";
import { isCacheable, ttlFor } from "./cache-policy";
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
    private readonly deps: ReadDeps,
  ) {}

  async read(request: Request, route: GatewayRoute): Promise<Response> {
    const key = await cacheKey(request, route);
    const cached = this.store.get(key);
    if (cached && cached.expiresAt > this.deps.now()) {
      this.store.recordHit(key);
      return fromCache(cached, "HIT");
    }
    const result = await this.deps.upstream(
      route.namespace,
      toUpstreamRequest(request, route),
    );
    this.storeIfCacheable(key, request.method, route, result);
    return fromUpstream(result, "MISS");
  }

  private storeIfCacheable(
    key: string,
    method: string,
    route: GatewayRoute,
    result: UpstreamResult,
  ): void {
    if (!isCacheable(method, result.status, result.body)) return;
    const now = this.deps.now();
    this.store.put({
      key,
      status: result.status,
      headers: result.headers,
      body: result.body,
      etag: result.etag,
      lastModified: result.lastModified,
      fetchedAt: now,
      expiresAt:
        now + ttlFor(route.upstreamPath, new URLSearchParams(route.search)),
    });
  }
}
