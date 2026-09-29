import type { Namespace } from "../gateway/routes";
import { EventTimeline } from "./event-timeline";
import { QueuePanel } from "./queue-panel";
import { RepoPicker } from "./repo-picker";
import type { RepoRow } from "./repo-rows";

export function RepoActivity({
  namespace,
  rows,
  repoKey,
  adminToken,
  onSelect,
}: {
  namespace: Namespace;
  rows: RepoRow[];
  repoKey: string | null;
  adminToken: string;
  onSelect: (repoKey: string) => void;
}) {
  if (repoKey === null) {
    return (
      <p className="text-body text-kumo-subtle">
        No repos yet. Play the story or send a request through the gateway.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-subhead text-kumo-subtle">Repo</span>
        <RepoPicker
          label="Repo"
          options={rows}
          value={repoKey}
          onChange={onSelect}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <QueuePanel
          namespace={namespace}
          repoKey={repoKey}
          adminToken={adminToken}
        />
        <EventTimeline namespace={namespace} repoKey={repoKey} />
      </div>
    </div>
  );
}
