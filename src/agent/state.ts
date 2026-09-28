import { z } from "zod";
import { NamespaceSchema } from "../api/namespace";

export const MAX_WATCHED_REPOS = 20;

const OpsStateSchema = z.object({
  namespace: NamespaceSchema.catch("demo"),
  watchedRepos: z.array(z.string()).catch([]),
  lastSeenIncidentAt: z.number().nullable().catch(null),
});

export type OpsState = z.infer<typeof OpsStateSchema>;

export const INITIAL_OPS_STATE: OpsState = {
  namespace: "demo",
  watchedRepos: [],
  lastSeenIncidentAt: null,
};

export function readOpsState(stored: unknown): OpsState {
  const parsed = OpsStateSchema.safeParse(stored);
  return parsed.success ? parsed.data : INITIAL_OPS_STATE;
}

export type WatchChange =
  { ok: true; state: OpsState } | { ok: false; reason: string };

export function watchRepo(
  state: OpsState,
  repoKey: string,
  watch: boolean,
): WatchChange {
  const others = state.watchedRepos.filter((repo) => repo !== repoKey);
  if (!watch) return { ok: true, state: { ...state, watchedRepos: others } };
  if (others.length >= MAX_WATCHED_REPOS) {
    return {
      ok: false,
      reason: `You can watch at most ${MAX_WATCHED_REPOS} repos`,
    };
  }
  return {
    ok: true,
    state: { ...state, watchedRepos: [...others, repoKey].sort() },
  };
}
