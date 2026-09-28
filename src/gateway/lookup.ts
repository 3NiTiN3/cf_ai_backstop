import { REGISTRY_NAME } from "./registry";
import type { RepoGateway } from "./repo-gateway";
import type { ReplayTarget } from "./replay-trigger";
import { durableObjectName } from "./routes";

// Only return repos the gateway has served, so callers never create new objects.
export async function findRepoGateway(
  env: Env,
  target: ReplayTarget,
): Promise<DurableObjectStub<RepoGateway> | null> {
  const known = await env.Registry.getByName(REGISTRY_NAME).hasRepo(
    target.namespace,
    target.repoKey,
  );
  return known ? env.RepoGateway.getByName(durableObjectName(target)) : null;
}
