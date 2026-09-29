import { useState } from "react";
import { Button } from "@cloudflare/kumo";
import type { Namespace } from "../gateway/routes";
import { PanelBody } from "./panel-body";
import { Section } from "./section";
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
    <Section
      id="queue-heading"
      title="Queue"
      level={3}
      aside={
        queue.data && (
          <span className="text-caption text-kumo-subtle">
            {queueSummary(queue.data)}
          </span>
        )
      }
    >
      {failure && (
        <p role="alert" className="text-caption text-kumo-danger">
          {failure}
        </p>
      )}
      <PanelBody
        data={queue.data}
        error={queue.error}
        what="the queue"
        skeletonClass="h-16"
      >
        {({ items }) =>
          items.length === 0 ? (
            <p className="text-body text-kumo-subtle">No queued writes.</p>
          ) : (
            <ul className="rounded-xl border border-kumo-line bg-kumo-base divide-y divide-kumo-line">
              {items.slice(0, MAX_SHOWN).map((entry) => (
                <QueueItem
                  key={entry.id}
                  entry={entry}
                  disabled={locked || busy !== null}
                  onAction={(action) => void run(entry, action)}
                />
              ))}
            </ul>
          )
        }
      </PanelBody>
    </Section>
  );
}

function QueueItem({
  entry,
  disabled,
  onAction,
}: {
  entry: QueueEntry;
  disabled: boolean;
  onAction: (action: QueueAction) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-body animate-enter">
      <span className="w-16 shrink-0 font-figures text-caption text-kumo-subtle">
        {statusLabel(entry)}
      </span>
      <span className="min-w-0 flex-1 break-all text-kumo-default">
        {entry.method} {entry.path}
      </span>
      <span className="font-figures text-caption text-kumo-subtle">
        {entry.attempts} {entry.attempts === 1 ? "attempt" : "attempts"}
      </span>
      {actionsFor(entry.status).map((action) => (
        <Button
          key={action}
          size="sm"
          variant="secondary"
          disabled={disabled}
          aria-label={`${ACTION_LABELS[action]} ${entry.method} ${entry.path}`}
          onClick={() => onAction(action)}
        >
          {ACTION_LABELS[action]}
        </Button>
      ))}
      {entry.lastError && (
        <p className="basis-full text-caption text-kumo-danger break-words">
          Last error: {entry.lastError}
        </p>
      )}
    </li>
  );
}

function statusLabel(entry: QueueEntry): string {
  if (entry.status === "done" && entry.resultStatus !== null) {
    return `done ${entry.resultStatus}`;
  }
  return entry.status.replace("_", " ");
}
