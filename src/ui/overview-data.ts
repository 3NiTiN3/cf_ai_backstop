import { z } from "zod";
import { BREAKER_STATES } from "../gateway/breaker";
import { percent } from "../shared/percent";

export const OverviewSchema = z.object({
  totals: z.object({
    requests: z.number(),
    hits: z.number(),
    upstream_avoided: z.number(),
    avoidedRatio: z.number(),
    cacheHitRatio: z.number(),
    requestsPerMinute: z.number(),
    queueDepth: z.number(),
  }),
  reposDegraded: z.number(),
  repos: z.array(
    z.object({
      repoKey: z.string(),
      breaker: z.enum(BREAKER_STATES),
      errorRate: z.number(),
      p95LatencyMs: z.number().nullable(),
      cacheHitRatio: z.number(),
      queueDepth: z.number(),
      errorHistory: z.array(z.number().nullable()),
    }),
  ),
});

export type OverviewData = z.infer<typeof OverviewSchema>;

export interface OverviewStat {
  label: string;
  value: string | null;
  detail: string | null;
  alert: boolean;
}

type Reading = Pick<OverviewStat, "value" | "detail"> & { alert?: boolean };

const STATS: [label: string, read: (data: OverviewData) => Reading][] = [
  [
    "Requests per minute",
    ({ totals }) => ({
      value: count(totals.requestsPerMinute),
      detail: `${count(totals.requests)} in total`,
    }),
  ],
  [
    "Cache hit rate",
    ({ totals }) => ({
      value: `${percent(totals.cacheHitRatio)}%`,
      detail: `${count(totals.hits)} of ${count(totals.requests)} requests`,
    }),
  ],
  [
    "Upstream calls avoided",
    ({ totals }) => ({
      value: count(totals.upstream_avoided),
      detail: `${percent(totals.avoidedRatio)}% of upstream calls`,
    }),
  ],
  [
    "Queue depth",
    ({ totals }) => ({
      value: count(totals.queueDepth),
      detail: "writes waiting to replay",
    }),
  ],
  [
    "Repos degraded",
    ({ reposDegraded, repos }) => ({
      value: count(reposDegraded),
      detail: `of ${count(repos.length)} repos`,
      alert: reposDegraded > 0,
    }),
  ],
];

export function overviewStats(data: OverviewData | null): OverviewStat[] {
  return STATS.map(([label, read]) => ({
    label,
    value: null,
    detail: null,
    alert: false,
    ...(data ? read(data) : {}),
  }));
}

function count(value: number): string {
  return value.toLocaleString("en-US");
}
