import { useCallback } from "react";
import { z } from "zod";
import type { Namespace } from "../gateway/routes";
import { percent } from "../shared/percent";
import { getJson } from "./api-client";
import { usePoll } from "./use-poll";

const IncidentsSchema = z.object({
  incidents: z.array(
    z.object({
      id: z.string(),
      repo: z.string(),
      startedAt: z.number(),
      endedAt: z.number().nullable(),
      peakErrorRate: z.number(),
      readsServedStale: z.number(),
      writesQueued: z.number(),
      writesReplayed: z.number(),
      summary: z.string().nullable(),
    }),
  ),
});

export type Incident = z.infer<typeof IncidentsSchema>["incidents"][number];

export function incidentFigures(incident: Incident): [string, string][] {
  return [
    ["Stale reads", incident.readsServedStale.toLocaleString("en-US")],
    ["Queued", incident.writesQueued.toLocaleString("en-US")],
    ["Replayed", incident.writesReplayed.toLocaleString("en-US")],
    ["Peak errors", `${percent(incident.peakErrorRate)}%`],
  ];
}

export function incidentWindow(incident: Incident): string {
  const start = clock(incident.startedAt);
  if (incident.endedAt === null) return `Since ${start}`;
  const seconds = Math.max(
    0,
    Math.round((incident.endedAt - incident.startedAt) / 1000),
  );
  const length = seconds < 120 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;
  return `${start} to ${clock(incident.endedAt)}, ${length}`;
}

export function useIncidents(namespace: Namespace) {
  const load = useCallback(
    async (signal: AbortSignal) =>
      (
        await getJson(
          `/api/incidents?namespace=${namespace}`,
          IncidentsSchema,
          signal,
        )
      ).incidents,
    [namespace],
  );
  return usePoll(`incidents:${namespace}`, load);
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString("en-GB", { hour12: false });
}
