import { z } from "zod";
import {
  CHAOS_MODES,
  MAX_CHAOS_LATENCY_MS,
  chaosConfig,
} from "../gateway/chaos";
import { REGISTRY_NAME } from "../gateway/registry";
import { jsonError } from "../gateway/responses";
import { isAdmin } from "./auth";
import { readJson } from "./body";
import { NamespaceQuery, NamespaceSchema } from "./namespace";

const ChaosRequest = z.strictObject({
  namespace: NamespaceSchema,
  mode: z.enum(CHAOS_MODES),
  errorRate: z.number().min(0).max(1).optional(),
  latencyMs: z.number().int().min(0).max(MAX_CHAOS_LATENCY_MS).optional(),
});

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
    chaosConfig(body.data.mode, body.data.errorRate, body.data.latencyMs),
  );
  return Response.json({ namespace, ...config });
}
