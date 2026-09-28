import { sha256Hex } from "../shared/hash";

const DOCS_URL = "https://docs.github.com/rest";

export async function jsonWithEtag(
  request: Request,
  value: unknown,
): Promise<Response> {
  const body = JSON.stringify(value);
  const etag = `"${await sha256Hex(body)}"`;
  const headers = baseHeaders();
  headers.set("etag", etag);
  if (matchesEtag(request.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { status: 200, headers });
}

export function jsonResponse(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: baseHeaders(),
  });
}

export function githubError(status: number, message: string): Response {
  return jsonResponse({ message, documentation_url: DOCS_URL }, status);
}

function baseHeaders(): Headers {
  const reset = Math.floor(Date.now() / 1000) + 3600;
  return new Headers({
    "content-type": "application/json; charset=utf-8",
    "x-ratelimit-limit": "5000",
    "x-ratelimit-remaining": "4999",
    "x-ratelimit-used": "1",
    "x-ratelimit-resource": "core",
    "x-ratelimit-reset": String(reset),
  });
}

function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""))
    .some((tag) => tag === "*" || tag === etag);
}
