import { overviewStats, type OverviewData } from "./overview-data";
import { StatCard } from "./stat-card";
import type { Polled } from "./use-poll";

export function OverviewCards({ data, error }: Polled<OverviewData>) {
  return (
    <section aria-labelledby="overview-heading" className="space-y-2">
      <h2
        id="overview-heading"
        className="text-sm font-semibold text-kumo-default"
      >
        Overview
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {overviewStats(data).map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>
      {error && (
        <p role="status" className="text-xs text-kumo-danger">
          Could not refresh the overview: {error}
        </p>
      )}
    </section>
  );
}
