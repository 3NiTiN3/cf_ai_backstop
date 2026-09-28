import type { BreakerState } from "../gateway/breaker";
import { percent } from "../shared/percent";
import type { OverviewData } from "./overview-data";

export interface RepoRow {
  repoKey: string;
  breaker: BreakerState;
  errorRate: string;
  p95: string;
  hitRate: string;
  queueDepth: string;
  errorHistory: (number | null)[];
}

export function repoRows(overview: OverviewData): RepoRow[] {
  return overview.repos.map((repo) => ({
    repoKey: repo.repoKey,
    breaker: repo.breaker,
    errorRate: `${percent(repo.errorRate)}%`,
    p95: repo.p95LatencyMs === null ? "-" : `${repo.p95LatencyMs} ms`,
    hitRate: `${percent(repo.cacheHitRatio)}%`,
    queueDepth: repo.queueDepth.toLocaleString("en-US"),
    errorHistory: repo.errorHistory,
  }));
}

export function pickRepo(
  rows: RepoRow[],
  selected: string | null,
): string | null {
  if (selected !== null && rows.some((row) => row.repoKey === selected)) {
    return selected;
  }
  return rows[0]?.repoKey ?? null;
}
