import { REGISTRY_NAME } from "../gateway/registry";
import type { ReplayTarget } from "../gateway/replay-trigger";
import { jsonError } from "../gateway/responses";
import { durableObjectName, repoKeyOf } from "../gateway/routes";
import { isAdmin } from "./auth";
import { NamespaceSchema } from "./namespace";
import { REPO_ACTIONS, type RepoAction } from "./repo-actions";

export async function handleRepoRequest(
  request: Request,
  segments: string[],
  env: Env,
): Promise<Response> {
  const [namespace, owner, repo, ...rest] = segments;
  if (repo === undefined) return jsonError(404, "Not Found");
  const target = parseTarget(namespace, owner, repo);
  if (target instanceof Response) return target;
  const matched = matchAction(request.method, rest.join("/"));
  if (matched instanceof Response) return matched;
  const { action, params } = matched;
  if (
    action.admin &&
    target.namespace === "live" &&
    !(await isAdmin(request, env.ADMIN_TOKEN))
  ) {
    return jsonError(
      401,
      "This action on the live namespace needs the admin token",
    );
  }
  // Only act on repos the gateway has served, so this API never creates new objects.
  const known = await env.Registry.getByName(REGISTRY_NAME).hasRepo(
    target.namespace,
    target.repoKey,
  );
  if (!known) return jsonError(404, "No traffic seen for this repo yet");
  const gateway = env.RepoGateway.getByName(durableObjectName(target));
  return action.run(gateway, target, params);
}

function matchAction(
  method: string,
  path: string,
): { action: RepoAction; params: string[] } | Response {
  const candidates = REPO_ACTIONS.flatMap((action) => {
    const match = action.path.exec(path);
    return match ? [{ action, params: match.slice(1) }] : [];
  });
  if (candidates.length === 0) return jsonError(404, "Not Found");
  const found = candidates.find(({ action }) => action.method === method);
  return found ?? jsonError(405, "Method Not Allowed");
}

function parseTarget(
  namespace: string | undefined,
  owner: string | undefined,
  repo: string | undefined,
): ReplayTarget | Response {
  const parsed = NamespaceSchema.safeParse(namespace);
  if (!parsed.success) return jsonError(400, "namespace must be live or demo");
  const repoKey =
    owner === undefined || repo === undefined ? null : repoKeyOf(owner, repo);
  if (repoKey === null) {
    return jsonError(400, "owner and repo must be valid GitHub names");
  }
  return { namespace: parsed.data, repoKey };
}
