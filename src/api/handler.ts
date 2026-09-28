import { REGISTRY_NAME } from "../gateway/registry";
import { jsonError } from "../gateway/responses";
import { bodyTooLarge } from "./body";
import { getChaos, postChaos } from "./chaos";
import { NamespaceQuery } from "./namespace";
import { handleRepoRequest } from "./repos";

const REPOS_PREFIX = "/api/repos/";

export async function handleApiRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;
  return bodyTooLarge(request) ?? route(request, url, env);
}

function route(request: Request, url: URL, env: Env): Promise<Response> {
  const { pathname } = url;
  const method = request.method;
  if (pathname === "/api/overview") {
    return method === "GET" ? overview(url, env) : notAllowed();
  }
  if (pathname === "/api/chaos") {
    if (method === "GET") return getChaos(url, env);
    if (method === "POST") return postChaos(request, env);
    return notAllowed();
  }
  if (pathname.startsWith(REPOS_PREFIX)) {
    const segments = pathname.slice(REPOS_PREFIX.length).split("/");
    return handleRepoRequest(request, segments, env);
  }
  return notFound();
}

async function overview(url: URL, env: Env): Promise<Response> {
  const query = NamespaceQuery.safeParse({
    namespace: url.searchParams.get("namespace") ?? undefined,
  });
  if (!query.success) return jsonError(400, "namespace must be live or demo");
  const registry = env.Registry.getByName(REGISTRY_NAME);
  return Response.json(await registry.overview(query.data.namespace));
}

function notFound(): Promise<Response> {
  return Promise.resolve(jsonError(404, "Not Found"));
}

function notAllowed(): Promise<Response> {
  return Promise.resolve(jsonError(405, "Method Not Allowed"));
}
