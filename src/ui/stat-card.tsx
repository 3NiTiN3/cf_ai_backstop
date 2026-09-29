import type { OverviewStat } from "./overview-data";

export function StatCard({ label, value, detail, alert }: OverviewStat) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-kumo-subtle">{label}</p>
      <p
        className={`text-xl font-semibold tracking-tight tabular-nums ${alert ? "text-kumo-warning" : "text-kumo-default"}`}
      >
        {value ?? "-"}
      </p>
      <p className="text-xs text-kumo-subtle">{detail ?? "Loading"}</p>
    </div>
  );
}
