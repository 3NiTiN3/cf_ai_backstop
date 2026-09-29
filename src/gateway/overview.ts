import { z } from "zod";
import { BREAKER_STATES, type BreakerState } from "./breaker";
import { COUNTER_NAMES, emptyCounters, type CounterTotals } from "./counters";
import { countLastMinute } from "./request-rate";
import type { Namespace } from "./routes";
import { errorSeries } from "./upstream-history";

const HEALTH_WINDOW_MS = 60_000;

export interface RepoSummary extends CounterTotals {
  repoKey: string;
  breaker: BreakerState;
  lastEventAt: number | null;
  reportedAt: number;
  requestsPerMinute: number;
  queueDepth: number;
  cacheHitRatio: number;
  errorRate: number;
  p95LatencyMs: number | null;
  errorHistory: (number | null)[];
}

interface OverviewTotals extends CounterTotals {
  avoidedRatio: number;
  cacheHitRatio: number;
  requestsPerMinute: number;
  queueDepth: number;
}

export interface Overview {
  namespace: Namespace;
  totals: OverviewTotals;
  reposDegraded: number;
  repos: RepoSummary[];
}

const StoredCounters = z.object(
  Object.fromEntries(COUNTER_NAMES.map((name) => [name, z.number()])),
);

export const RepoRow = z.object({
  repo_key: z.string(),
  counters: z.string(),
  last_event_at: z.number().nullable(),
  reported_at: z.number(),
  breaker: z.enum(BREAKER_STATES),
  recent_requests: z.string(),
  queue_depth: z.number(),
  upstream_history: z.string(),
  error_rate: z.number(),
  p95_ms: z.number().nullable(),
});

const StoredRate = z.array(z.tuple([z.number(), z.number()]));
const StoredHistory = z.array(z.tuple([z.number(), z.number(), z.number()]));

export function toSummary(
  row: z.infer<typeof RepoRow>,
  now: number,
): RepoSummary {
  const counters = {
    ...emptyCounters(),
    ...parse(StoredCounters, row.counters),
  };
  // The health window only covers the last minute, so an older report is out of date.
  const current = row.reported_at > now - HEALTH_WINDOW_MS;
  return {
    ...counters,
    repoKey: row.repo_key,
    breaker: row.breaker,
    lastEventAt: row.last_event_at,
    reportedAt: row.reported_at,
    requestsPerMinute: countLastMinute(
      parse(StoredRate, row.recent_requests),
      now,
    ),
    queueDepth: row.queue_depth,
    cacheHitRatio: ratio(counters.hits, counters.requests),
    errorRate: current ? row.error_rate : 0,
    p95LatencyMs: current ? row.p95_ms : null,
    errorHistory: errorSeries(parse(StoredHistory, row.upstream_history), now),
  };
}

export function overviewOf(
  namespace: Namespace,
  repos: RepoSummary[],
): Overview {
  return {
    namespace,
    totals: totalsOf(repos),
    reposDegraded: repos.filter((repo) => repo.breaker !== "closed").length,
    repos: [...repos].sort((a, b) => b.requests - a.requests),
  };
}

function totalsOf(repos: RepoSummary[]): OverviewTotals {
  const totals = emptyCounters();
  let requestsPerMinute = 0;
  let queueDepth = 0;
  for (const repo of repos) {
    for (const name of COUNTER_NAMES) totals[name] += repo[name];
    requestsPerMinute += repo.requestsPerMinute;
    queueDepth += repo.queueDepth;
  }
  return {
    ...totals,
    avoidedRatio: ratio(
      totals.upstream_avoided,
      totals.upstream_avoided + totals.upstream_calls,
    ),
    cacheHitRatio: ratio(totals.hits, totals.requests),
    requestsPerMinute,
    queueDepth,
  };
}

function parse<T>(schema: z.ZodType<T>, json: string): T {
  return schema.parse(JSON.parse(json));
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}
