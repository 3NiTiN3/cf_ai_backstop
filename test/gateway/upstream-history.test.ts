import { expect, it } from "vitest";
import {
  HISTORY_SLOTS,
  UpstreamHistory,
  errorSeries,
} from "../../src/gateway/upstream-history";

it("counts calls and failures per 15 second slot and forgets old slots", () => {
  let now = 600_000;
  const history = new UpstreamHistory(() => now);
  history.record(false);
  history.record(true);
  now += 15_000;
  history.record(true);
  expect(history.recent()).toEqual([
    [600_000, 2, 1],
    [615_000, 1, 1],
  ]);

  now += HISTORY_SLOTS * 15_000;
  expect(history.recent()).toEqual([]);
});

it("builds an oldest-first error rate series with gaps for idle slots", () => {
  const now = 600_000;
  const series = errorSeries(
    [
      [600_000, 4, 1],
      [585_000, 2, 2],
      [0, 5, 5],
    ],
    now,
  );
  expect(series).toHaveLength(HISTORY_SLOTS);
  expect(series.at(-1)).toBe(0.25);
  expect(series.at(-2)).toBe(1);
  expect(series.slice(0, -2).every((value) => value === null)).toBe(true);
});
