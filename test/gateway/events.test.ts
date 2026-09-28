import { env, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { EventLog, type GatewayEvent } from "../../src/gateway/events";

function event(ts: number): GatewayEvent {
  return {
    ts,
    kind: "read",
    method: "GET",
    path: `/repos/demo/api?n=${ts}`,
    status: 200,
    cache: "HIT",
    latencyMs: 3,
  };
}

it("returns the newest events first and honours the limit", async () => {
  const stub = env.RepoGateway.getByName("test:events-order");
  await runInDurableObject(stub, async (_instance, state) => {
    const log = new EventLog(state.storage.sql);
    for (let ts = 1; ts <= 5; ts++) log.record(event(ts));
    expect(log.recent(3).map((e) => e.ts)).toEqual([5, 4, 3]);
    expect(log.recent(1)[0]).toEqual(event(5));
    expect(log.lastEventAt()).toBe(5);
  });
});

it("keeps only the most recent events", async () => {
  const stub = env.RepoGateway.getByName("test:events-retention");
  await runInDurableObject(stub, async (_instance, state) => {
    const log = new EventLog(state.storage.sql, 10);
    for (let ts = 1; ts <= 25; ts++) log.record(event(ts));
    const kept = log.recent(100).map((e) => e.ts);
    expect(kept).toHaveLength(10);
    expect(kept[0]).toBe(25);
    expect(kept.at(-1)).toBe(16);
  });
});

it("keeps 2000 events by default", async () => {
  const stub = env.RepoGateway.getByName("test:events-default");
  await runInDurableObject(stub, async (_instance, state) => {
    const log = new EventLog(state.storage.sql);
    for (let ts = 1; ts <= 2010; ts++) log.record(event(ts));
    const [row] = state.storage.sql
      .exec("SELECT COUNT(*) AS n FROM events")
      .toArray();
    expect(row?.n).toBe(2000);
    expect(log.recent(2000).at(-1)?.ts).toBe(11);
  });
});

it("starts empty", async () => {
  const stub = env.RepoGateway.getByName("test:events-empty");
  await runInDurableObject(stub, async (_instance, state) => {
    expect(new EventLog(state.storage.sql).lastEventAt()).toBeNull();
  });
});

it("stores an optional detail", async () => {
  const stub = env.RepoGateway.getByName("test:events-detail");
  await runInDurableObject(stub, async (_instance, state) => {
    const log = new EventLog(state.storage.sql);
    const transition = { ...event(1), kind: "breaker", detail: "a -> b" };
    log.record(transition);
    log.record(event(2));
    expect(log.recent(2)).toEqual([event(2), transition]);
  });
});

it("adds the detail column to an existing events table", async () => {
  const stub = env.RepoGateway.getByName("test:events-migrate");
  await runInDurableObject(stub, async (_instance, state) => {
    const { sql } = state.storage;
    sql.exec("DROP TABLE IF EXISTS events");
    sql.exec(`CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INT NOT NULL, kind TEXT NOT NULL, method TEXT NOT NULL,
      path TEXT NOT NULL, status INT NOT NULL, cache TEXT NOT NULL,
      latency_ms INT NOT NULL
    )`);
    sql.exec(
      `INSERT INTO events (ts, kind, method, path, status, cache, latency_ms)
        VALUES (1, 'read', 'GET', '/', 200, 'HIT', 3)`,
    );
    const log = new EventLog(sql);
    log.record({ ...event(2), detail: "x" });
    expect(log.recent(2).map((e) => e.detail)).toEqual(["x", undefined]);
  });
});
