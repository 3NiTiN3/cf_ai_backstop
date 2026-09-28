import { z } from "zod";
import { REGISTRY_NAME } from "../gateway/registry";
import { jsonError } from "../gateway/responses";

const OverviewQuery = z.object({
  namespace: z.enum(["live", "demo"]).default("demo"),
});

export async function handleApiRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;
  if (url.pathname === "/api/overview" && request.method === "GET") {
    return overview(url, env);
  }
  return jsonError(404, "Not Found");
}

async function overview(url: URL, env: Env): Promise<Response> {
  const query = OverviewQuery.safeParse({
    namespace: url.searchParams.get("namespace") ?? undefined,
  });
  if (!query.success) return jsonError(400, "namespace must be live or demo");
  const registry = env.Registry.getByName(REGISTRY_NAME);
  return Response.json(await registry.overview(query.data.namespace));
}
