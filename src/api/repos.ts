import { REGISTRY_NAME } from "../gateway/registry";
import { jsonError } from "../gateway/responses";
import { durableObjectName, repoKeyOf } from "../gateway/routes";
import { NamespaceSchema } from "./namespace";

export async function getRepoHealth(
  segments: string[],
  env: Env,
): Promise<Response> {
  const [namespace, owner, repo] = segments;
  const params = NamespaceSchema.safeParse(namespace);
  if (!params.success) return jsonError(400, "namespace must be live or demo");
  const repoKey =
    owner === undefined || repo === undefined ? null : repoKeyOf(owner, repo);
  if (repoKey === null) {
    return jsonError(400, "owner and repo must be valid GitHub names");
  }
  const route = { namespace: params.data, repoKey };
  // Only look up repos the gateway has served, so this endpoint never creates new objects.
  const known = await env.Registry.getByName(REGISTRY_NAME).hasRepo(
    route.namespace,
    repoKey,
  );
  if (!known) return jsonError(404, "No traffic seen for this repo yet");
  const gateway = env.RepoGateway.getByName(durableObjectName(route));
  return Response.json({ ...route, ...(await gateway.getHealth()) });
}
