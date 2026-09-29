import type { OverviewData } from "./overview-data";

export function StatusPill({ overview }: { overview: OverviewData | null }) {
  if (overview === null) return null;
  const degraded = overview.reposDegraded;
  const calm = degraded === 0;
  return (
    <span
      role="status"
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-medium transition-colors duration-500 ${calm ? "bg-kumo-success-tint text-kumo-success" : "bg-kumo-danger-tint text-kumo-danger"}`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${calm ? "bg-kumo-success" : "animate-pulse bg-kumo-danger"}`}
      />
      {calm ? "All clear" : `${degraded} degraded`}
    </span>
  );
}
