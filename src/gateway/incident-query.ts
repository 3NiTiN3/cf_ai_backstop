import type { Incident } from "./incidents";
import { findRepoGateway } from "./lookup";
import { REGISTRY_NAME } from "./registry";
import { durableObjectName, type Namespace } from "./routes";

export type RepoIncident = Incident & { repo: string };

const MAX_REPOS_SCANNED = 20;

export async function listIncidents(
  env: Env,
  namespace: Namespace,
  repoKey: string | null,
  limit: number,
): Promise<RepoIncident[] | null> {
  if (repoKey !== null) {
    const gateway = await findRepoGateway(env, { namespace, repoKey });
    if (!gateway) return null;
    return tag(repoKey, await gateway.listIncidents(limit));
  }
  const overview =
    await env.Registry.getByName(REGISTRY_NAME).overview(namespace);
  const repos = overview.repos.slice(0, MAX_REPOS_SCANNED);
  const lists = await Promise.all(
    repos.map(async ({ repoKey: key }) => {
      const gateway = env.RepoGateway.getByName(
        durableObjectName({ namespace, repoKey: key }),
      );
      return tag(key, await gateway.listIncidents(limit));
    }),
  );
  return lists
    .flat()
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}

function tag(repo: string, incidents: Incident[]): RepoIncident[] {
  return incidents.map((incident) => ({ ...incident, repo }));
}
