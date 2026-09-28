import type { RepoGateway } from "../gateway/repo-gateway";
import { REGISTRY_NAME } from "../gateway/registry";
import type { ReplayTarget } from "../gateway/replay-trigger";
import { jsonError } from "../gateway/responses";
import { durableObjectName, repoKeyOf } from "../gateway/routes";
import { isAdmin } from "./auth";
import { NamespaceSchema } from "./namespace";

interface RepoAction {
  method: string;
  admin: boolean;
  run: (
    gateway: DurableObjectStub<RepoGateway>,
    target: ReplayTarget,
  ) => Promise<unknown>;
}

const ACTIONS = new Map<string, RepoAction>([
  [
    "",
    {
      method: "GET",
      admin: false,
      run: async (gateway, target) => ({
        ...target,
        ...(await gateway.getHealth()),
      }),
    },
  ],
  [
    "replay",
    {
      method: "POST",
      admin: true,
      run: (gateway, target) => gateway.triggerReplay(target),
    },
  ],
  [
    "pause",
    {
      method: "POST",
      admin: true,
      run: (gateway, target) => gateway.setWritesPaused(target, true),
    },
  ],
  [
    "resume",
    {
      method: "POST",
      admin: true,
      run: (gateway, target) => gateway.setWritesPaused(target, false),
    },
  ],
]);

export async function handleRepoRequest(
  request: Request,
  segments: string[],
  env: Env,
): Promise<Response> {
  const [namespace, owner, repo, ...rest] = segments;
  if (repo === undefined) return jsonError(404, "Not Found");
  const target = parseTarget(namespace, owner, repo);
  if (target instanceof Response) return target;
  const action = ACTIONS.get(rest.join("/"));
  if (!action) return jsonError(404, "Not Found");
  if (request.method !== action.method) {
    return jsonError(405, "Method Not Allowed");
  }
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
  return Response.json(await action.run(gateway, target));
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
