import { tool } from "ai";
import { z } from "zod";
import { RepoInput, notARepo, parseRepo } from "./inputs";
import { watchRepo, type OpsState } from "./state";

export interface MemoryContext {
  state: () => OpsState;
  save: (state: OpsState) => void;
}

export function createMemoryTools(context: MemoryContext) {
  return {
    watchRepo: tool({
      description:
        "Add a repo to the user's watch list or remove it. The list is remembered across conversations. Use when the user asks to watch, follow, unwatch or stop following a repo.",
      inputSchema: z.object({
        repo: RepoInput,
        watch: z.boolean().describe("true to watch, false to stop watching."),
      }),
      execute: async ({ repo, watch }) => {
        const repoKey = parseRepo(repo);
        if (repoKey === null) return notARepo(repo);
        const change = watchRepo(context.state(), repoKey, watch);
        if (!change.ok) return { error: change.reason };
        context.save(change.state);
        return { watchedRepos: change.state.watchedRepos };
      },
    }),
  };
}
