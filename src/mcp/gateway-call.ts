import { z } from "zod";
import { handleGatewayRequest } from "../gateway/handler";
import { gatewayPrefix, type Namespace } from "../gateway/routes";

const MAX_BODY_CHARS = 20_000;

const INTERNAL_ORIGIN = "https://backstop.internal";

export const GitHubPath = z
  .string()
  .max(500)
  .regex(
    /^\/[A-Za-z0-9._~\-/%?=&,:+]*$/,
    "must be a GitHub API path such as /repos/owner/name",
  )
  .describe(
    "GitHub REST API path, for example /repos/demo/api/issues?state=open",
  );

export interface GatewayCall {
  namespace: Namespace;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  token: string | null;
  body?: unknown;
  idempotencyKey?: string;
}

export interface GatewayReply {
  status: number;
  cache: string | null;
  mode: string | null;
  coalesced: boolean;
  queuedId: string | null;
  body: string;
  truncated: boolean;
}

export async function callGateway(
  env: Env,
  call: GatewayCall,
): Promise<GatewayReply> {
  const response = await handleGatewayRequest(toRequest(call), env);
  if (!response) throw new Error("The path is not a GitHub API route");
  const text = await response.text();
  return {
    status: response.status,
    cache: response.headers.get("x-backstop-cache"),
    mode: response.headers.get("x-backstop-mode"),
    coalesced: response.headers.get("x-backstop-coalesced") === "1",
    queuedId: response.headers.get("x-backstop-queued"),
    body: text.slice(0, MAX_BODY_CHARS),
    truncated: text.length > MAX_BODY_CHARS,
  };
}

function toRequest(call: GatewayCall): Request {
  const prefix = gatewayPrefix(call.namespace);
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "backstop-mcp",
  };
  if (call.token) headers.authorization = `Bearer ${call.token}`;
  if (call.idempotencyKey) headers["idempotency-key"] = call.idempotencyKey;
  if (call.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`${INTERNAL_ORIGIN}${prefix}${call.path}`, {
    method: call.method,
    headers,
    body: call.body === undefined ? undefined : JSON.stringify(call.body),
  });
}
