import { useState } from "react";
import { Banner } from "@cloudflare/kumo";
import { KeyIcon } from "@phosphor-icons/react";
import type { Namespace } from "../gateway/routes";
import { AdminToken } from "./admin-token";
import { ChaosPanel } from "./chaos-panel";
import { EventTimeline } from "./event-timeline";
import { OverviewCards } from "./overview-cards";
import { QueuePanel } from "./queue-panel";
import { RepoPanel } from "./repo-panel";
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
      className="px-4 sm:px-6 py-5 space-y-6"
    >
      {namespace === "live" && (
        <div className="space-y-3">
          <Banner
            variant="alert"
            icon={<KeyIcon size={18} />}
            title="Live namespace"
            description="This shows real traffic. Chaos, queue and replay controls need an admin token."
          />
          <AdminToken value={adminToken} onChange={setAdminToken} />
        </div>
      )}
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
        <>
          <QueuePanel
            namespace={namespace}
            repoKey={repoKey}
            adminToken={adminToken}
          />
          <EventTimeline namespace={namespace} repoKey={repoKey} />
        </>
      )}
    </section>
  );
}
