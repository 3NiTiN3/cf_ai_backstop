import { z } from "zod";
import { listIncidents } from "../gateway/incident-query";
import { jsonError } from "../gateway/responses";
import { repoKeyFromName } from "../gateway/routes";
import { NamespaceSchema } from "./namespace";

const INCIDENT_LIMIT = 20;

const IncidentQuery = z.object({
  namespace: NamespaceSchema.default("demo"),
  repo: z.string().max(200).optional(),
});

export async function getIncidents(url: URL, env: Env): Promise<Response> {
  const query = IncidentQuery.safeParse({
    namespace: url.searchParams.get("namespace") ?? undefined,
    repo: url.searchParams.get("repo") ?? undefined,
  });
  if (!query.success) return jsonError(400, "namespace must be live or demo");
  const { namespace, repo } = query.data;
  const repoKey = repo === undefined ? null : repoKeyFromName(repo);
  if (repo !== undefined && repoKey === null) {
    return jsonError(400, "repo must be owner/name");
  }
  const incidents = await listIncidents(
    env,
    namespace,
    repoKey,
    INCIDENT_LIMIT,
  );
  if (incidents === null) {
    return jsonError(404, "No traffic seen for this repo yet");
  }
  return Response.json({ namespace, incidents });
}
