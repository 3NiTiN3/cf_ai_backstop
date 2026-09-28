import { expect, it } from "vitest";
import type { GatewayEvent } from "../../src/gateway/events";
import { buildTimeline } from "../../src/gateway/timeline";

function event(ts: number, overrides: Partial<GatewayEvent>): GatewayEvent {
  return {
    ts,
    kind: "read",
    method: "GET",
    path: "/repos/demo/api/issues",
    status: 200,
    cache: "HIT",
    latencyMs: 1,
    ...overrides,
  };
}

const comment = { method: "POST", path: "/repos/demo/api/issues/1/comments" };

it("merges breaker, chaos, queue, replay and incident entries newest first", () => {
  const timeline = buildTimeline({
    events: [
      event(9, { kind: "replay", status: 201, cache: "QUEUED", ...comment }),
      event(8, { kind: "replay_started", detail: "recovered: wf-1" }),
      event(7, {
        kind: "breaker",
        detail: "half_open -> closed (probe_succeeded)",
      }),
      event(5, { kind: "write", status: 202, cache: "QUEUED", ...comment }),
      event(4, { cache: "STALE" }),
      event(3, {
        kind: "breaker",
        detail: "closed -> open (consecutive_failures)",
      }),
      event(1, {}),
    ],
    chaos: [
      { ts: 6, mode: "off", errorRate: 0, latencyMs: 0 },
      { ts: 2, mode: "blackout", errorRate: 0, latencyMs: 0 },
    ],
    incidents: [
      {
        id: "i-1",
        startedAt: 3,
        endedAt: 7,
        peakErrorRate: 1,
        readsServedStale: 1,
        writesQueued: 1,
        writesReplayed: 1,
        summary: "demo/api was down.",
      },
    ],
  });

  expect(timeline.map(({ at, kind, text }) => [at, kind, text])).toEqual([
    [9, "replay", "Replayed POST /repos/demo/api/issues/1/comments (201)"],
    [8, "replay", "Replay started (recovered)"],
    [7, "breaker", "Breaker half-open to closed (probe succeeded)"],
    [
      7,
      "incident",
      "demo/api was down. All 1 queued writes have been replayed.",
    ],
    [6, "chaos", "Chaos off"],
    [5, "queue", "Queued POST /repos/demo/api/issues/1/comments"],
    [3, "breaker", "Breaker closed to open (consecutive failures)"],
    [3, "incident", "Incident started"],
    [2, "chaos", "Chaos blackout: every upstream call fails"],
  ]);
});

it("describes failed replays, queue actions and chaos settings", () => {
  const timeline = buildTimeline({
    events: [
      event(4, { kind: "replay", status: 422, cache: "QUEUED", ...comment }),
      event(3, { kind: "queue", detail: "drop w-1" }),
      event(2, { kind: "writes", detail: "paused" }),
    ],
    chaos: [{ ts: 1, mode: "errors", errorRate: 0.5, latencyMs: 0 }],
    incidents: [],
  });
  expect(timeline.map((entry) => entry.text)).toEqual([
    "Replay of POST /repos/demo/api/issues/1/comments failed (422)",
    "Queued write w-1 dropped",
    "Writes paused",
    "Chaos errors: 50% of upstream calls fail",
  ]);
});
