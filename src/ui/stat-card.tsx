import type { OverviewStat } from "./overview-data";

export function StatCard({ label, value, detail, alert }: OverviewStat) {
  return (
    <div className="rounded-xl border border-kumo-line bg-kumo-base px-4 py-3 min-w-0">
      <p className="text-xs font-medium text-kumo-subtle">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? "text-kumo-warning" : "text-kumo-default"}`}
      >
        {value ?? "-"}
      </p>
      <p className="mt-0.5 text-xs text-kumo-subtle">{detail ?? "Loading"}</p>
    </div>
  );
}
