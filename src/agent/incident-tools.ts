import { tool } from "ai";
import { z } from "zod";
import type { Namespace } from "../gateway/routes";
import { listIncidents } from "../gateway/incident-query";
import { NamespaceInput, RepoInput, notARepo, parseRepo } from "./inputs";
import type { OpsState } from "./state";
import { incidentTime, incidentView } from "./views";

const INCIDENT_LIMIT = 10;

export interface IncidentToolContext {
  env: Env;
  namespace: Namespace;
  state: () => OpsState;
  save: (state: OpsState) => void;
}

export function createIncidentTools(context: IncidentToolContext) {
  return {
    listIncidents: tool({
      description: `Past and ongoing incidents (times the breaker opened), newest first, with stale reads, queued and replayed writes and a short summary. Leave out repo to cover the whole namespace; each incident says if it is new since the user last saw incidents. Use for questions about outages, incidents, what happened or what is new.`,
      inputSchema: z.object({
        namespace: NamespaceInput,
        repo: RepoInput.optional(),
      }),
      execute: async ({ namespace, repo }) => {
        const state = context.state();
        const repoKey = repo === undefined ? null : parseRepo(repo);
        if (repo !== undefined && repoKey === null) return notARepo(repo);
        const resolved = namespace ?? context.namespace;
        const incidents = await listIncidents(
          context.env,
          resolved,
          repoKey,
          INCIDENT_LIMIT,
        );
        if (incidents === null) {
          return { error: `No traffic seen for ${resolved}/${repoKey} yet` };
        }
        if (repoKey === null && incidents.length > 0) {
          const latest = Math.max(...incidents.map(incidentTime));
          context.save({
            ...state,
            lastSeenIncidentAt: Math.max(state.lastSeenIncidentAt ?? 0, latest),
          });
        }
        return {
          namespace: resolved,
          count: incidents.length,
          incidents: incidents.map((incident) =>
            incidentView(incident, state.lastSeenIncidentAt),
          ),
        };
      },
    }),
  };
}
