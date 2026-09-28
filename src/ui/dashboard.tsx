import { useState } from "react";
import { Banner } from "@cloudflare/kumo";
import { KeyIcon } from "@phosphor-icons/react";
import type { Namespace } from "../gateway/routes";
import { EventTimeline } from "./event-timeline";
import { OverviewCards } from "./overview-cards";
import { RepoPanel } from "./repo-panel";
import { pickRepo, repoRows } from "./repo-rows";
import { useOverview } from "./use-overview";

export function Dashboard({ namespace }: { namespace: Namespace }) {
  const overview = useOverview(namespace);
  const [selected, setSelected] = useState<string | null>(null);
  const rows = overview.data ? repoRows(overview.data) : null;
  const repoKey = rows ? pickRepo(rows, selected) : null;

  return (
    <section
      aria-label="Gateway dashboard"
      className="px-4 sm:px-6 py-5 space-y-6"
    >
      {namespace === "live" && (
        <Banner
          variant="alert"
          icon={<KeyIcon size={18} />}
          title="Live namespace"
          description="This shows real traffic. Chaos, queue and replay controls need an admin token."
        />
      )}
      <OverviewCards {...overview} />
      <RepoPanel
        namespace={namespace}
        rows={rows}
        selected={repoKey}
        onSelect={setSelected}
      />
      {repoKey && <EventTimeline namespace={namespace} repoKey={repoKey} />}
    </section>
  );
}
