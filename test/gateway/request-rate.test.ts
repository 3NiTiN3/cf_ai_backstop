import { expect, it } from "vitest";
import { countLastMinute, RequestRate } from "../../src/gateway/request-rate";

it("counts hits per second and drops seconds older than a minute", () => {
  let now = 1_000_000;
  const rate = new RequestRate(() => now);
  rate.hit();
  rate.hit();
  now += 1500;
  rate.hit();
  expect(rate.recent()).toEqual([
    [1000, 2],
    [1001, 1],
  ]);

  now += 59_000;
  expect(rate.recent()).toEqual([[1001, 1]]);
  now += 1000;
  expect(rate.recent()).toEqual([]);
});

it("counts only buckets inside the last minute", () => {
  const now = 100_000;
  expect(
    countLastMinute(
      [
        [40, 9],
        [41, 2],
        [100, 3],
      ],
      now,
    ),
  ).toBe(5);
  expect(countLastMinute([], now)).toBe(0);
});
