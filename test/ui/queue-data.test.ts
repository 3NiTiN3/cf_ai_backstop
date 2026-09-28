import { expect, it } from "vitest";
import { CHAOS_PRESETS } from "../../src/ui/chaos-data";
import { actionsFor, queueSummary } from "../../src/ui/queue-data";

it("offers retry only for failed writes and drop for pending or failed", () => {
  expect(actionsFor("pending")).toEqual(["drop"]);
  expect(actionsFor("failed")).toEqual(["retry", "drop"]);
  expect(actionsFor("in_flight")).toEqual([]);
  expect(actionsFor("done")).toEqual([]);
  expect(actionsFor("dropped")).toEqual([]);
});

it("summarises the queue counts", () => {
  expect(
    queueSummary({
      counts: { pending: 2, in_flight: 1, done: 5, failed: 1, dropped: 0 },
      items: [],
    }),
  ).toBe("3 waiting, 5 done, 1 failed, 0 dropped");
});

it("has one chaos preset per mode", () => {
  expect(CHAOS_PRESETS.map((preset) => preset.mode)).toEqual([
    "off",
    "errors",
    "latency",
    "blackout",
  ]);
});
