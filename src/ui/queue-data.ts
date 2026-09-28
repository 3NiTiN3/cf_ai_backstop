import { useCallback } from "react";
import { z } from "zod";
import type { Namespace } from "../gateway/routes";
import { QUEUE_STATUSES, type QueueStatus } from "../gateway/write-queue";
import { getJson, postJson } from "./api-client";
import { usePoll } from "./use-poll";

const QueueSchema = z.object({
  counts: z.record(z.enum(QUEUE_STATUSES), z.number()),
  items: z.array(
    z.object({
      id: z.string(),
      method: z.string(),
      path: z.string(),
      status: z.enum(QUEUE_STATUSES),
      attempts: z.number(),
      lastError: z.string().nullable(),
      resultStatus: z.number().nullable(),
    }),
  ),
});

export type QueueData = z.infer<typeof QueueSchema>;
export type QueueEntry = QueueData["items"][number];
export type QueueAction = "retry" | "drop";

const ACTIONS_BY_STATUS: Record<QueueStatus, QueueAction[]> = {
  pending: ["drop"],
  in_flight: [],
  done: [],
  failed: ["retry", "drop"],
  dropped: [],
};

export function actionsFor(status: QueueStatus): QueueAction[] {
  return ACTIONS_BY_STATUS[status];
}

export function queueSummary({ counts }: QueueData): string {
  const waiting = counts.pending + counts.in_flight;
  return `${waiting} waiting, ${counts.done} done, ${counts.failed} failed, ${counts.dropped} dropped`;
}

export function useQueue(namespace: Namespace, repoKey: string) {
  const load = useCallback(
    (signal: AbortSignal) =>
      getJson(`/api/repos/${namespace}/${repoKey}/queue`, QueueSchema, signal),
    [namespace, repoKey],
  );
  return usePoll(`${namespace}:${repoKey}`, load);
}

export function changeQueuedWrite(
  namespace: Namespace,
  repoKey: string,
  id: string,
  action: QueueAction,
  adminToken: string,
): Promise<void> {
  return postJson(
    `/api/repos/${namespace}/${repoKey}/queue/${encodeURIComponent(id)}/${action}`,
    {},
    adminToken,
  );
}
