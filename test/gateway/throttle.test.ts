import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TrailingThrottle } from "../../src/gateway/throttle";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("runs at once, then at most once per interval with a trailing run", () => {
  const run = vi.fn();
  const throttle = new TrailingThrottle(2000, run, () => Date.now());

  throttle.trigger();
  expect(run).toHaveBeenCalledTimes(1);

  throttle.trigger();
  throttle.trigger();
  vi.advanceTimersByTime(1999);
  expect(run).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  expect(run).toHaveBeenCalledTimes(2);

  vi.advanceTimersByTime(5000);
  expect(run).toHaveBeenCalledTimes(2);
  throttle.trigger();
  expect(run).toHaveBeenCalledTimes(3);
});
