import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Transition } from "../../src/gateway/breaker";
import type { GatewayEvent } from "../../src/gateway/events";
import type { Generate } from "../../src/gateway/incident-summary";
import { IncidentTracker } from "../../src/gateway/incident-tracker";
import { IncidentLog } from "../../src/gateway/incidents";

const EM_DASH = String.fromCharCode(0x2014);

let counter = 0;

function withSql(run: (sql: SqlStorage) => Promise<void>): Promise<void> {
  const stub = env.RepoGateway.getByName(`test:incidents-${++counter}`);
  return runInDurableObject(stub, (_instance, state) => run(state.storage.sql));
}

function event(overrides: Partial<GatewayEvent>): GatewayEvent {
  return {
    ts: 0,
    kind: "read",
    method: "GET",
    path: "/repos/demo/api",
    status: 200,
    cache: "HIT",
    latencyMs: 1,
    ...overrides,
  };
}

const stale = event({ cache: "STALE" });
const queued = event({
  kind: "write",
  method: "POST",
  status: 202,
  cache: "QUEUED",
});
const replayed = event({
  kind: "replay",
  method: "POST",
  status: 201,
  cache: "QUEUED",
});
const rejected = event({
  kind: "replay",
  method: "POST",
  status: 422,
  cache: "QUEUED",
});

function transition(to: Transition["to"], at: number): Transition {
  return { from: "closed", to, reason: "error_rate", at };
}

describe("IncidentLog", () => {
  it("counts stale reads, queued writes and peak error rate while open", () =>
    withSql(async (sql) => {
      const log = new IncidentLog(sql);
      log.observe(stale, 0.9);
      log.open(1_000, 0.5);
      log.open(2_000, 0.9);
      log.observe(stale, 0.8);
      log.observe(stale, 1);
      log.observe(queued, 0.6);
      log.observe(event({}), 0.2);

      const closed = log.close(31_000);
      expect(closed).toMatchObject({
        startedAt: 1_000,
        endedAt: 31_000,
        peakErrorRate: 1,
        readsServedStale: 2,
        writesQueued: 1,
        writesReplayed: 0,
        summary: null,
      });
      expect(log.close(32_000)).toBeNull();
      expect(log.list(10)).toHaveLength(1);
    }));

  it("counts writes already waiting in the queue when it opens", () =>
    withSql(async (sql) => {
      const log = new IncidentLog(sql);
      log.open(1_000, 0.5, 2);
      log.observe(queued, 1);
      log.observe(replayed, 0);
      log.observe(replayed, 0);
      log.observe(replayed, 0);
      expect(log.close(9_000)).toMatchObject({
        writesQueued: 3,
        writesReplayed: 3,
      });
    }));

  it("counts writes queued behind the backlog after it closes", () =>
    withSql(async (sql) => {
      const log = new IncidentLog(sql);
      log.open(1_000, 1);
      log.observe(queued, 1);
      log.observe(queued, 1);
      log.close(2_000);
      log.observe(queued, 0, 1_500);
      log.observe(replayed, 0);
      log.observe(replayed, 0);
      log.observe(replayed, 0);
      log.observe(queued, 0, null);
      expect(log.list(1)[0]).toMatchObject({
        writesQueued: 3,
        writesReplayed: 3,
      });
    }));

  it("leaves a backlog that started after it ended to the next incident", () =>
    withSql(async (sql) => {
      const log = new IncidentLog(sql);
      log.open(1_000, 1);
      log.observe(queued, 1);
      log.close(2_000);
      log.observe(replayed, 0);
      log.observe(queued, 0, 5_000);
      log.observe(queued, 0, 5_000);
      log.open(6_000, 1, 2);
      log.observe(replayed, 0);
      log.observe(replayed, 0);
      log.close(7_000);

      const [latest, earlier] = log.list(10);
      expect(earlier).toMatchObject({ writesQueued: 1, writesReplayed: 1 });
      expect(latest).toMatchObject({ writesQueued: 2, writesReplayed: 2 });
    }));

  it("credits successful replays to the latest incident after it closed", () =>
    withSql(async (sql) => {
      const log = new IncidentLog(sql);
      log.open(1_000, 1);
      log.close(2_000);
      log.open(3_000, 1);
      log.close(4_000);
      log.observe(replayed, 0);
      log.observe(replayed, 0);
      log.observe(rejected, 0);

      const [latest, earlier] = log.list(10);
      expect(latest).toMatchObject({ startedAt: 3_000, writesReplayed: 2 });
      expect(earlier).toMatchObject({ startedAt: 1_000, writesReplayed: 0 });
    }));
});

describe("IncidentTracker", () => {
  async function lifecycle(sql: SqlStorage, generate: Generate) {
    const pending: Promise<unknown>[] = [];
    const tracker = new IncidentTracker({
      sql,
      errorRate: () => 1,
      queueDepth: () => 0,
      oldestWaitingAt: () => null,
      repo: () => "demo/api",
      generate,
      waitUntil: (promise) => pending.push(promise),
    });
    tracker.onTransition(transition("open", Date.UTC(2026, 8, 29, 10, 0, 0)));
    tracker.observe(stale);
    tracker.observe(queued);
    tracker.onTransition(
      transition("half_open", Date.UTC(2026, 8, 29, 10, 0, 30)),
    );
    tracker.onTransition(
      transition("closed", Date.UTC(2026, 8, 29, 10, 0, 42)),
    );
    await Promise.all(pending);
    return tracker.list(10);
  }

  it("stores the model summary built from the recorded facts", () =>
    withSql(async (sql) => {
      const seen: string[] = [];
      const [incident] = await lifecycle(sql, async (_system, facts) => {
        seen.push(facts);
        return `  demo/api lost GitHub for 42 seconds ${EM_DASH} reads stayed up. `;
      });
      expect(seen[0]).toContain("Duration: 42 seconds");
      expect(seen[0]).toContain("Reads served from stale cache: 1");
      expect(seen[0]).not.toContain("queued");
      expect(incident?.summary).toBe(
        "demo/api lost GitHub for 42 seconds, reads stayed up.",
      );
    }));

  it("falls back to the template when the model fails", () =>
    withSql(async (sql) => {
      const [incident] = await lifecycle(sql, async () => {
        throw new Error("AI unavailable");
      });
      expect(incident?.summary).toBe(
        "demo/api was degraded for 42 seconds, with a peak upstream error rate of 100%. " +
          "Backstop served 1 read from stale cache.",
      );
    }));
});
