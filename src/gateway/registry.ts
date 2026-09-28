import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { addColumnIfMissing } from "../shared/sql";
import { BREAKER_STATES, type BreakerState } from "./breaker";
import type { ChaosConfig } from "./chaos";
import { ChaosStore, type ChaosEvent } from "./chaos-store";
import { COUNTER_NAMES, emptyCounters, type CounterTotals } from "./counters";
import { countLastMinute, type RateBuckets } from "./request-rate";
import type { Namespace } from "./routes";

export const REGISTRY_NAME = "global";

export interface RepoSnapshot {
  namespace: Namespace;
  repoKey: string;
  counters: CounterTotals;
  lastEventAt: number | null;
  breaker: BreakerState;
  recentRequests: RateBuckets;
  queueDepth: number;
}

export interface RepoSummary extends CounterTotals {
  repoKey: string;
  breaker: BreakerState;
  lastEventAt: number | null;
  reportedAt: number;
  requestsPerMinute: number;
  queueDepth: number;
}

export interface OverviewTotals extends CounterTotals {
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

const RepoRow = z.object({
  repo_key: z.string(),
  counters: z.string(),
  last_event_at: z.number().nullable(),
  reported_at: z.number(),
  breaker: z.enum(BREAKER_STATES),
  recent_requests: z.string(),
  queue_depth: z.number(),
});

const StoredBuckets = z.array(z.tuple([z.number(), z.number()]));

export class Registry extends DurableObject<Env> {
  private readonly sql = this.ctx.storage.sql;
  private readonly chaos = new ChaosStore(this.sql);

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS repos (
      namespace TEXT NOT NULL,
      repo_key TEXT NOT NULL,
      counters TEXT NOT NULL,
      last_event_at INT,
      reported_at INT NOT NULL,
      PRIMARY KEY (namespace, repo_key)
    )`);
    addColumnIfMissing(
      this.sql,
      "repos",
      "breaker",
      "TEXT NOT NULL DEFAULT 'closed'",
    );
    addColumnIfMissing(
      this.sql,
      "repos",
      "recent_requests",
      "TEXT NOT NULL DEFAULT '[]'",
    );
    addColumnIfMissing(
      this.sql,
      "repos",
      "queue_depth",
      "INT NOT NULL DEFAULT 0",
    );
  }

  report(snapshot: RepoSnapshot): void {
    this.sql.exec(
      `INSERT OR REPLACE INTO repos
        (namespace, repo_key, counters, last_event_at, reported_at, breaker,
          recent_requests, queue_depth)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      snapshot.namespace,
      snapshot.repoKey,
      JSON.stringify(snapshot.counters),
      snapshot.lastEventAt,
      Date.now(),
      snapshot.breaker,
      JSON.stringify(snapshot.recentRequests),
      snapshot.queueDepth,
    );
  }

  hasRepo(namespace: Namespace, repoKey: string): boolean {
    return (
      this.sql
        .exec(
          "SELECT 1 FROM repos WHERE namespace = ? AND repo_key = ?",
          namespace,
          repoKey,
        )
        .toArray().length > 0
    );
  }

  getChaos(namespace: Namespace): ChaosConfig {
    return this.chaos.get(namespace);
  }

  setChaos(namespace: Namespace, config: ChaosConfig): ChaosConfig {
    this.chaos.set(namespace, config, Date.now());
    return this.chaos.get(namespace);
  }

  chaosEvents(namespace: Namespace, limit: number): ChaosEvent[] {
    return this.chaos.events(namespace, limit);
  }

  overview(namespace: Namespace): Overview {
    const now = Date.now();
    const repos = this.sql
      .exec("SELECT * FROM repos WHERE namespace = ?", namespace)
      .toArray()
      .map((row) => toSummary(RepoRow.parse(row), now))
      .sort((a, b) => b.requests - a.requests);
    return {
      namespace,
      totals: totalsOf(repos),
      reposDegraded: repos.filter((repo) => repo.breaker !== "closed").length,
      repos,
    };
  }
}

function toSummary(row: z.infer<typeof RepoRow>, now: number): RepoSummary {
  const counters = StoredCounters.parse(JSON.parse(row.counters));
  const buckets = StoredBuckets.parse(JSON.parse(row.recent_requests));
  return {
    ...emptyCounters(),
    ...counters,
    repoKey: row.repo_key,
    breaker: row.breaker,
    lastEventAt: row.last_event_at,
    reportedAt: row.reported_at,
    requestsPerMinute: countLastMinute(buckets, now),
    queueDepth: row.queue_depth,
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

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}
