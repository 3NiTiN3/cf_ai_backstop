import { handleMockRequest, type MockOptions } from "../mock/github";
import type { GatewayRoute, Namespace } from "./routes";

export type UpstreamOutcome =
  | "ok"
  | "client_error"
  | "server_error"
  | "rate_limited"
  | "timeout"
  | "network_error"
  | "circuit_open";

export interface UpstreamResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  etag: string | null;
  lastModified: string | null;
  latencyMs: number;
  outcome: UpstreamOutcome;
}

export interface UpstreamDeps {
  fetch: (request: Request) => Promise<Response>;
  timeoutMs: number;
  mock?: MockOptions;
}

const GITHUB_ORIGIN = "https://api.github.com";
const USER_AGENT = "cf-ai-backstop";
const FORWARDED_HEADERS = [
  "authorization",
  "accept",
  "x-github-api-version",
  "content-type",
];
const KEPT_RESPONSE_HEADERS = [
  "content-type",
  "etag",
  "last-modified",
  "link",
  "retry-after",
];

const defaultDeps: UpstreamDeps = {
  fetch: (request) => fetch(request),
  timeoutMs: 10_000,
};

export function toUpstreamRequest(
  request: Request,
  route: GatewayRoute,
  extraHeaders: Record<string, string> = {},
): Request {
  const headers: Record<string, string> = { ...extraHeaders };
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  return githubRequest(
    request.method,
    `${route.upstreamPath}${route.search}`,
    headers,
    request.body,
  );
}

export function githubRequest(
  method: string,
  pathWithQuery: string,
  headers: Record<string, string>,
  body: BodyInit | null,
): Request {
  return new Request(`${GITHUB_ORIGIN}${pathWithQuery}`, {
    method,
    headers: { "user-agent": USER_AGENT, ...headers },
    body,
  });
}

export async function fetchUpstream(
  namespace: Namespace,
  request: Request,
  deps: UpstreamDeps = defaultDeps,
): Promise<UpstreamResult> {
  const started = Date.now();
  try {
    const response =
      namespace === "demo"
        ? await handleMockRequest(request, deps.mock)
        : await deps.fetch(
            new Request(request, {
              signal: AbortSignal.timeout(deps.timeoutMs),
            }),
          );
    const body = await response.text();
    return {
      status: response.status,
      headers: keptHeaders(response.headers),
      body,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      latencyMs: Date.now() - started,
      outcome: classifyResponse(response),
    };
  } catch (error) {
    return failedResult(error, Date.now() - started);
  }
}

function classifyResponse(response: Response): UpstreamOutcome {
  const { status, headers } = response;
  if (status < 400) return "ok";
  if (status === 429) return "rate_limited";
  if (status === 403 && isRateLimited403(headers)) return "rate_limited";
  if (status === 408) return "timeout";
  if (status >= 500) return "server_error";
  return "client_error";
}

// GitHub signals primary and secondary rate limits with 403 as well as 429.
function isRateLimited403(headers: Headers): boolean {
  return (
    headers.get("x-ratelimit-remaining") === "0" || headers.has("retry-after")
  );
}

function keptHeaders(headers: Headers): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of headers) {
    if (
      KEPT_RESPONSE_HEADERS.includes(name) ||
      name.startsWith("x-ratelimit-")
    ) {
      kept[name] = value;
    }
  }
  return kept;
}

function failedResult(error: unknown, latencyMs: number): UpstreamResult {
  const timedOut =
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError");
  return {
    status: timedOut ? 504 : 502,
    headers: {},
    body: "",
    etag: null,
    lastModified: null,
    latencyMs,
    outcome: timedOut ? "timeout" : "network_error",
  };
}
