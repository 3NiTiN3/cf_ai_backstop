import { z } from "zod";
import { DurableObject } from "cloudflare:workers";
import { sendToGateway } from "../demo/gateway-client";
import { StoryRunner, storyHealth, type StoryStatus } from "../demo/story";
import {
  TICK_MS,
  TrafficRunner,
  type StartResult,
  type TrafficStatus,
} from "../demo/traffic-runner";
import { addColumnIfMissing } from "../shared/sql";
import type { BreakerState } from "./breaker";
import { chaosConfig, type ChaosConfig } from "./chaos";
import { ChaosStore, type ChaosEvent } from "./chaos-store";
import type { CounterTotals } from "./counters";
import { RepoRow, overviewOf, toSummary, type Overview } from "./overview";
import type { RateBuckets } from "./request-rate";
import { durableObjectName, type Namespace } from "./routes";
import type { HistoryBuckets } from "./upstream-history";

export const REGISTRY_NAME = "global";

export interface RepoSnapshot {
  namespace: Namespace;
  repoKey: string;
  counters: CounterTotals;
  lastEventAt: number | null;
  breaker: BreakerState;
  recentRequests: RateBuckets;
  queueDepth: number;
  upstreamHistory: HistoryBuckets;
  errorRate: number;
  p95LatencyMs: number | null;
}

const ANNOUNCE_LIMIT = 50;

const RepoKeyRow = z.object({ repo_key: z.string() });

const ADDED_COLUMNS: [column: string, definition: string][] = [
  ["breaker", "TEXT NOT NULL DEFAULT 'closed'"],
  ["recent_requests", "TEXT NOT NULL DEFAULT '[]'"],
  ["queue_depth", "INT NOT NULL DEFAULT 0"],
  ["upstream_history", "TEXT NOT NULL DEFAULT '[]'"],
  ["error_rate", "REAL NOT NULL DEFAULT 0"],
  ["p95_ms", "INT"],
];

export class Registry extends DurableObject<Env> {
  private readonly sql = this.ctx.storage.sql;
  private readonly chaos = new ChaosStore(this.sql);
  private readonly traffic = new TrafficRunner(this.sql, {
    now: () => Date.now(),
    random: Math.random,
    send: (request) => sendToGateway(this.env, request),
    schedule: (at) => this.ctx.storage.setAlarm(at),
  });
  private readonly story = new StoryRunner(this.sql, {
    now: () => Date.now(),
    setChaos: (mode) => {
      this.setChaos("demo", chaosConfig(mode));
    },
    startTraffic: async (agents, durationSeconds) => {
      await this.traffic.start(agents, durationSeconds);
    },
    stopTraffic: () => {
      this.traffic.stop();
    },
    health: () => storyHealth(this.overview("demo")),
    schedule: (at) => this.ctx.storage.setAlarm(at),
  });

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
    for (const [column, definition] of ADDED_COLUMNS) {
      addColumnIfMissing(this.sql, "repos", column, definition);
    }
  }

  report(snapshot: RepoSnapshot): void {
    this.sql.exec(
      `INSERT OR REPLACE INTO repos
        (namespace, repo_key, counters, last_event_at, reported_at, breaker,
          recent_requests, queue_depth, upstream_history, error_rate, p95_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      snapshot.namespace,
      snapshot.repoKey,
      JSON.stringify(snapshot.counters),
      snapshot.lastEventAt,
      Date.now(),
      snapshot.breaker,
      JSON.stringify(snapshot.recentRequests),
      snapshot.queueDepth,
      JSON.stringify(snapshot.upstreamHistory),
      snapshot.errorRate,
      snapshot.p95LatencyMs,
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
    this.ctx.waitUntil(this.announceChaos(namespace));
    return this.chaos.get(namespace);
  }

  chaosEvents(namespace: Namespace, limit: number): ChaosEvent[] {
    return this.chaos.events(namespace, limit);
  }

  startTraffic(agents: number, durationSeconds: number): Promise<StartResult> {
    return this.traffic.start(agents, durationSeconds);
  }

  stopTraffic(): TrafficStatus {
    return this.traffic.stop();
  }

  trafficStatus(): TrafficStatus {
    return this.traffic.status();
  }

  startStory(): Promise<{ ok: boolean; status: StoryStatus }> {
    return this.story.start();
  }

  stopStory(): StoryStatus {
    return this.story.stop();
  }

  storyStatus(): StoryStatus {
    return this.story.status();
  }

  override async alarm(): Promise<void> {
    const started = Date.now();
    const storyActive = this.story.tick();
    const trafficActive = await this.traffic.tick();
    if (storyActive || trafficActive) {
      await this.ctx.storage.setAlarm(started + TICK_MS);
    }
  }

  // Gateways cache chaos briefly; telling them keeps a probe from seeing a stale blackout.
  private async announceChaos(namespace: Namespace): Promise<void> {
    const repoKeys = this.sql
      .exec(
        "SELECT repo_key FROM repos WHERE namespace = ? ORDER BY reported_at DESC LIMIT ?",
        namespace,
        ANNOUNCE_LIMIT,
      )
      .toArray()
      .map((row) => RepoKeyRow.parse(row).repo_key);
    await Promise.allSettled(
      repoKeys.map((repoKey) =>
        this.env.RepoGateway.getByName(
          durableObjectName({ namespace, repoKey }),
        ).forgetChaos(namespace),
      ),
    );
  }

  overview(namespace: Namespace): Overview {
    const now = Date.now();
    const repos = this.sql
      .exec("SELECT * FROM repos WHERE namespace = ?", namespace)
      .toArray()
      .map((row) => toSummary(RepoRow.parse(row), now));
    return overviewOf(namespace, repos);
  }
}
