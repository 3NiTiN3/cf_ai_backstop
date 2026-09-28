import { z } from "zod";
import { CHAOS_MODES, type ChaosConfig } from "../gateway/chaos";
import { REGISTRY_NAME } from "../gateway/registry";
import { jsonError } from "../gateway/responses";
import { isAdmin } from "./auth";
import { readJson } from "./body";
import { NamespaceQuery, NamespaceSchema } from "./namespace";

const DEFAULT_ERROR_RATE = 0.5;
const DEFAULT_LATENCY_MS = 1500;
const MAX_LATENCY_MS = 10_000;

const ChaosRequest = z.strictObject({
  namespace: NamespaceSchema,
  mode: z.enum(CHAOS_MODES),
  errorRate: z.number().min(0).max(1).optional(),
  latencyMs: z.number().int().min(0).max(MAX_LATENCY_MS).optional(),
});

type ChaosRequest = z.infer<typeof ChaosRequest>;

export async function getChaos(url: URL, env: Env): Promise<Response> {
  const query = NamespaceQuery.safeParse({
    namespace: url.searchParams.get("namespace") ?? undefined,
  });
  if (!query.success) return jsonError(400, "namespace must be live or demo");
  const { namespace } = query.data;
  const config =
    await env.Registry.getByName(REGISTRY_NAME).getChaos(namespace);
  return Response.json({ namespace, ...config });
}

export async function postChaos(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request, ChaosRequest);
  if (!body.ok) return body.error;
  const { namespace } = body.data;
  if (namespace === "live" && !(await isAdmin(request, env.ADMIN_TOKEN))) {
    return jsonError(
      401,
      "Changing chaos on the live namespace needs the admin token",
    );
  }
  const config = await env.Registry.getByName(REGISTRY_NAME).setChaos(
    namespace,
    toConfig(body.data),
  );
  return Response.json({ namespace, ...config });
}

function toConfig(request: ChaosRequest): ChaosConfig {
  return {
    mode: request.mode,
    errorRate:
      request.mode === "errors" ? (request.errorRate ?? DEFAULT_ERROR_RATE) : 0,
    latencyMs:
      request.mode === "latency"
        ? (request.latencyMs ?? DEFAULT_LATENCY_MS)
        : 0,
  };
}
