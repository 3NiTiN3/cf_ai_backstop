import { useState } from "react";
import type { Namespace } from "../gateway/routes";
import { ControlBar } from "./control-bar";
import { IncidentList } from "./incident-list";
import { OverviewCards } from "./overview-cards";
import type { OverviewData } from "./overview-data";
import { RepoActivity } from "./repo-activity";
import { RepoPanel } from "./repo-panel";
import { pickRepo, repoRows } from "./repo-rows";
import { SlidingTabs, TabPanel, type TabItem } from "./sliding-tabs";
import type { Polled } from "./use-poll";

type DashboardTab = "overview" | "activity" | "incidents";

const TABS: TabItem<DashboardTab>[] = [
  { value: "overview", label: "Overview" },
  { value: "activity", label: "Activity" },
  { value: "incidents", label: "Incidents" },
];

export function Dashboard({
  namespace,
  overview,
}: {
  namespace: Namespace;
  overview: Polled<OverviewData>;
}) {
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [selected, setSelected] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState("");
  const rows = overview.data ? repoRows(overview.data) : null;
  const repoKey = rows ? pickRepo(rows, selected) : null;

  const openRepo = (key: string) => {
    setSelected(key);
    setTab("activity");
  };

  return (
    <section
      aria-label="Gateway dashboard"
      className="flex flex-col px-4 pt-4 sm:px-6 lg:h-full"
    >
      <div className="shrink-0">
        <ControlBar
          namespace={namespace}
          adminToken={adminToken}
          onAdminTokenChange={setAdminToken}
        />
      </div>
      <div className="sticky top-14 z-[1] -mx-4 shrink-0 bg-kumo-elevated/85 px-4 pt-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:static">
        <SlidingTabs
          id="dashboard"
          label="Dashboard sections"
          tabs={TABS}
          value={tab}
          onChange={setTab}
        />
      </div>
      <TabPanel id="dashboard" value={tab}>
        {tab === "overview" && (
          <>
            <OverviewCards data={overview.data} error={overview.error} />
            <RepoPanel
              namespace={namespace}
              rows={rows}
              error={overview.error}
              selected={repoKey}
              onSelect={openRepo}
            />
          </>
        )}
        {tab === "activity" && (
          <RepoActivity
            namespace={namespace}
            rows={rows ?? []}
            repoKey={repoKey}
            adminToken={adminToken}
            onSelect={setSelected}
          />
        )}
        {tab === "incidents" && <IncidentList namespace={namespace} />}
      </TabPanel>
    </section>
  );
}
