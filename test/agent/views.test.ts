import { expect, it } from "vitest";
import { eventCounts } from "../../src/agent/views";
import type { GatewayEvent } from "../../src/gateway/events";

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

it("counts events by kind and lists breaker changes oldest first", () => {
  const newestFirst = [
    event({ ts: 9, kind: "replay", status: 201, cache: "QUEUED" }),
    event({ ts: 8, kind: "replay", status: 422, cache: "QUEUED" }),
    event({ ts: 7, kind: "breaker", detail: "half_open -> closed (probe_ok)" }),
    event({ ts: 6, kind: "breaker", detail: "open -> half_open (cooldown)" }),
    event({ ts: 5, kind: "write", status: 202, cache: "QUEUED" }),
    event({ ts: 4, cache: "STALE" }),
    event({ ts: 3, cache: "STALE" }),
    event({ ts: 2, kind: "breaker", detail: "closed -> open (error_rate)" }),
    event({ ts: 1, cache: "HIT" }),
  ];
  expect(eventCounts(newestFirst)).toEqual({
    events: 9,
    since: new Date(1).toISOString(),
    reads: 3,
    readsByCache: { STALE: 2, HIT: 1 },
    writes: 1,
    writesQueued: 1,
    replaysSucceeded: 1,
    replaysFailed: 1,
    breakerChanges: [
      "closed -> open (error_rate)",
      "open -> half_open (cooldown)",
      "half_open -> closed (probe_ok)",
    ],
  });
});

it("handles an empty event list", () => {
  expect(eventCounts([])).toMatchObject({ events: 0, since: null, reads: 0 });
});
