import type { CacheEntry } from "./cache";
import type { UpstreamResult } from "./upstream";

export type CacheStatus = "HIT" | "MISS" | "BYPASS";

const CACHE_HEADER = "x-backstop-cache";

export function jsonError(status: number, message: string): Response {
  return Response.json({ message }, { status });
}

export function fromCache(entry: CacheEntry, cache: CacheStatus): Response {
  const headers = new Headers(entry.headers);
  headers.set(CACHE_HEADER, cache);
  return new Response(entry.body, { status: entry.status, headers });
}

export function fromUpstream(
  result: UpstreamResult,
  cache: CacheStatus,
): Response {
  const response = unreachableError(result) ?? bodyResponse(result);
  response.headers.set(CACHE_HEADER, cache);
  return response;
}

function unreachableError(result: UpstreamResult): Response | null {
  if (result.outcome === "timeout" && result.body === "") {
    return jsonError(result.status, "GitHub did not respond in time");
  }
  if (result.outcome === "network_error") {
    return jsonError(result.status, "Could not reach GitHub");
  }
  return null;
}

function bodyResponse(result: UpstreamResult): Response {
  const nullBody = result.status === 304 || result.status === 204;
  return new Response(nullBody ? null : result.body, {
    status: result.status,
    headers: result.headers,
  });
}
