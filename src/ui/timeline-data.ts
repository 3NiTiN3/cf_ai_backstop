import { useCallback } from "react";
import { z } from "zod";
import type { Namespace } from "../gateway/routes";
import { getJson } from "./api-client";
import { usePoll } from "./use-poll";

const TimelineSchema = z.object({
  entries: z.array(
    z.object({
      at: z.number(),
      kind: z.enum(["breaker", "chaos", "queue", "replay", "incident"]),
      text: z.string(),
    }),
  ),
});

export type TimelineEntry = z.infer<typeof TimelineSchema>["entries"][number];

export function useTimeline(namespace: Namespace, repoKey: string) {
  const load = useCallback(
    async (signal: AbortSignal) =>
      (
        await getJson(
          `/api/repos/${namespace}/${repoKey}/timeline`,
          TimelineSchema,
          signal,
        )
      ).entries,
    [namespace, repoKey],
  );
  return usePoll(`${namespace}:${repoKey}`, load);
}
