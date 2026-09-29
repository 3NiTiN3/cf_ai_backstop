import type { OverviewStat } from "./overview-data";

export function StatCard({ label, value, detail, alert }: OverviewStat) {
  return (
    <div className="min-w-0">
      <p className="text-caption text-kumo-subtle">{label}</p>
      <p
        key={value ?? "none"}
        className={`mt-1 text-figure animate-tick ${alert ? "text-kumo-warning" : "text-kumo-default"}`}
      >
        {value ?? "-"}
      </p>
      <p className="mt-0.5 text-caption text-kumo-subtle">
        {detail ?? "Loading"}
      </p>
    </div>
  );
}
