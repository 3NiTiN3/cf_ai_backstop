import { useState } from "react";
import { Badge, Button } from "@cloudflare/kumo";
import type { Namespace } from "../gateway/routes";
import {
  actionsFor,
  changeQueuedWrite,
  queueSummary,
  useQueue,
  type QueueAction,
  type QueueEntry,
} from "./queue-data";

const MAX_SHOWN = 20;

const ACTION_LABELS: Record<QueueAction, string> = {
  retry: "Retry",
  drop: "Drop",
};

export function QueuePanel({
  namespace,
  repoKey,
  adminToken,
}: {
  namespace: Namespace;
  repoKey: string;
  adminToken: string;
}) {
  const queue = useQueue(namespace, repoKey);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const locked = namespace === "live" && adminToken === "";

  const run = async (entry: QueueEntry, action: QueueAction) => {
    setBusy(entry.id);
    setFailure(null);
    try {
      await changeQueuedWrite(namespace, repoKey, entry.id, action, adminToken);
      queue.refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="queue-heading" className="space-y-2">
      <h2
        id="queue-heading"
        className="text-sm font-semibold text-kumo-default"
      >
        Write queue for {repoKey}
      </h2>
      {queue.data && (
        <p className="text-xs text-kumo-subtle">{queueSummary(queue.data)}</p>
      )}
      {(failure ?? queue.error) && (
        <p role="status" className="text-xs text-kumo-danger">
          {failure ?? `Could not refresh the queue: ${queue.error}`}
        </p>
      )}
      {queue.data === null ? (
        <p className="text-sm text-kumo-subtle">Loading the queue</p>
      ) : queue.data.items.length === 0 ? (
        <p className="text-sm text-kumo-subtle">
          No queued writes. Safe writes are queued here while the breaker is
          open.
        </p>
      ) : (
        <ul className="rounded-xl border border-kumo-line bg-kumo-base divide-y divide-kumo-line">
          {queue.data.items.slice(0, MAX_SHOWN).map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm"
            >
              <Badge variant="secondary">{statusLabel(entry)}</Badge>
              <span className="min-w-0 flex-1 break-all text-kumo-default">
                {entry.method} {entry.path}
              </span>
              <span className="text-xs text-kumo-subtle tabular-nums">
                {entry.attempts} {entry.attempts === 1 ? "attempt" : "attempts"}
              </span>
              {actionsFor(entry.status).map((action) => (
                <Button
                  key={action}
                  size="sm"
                  variant="secondary"
                  disabled={locked || busy !== null}
                  aria-label={`${ACTION_LABELS[action]} ${entry.method} ${entry.path}`}
                  onClick={() => void run(entry, action)}
                >
                  {ACTION_LABELS[action]}
                </Button>
              ))}
              {entry.lastError && (
                <p className="basis-full text-xs text-kumo-danger break-words">
                  Last error: {entry.lastError}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function statusLabel(entry: QueueEntry): string {
  if (entry.status === "done" && entry.resultStatus !== null) {
    return `done ${entry.resultStatus}`;
  }
  return entry.status.replace("_", " ");
}
