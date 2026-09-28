import { DurableObject } from "cloudflare:workers";
import { CacheStore } from "./cache";
import { ReadThroughCache } from "./read-through";
import { fromUpstream } from "./responses";
import type { GatewayRoute } from "./routes";
import { fetchUpstream, toUpstreamRequest } from "./upstream";

export class RepoGateway extends DurableObject<Env> {
  private readonly reads = new ReadThroughCache(
    new CacheStore(this.ctx.storage.sql),
    { now: () => Date.now(), upstream: (ns, req) => fetchUpstream(ns, req) },
  );

  async handle(request: Request, route: GatewayRoute): Promise<Response> {
    if (request.method === "GET") return this.reads.read(request, route);
    const result = await fetchUpstream(
      route.namespace,
      toUpstreamRequest(request, route),
    );
    return fromUpstream(result, "BYPASS");
  }
}
