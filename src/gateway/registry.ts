import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { COUNTER_NAMES, emptyCounters, type CounterTotals } from "./counters";
import type { Namespace } from "./routes";

export const REGISTRY_NAME = "global";

export interface RepoSnapshot {
  namespace: Namespace;
  repoKey: string;
  counters: CounterTotals;
  lastEventAt: number | null;
}

export interface RepoSummary extends CounterTotals {
  repoKey: string;
  lastEventAt: number | null;
  reportedAt: number;
}

export interface Overview {
  namespace: Namespace;
  totals: CounterTotals & { avoidedRatio: number };
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
});

export class Registry extends DurableObject<Env> {
  private readonly sql = this.ctx.storage.sql;

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
  }

  report(snapshot: RepoSnapshot): void {
    this.sql.exec(
      `INSERT OR REPLACE INTO repos
        (namespace, repo_key, counters, last_event_at, reported_at)
        VALUES (?, ?, ?, ?, ?)`,
      snapshot.namespace,
      snapshot.repoKey,
      JSON.stringify(snapshot.counters),
      snapshot.lastEventAt,
      Date.now(),
    );
  }

  overview(namespace: Namespace): Overview {
    const repos = this.sql
      .exec("SELECT * FROM repos WHERE namespace = ?", namespace)
      .toArray()
      .map((row) => toSummary(RepoRow.parse(row)))
      .sort((a, b) => b.requests - a.requests);
    return { namespace, totals: totalsOf(repos), repos };
  }
}

function toSummary(row: z.infer<typeof RepoRow>): RepoSummary {
  const counters = StoredCounters.parse(JSON.parse(row.counters));
  return {
    ...emptyCounters(),
    ...counters,
    repoKey: row.repo_key,
    lastEventAt: row.last_event_at,
    reportedAt: row.reported_at,
  };
}

function totalsOf(repos: RepoSummary[]): Overview["totals"] {
  const totals = emptyCounters();
  for (const repo of repos) {
    for (const name of COUNTER_NAMES) totals[name] += repo[name];
  }
  const upstreamTotal = totals.upstream_avoided + totals.upstream_calls;
  return {
    ...totals,
    avoidedRatio:
      upstreamTotal === 0 ? 0 : totals.upstream_avoided / upstreamTotal,
  };
}
