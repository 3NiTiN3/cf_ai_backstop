import { overviewStats, type OverviewData } from "./overview-data";
import { Section } from "./section";
import { StatCard } from "./stat-card";
import type { Polled } from "./use-poll";

export function OverviewCards({ data, error }: Polled<OverviewData>) {
  return (
    <Section id="overview-heading" title="Overview">
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl border border-kumo-line bg-kumo-base px-4 py-3 sm:grid-cols-3 xl:grid-cols-5">
        {overviewStats(data).map((stat) => (
          <StatCard
            key={stat.label}
            {...stat}
            detail={stat.detail ?? (error ? "Not available" : null)}
          />
        ))}
      </div>
      {error && (
        <p role="status" className="text-caption text-kumo-danger">
          Could not refresh the overview: {error}
        </p>
      )}
    </Section>
  );
}
