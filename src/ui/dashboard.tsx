import { useState } from "react";
import type { Namespace } from "../gateway/routes";
import { ChaosPanel } from "./chaos-panel";
import { EventTimeline } from "./event-timeline";
import { LiveBar } from "./live-bar";
import { OverviewCards } from "./overview-cards";
import { QueuePanel } from "./queue-panel";
import { RepoPanel } from "./repo-panel";
import { Section } from "./section";
import { StoryPanel } from "./story-panel";
import { pickRepo, repoRows } from "./repo-rows";
import { useOverview } from "./use-overview";

export function Dashboard({ namespace }: { namespace: Namespace }) {
  const overview = useOverview(namespace);
  const [selected, setSelected] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState("");
  const rows = overview.data ? repoRows(overview.data) : null;
  const repoKey = rows ? pickRepo(rows, selected) : null;

  return (
    <section
      aria-label="Gateway dashboard"
      className="space-y-6 px-4 py-4 sm:px-6"
    >
      {namespace === "live" && (
        <LiveBar adminToken={adminToken} onAdminTokenChange={setAdminToken} />
      )}
      {namespace === "demo" && <StoryPanel />}
      <OverviewCards data={overview.data} error={overview.error} />
      <ChaosPanel namespace={namespace} adminToken={adminToken} />
      <RepoPanel
        namespace={namespace}
        rows={rows}
        error={overview.error}
        selected={repoKey}
        onSelect={setSelected}
      />
      {repoKey && (
        <Section id="repo-heading" title={repoKey}>
          <div className="space-y-4">
            <QueuePanel
              namespace={namespace}
              repoKey={repoKey}
              adminToken={adminToken}
            />
            <EventTimeline namespace={namespace} repoKey={repoKey} />
          </div>
        </Section>
      )}
    </section>
  );
}
