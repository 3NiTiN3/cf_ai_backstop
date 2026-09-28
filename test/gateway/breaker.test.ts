import { describe, expect, it } from "vitest";
import {
  BASE_OPEN_MS,
  INITIAL_BREAKER,
  MAX_OPEN_MS,
  admit,
  observe,
  retryAfterSeconds,
  type Breaker,
  type ResultSignal,
} from "../../src/gateway/breaker";
import type { HealthSnapshot } from "../../src/gateway/health";

const OK: ResultSignal = { failed: false, rateLimitResetAt: null };
const FAIL: ResultSignal = { failed: true, rateLimitResetAt: null };

function health(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    requestCount: 1,
    errorCount: 0,
    errorRate: 0,
    consecutiveFailures: 0,
    p50LatencyMs: null,
    p95LatencyMs: null,
    ...overrides,
  };
}

function openAt(now: number, durationMs = BASE_OPEN_MS): Breaker {
  return {
    ...INITIAL_BREAKER,
    state: "open",
    openUntil: now + durationMs,
    openDurationMs: durationMs,
    reason: "error_rate",
  };
}

function probeFrom(breaker: Breaker, now: number): Breaker {
  const admission = admit(breaker, now);
  expect(admission.allowed).toBe(true);
  expect(admission.breaker.state).toBe("half_open");
  return admission.breaker;
}

describe("closed", () => {
  it("admits requests and stays closed on success", () => {
    expect(admit(INITIAL_BREAKER, 0)).toMatchObject({
      allowed: true,
      transition: null,
    });
    expect(observe(INITIAL_BREAKER, OK, health(), 0).transition).toBeNull();
  });

  it("opens at 50% errors once the window has 10 requests", () => {
    const step = observe(
      INITIAL_BREAKER,
      FAIL,
      health({ requestCount: 10, errorCount: 5, errorRate: 0.5 }),
      1000,
    );
    expect(step.breaker).toMatchObject({
      state: "open",
      reason: "error_rate",
      openUntil: 1000 + BASE_OPEN_MS,
    });
    expect(step.transition).toEqual({
      from: "closed",
      to: "open",
      reason: "error_rate",
      at: 1000,
    });
  });

  it("stays closed with too few requests or a low error rate", () => {
    const fewRequests = health({
      requestCount: 9,
      errorRate: 1,
      consecutiveFailures: 4,
    });
    const lowRate = health({
      requestCount: 20,
      errorRate: 0.45,
      consecutiveFailures: 4,
    });
    expect(
      observe(INITIAL_BREAKER, FAIL, fewRequests, 0).transition,
    ).toBeNull();
    expect(observe(INITIAL_BREAKER, FAIL, lowRate, 0).transition).toBeNull();
  });

  it("opens after 5 consecutive failures", () => {
    const step = observe(
      INITIAL_BREAKER,
      FAIL,
      health({ requestCount: 5, errorRate: 1, consecutiveFailures: 5 }),
      0,
    );
    expect(step.breaker).toMatchObject({
      state: "open",
      reason: "consecutive_failures",
    });
  });

  it("does not open on a success even if the window looks bad", () => {
    const bad = health({ requestCount: 20, errorRate: 0.9 });
    expect(observe(INITIAL_BREAKER, OK, bad, 0).transition).toBeNull();
  });
});

describe("open", () => {
  it("refuses requests until the open period ends", () => {
    const breaker = openAt(0);
    expect(admit(breaker, BASE_OPEN_MS - 1)).toMatchObject({
      allowed: false,
      transition: null,
    });
  });

  it("ignores late results from requests started before it opened", () => {
    const breaker = openAt(0);
    expect(observe(breaker, OK, health(), 10).breaker).toBe(breaker);
  });

  it("half-opens after the open period and admits a single probe", () => {
    const admission = admit(openAt(0), BASE_OPEN_MS);
    expect(admission.allowed).toBe(true);
    expect(admission.transition).toEqual({
      from: "open",
      to: "half_open",
      reason: "cooldown_elapsed",
      at: BASE_OPEN_MS,
    });
    expect(admit(admission.breaker, BASE_OPEN_MS + 100).allowed).toBe(false);
  });

  it("admits a new probe when the previous one never reported back", () => {
    const halfOpen = probeFrom(openAt(0), BASE_OPEN_MS);
    const retry = admit(halfOpen, BASE_OPEN_MS + 15_000);
    expect(retry.allowed).toBe(true);
    expect(retry.breaker.probeStartedAt).toBe(BASE_OPEN_MS + 15_000);
  });
});

describe("half_open", () => {
  it("closes on probe success and resets the open duration", () => {
    const halfOpen = probeFrom(openAt(0, 4 * BASE_OPEN_MS), 4 * BASE_OPEN_MS);
    const step = observe(halfOpen, OK, health(), 4 * BASE_OPEN_MS + 50);
    expect(step.breaker).toEqual({
      state: "closed",
      openUntil: null,
      openDurationMs: BASE_OPEN_MS,
      reason: "probe_succeeded",
      probeStartedAt: null,
    });
    expect(step.transition).toMatchObject({
      from: "half_open",
      to: "closed",
    });
  });

  it("reopens on probe failure and doubles the duration up to 5 minutes", () => {
    let now = 0;
    let breaker = openAt(now);
    const durations: number[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      now = breaker.openUntil ?? now;
      const step = observe(probeFrom(breaker, now), FAIL, health(), now);
      expect(step.transition).toMatchObject({
        from: "half_open",
        to: "open",
        reason: "probe_failed",
      });
      breaker = step.breaker;
      durations.push(breaker.openDurationMs);
      expect(breaker.openUntil).toBe(now + breaker.openDurationMs);
    }
    expect(durations).toEqual([
      60_000,
      120_000,
      240_000,
      MAX_OPEN_MS,
      MAX_OPEN_MS,
    ]);
  });
});

describe("rate limits", () => {
  const resetAt = 500_000;
  const limited: ResultSignal = { failed: false, rateLimitResetAt: resetAt };

  it("opens until the reset time, even on a successful response", () => {
    const step = observe(INITIAL_BREAKER, limited, health(), 1000);
    expect(step.breaker).toMatchObject({
      state: "open",
      reason: "rate_limited",
      openUntil: resetAt,
      openDurationMs: BASE_OPEN_MS,
    });
    expect(admit(step.breaker, resetAt - 1).allowed).toBe(false);
    expect(admit(step.breaker, resetAt).allowed).toBe(true);
  });

  it("reopens a half-open breaker until the reset time", () => {
    const halfOpen = probeFrom(openAt(0), BASE_OPEN_MS);
    const step = observe(halfOpen, limited, health(), BASE_OPEN_MS);
    expect(step.breaker).toMatchObject({
      state: "open",
      reason: "rate_limited",
      openUntil: resetAt,
    });
  });

  it("never opens into the past", () => {
    const past: ResultSignal = { failed: true, rateLimitResetAt: 10 };
    expect(
      observe(INITIAL_BREAKER, past, health(), 1000).breaker.openUntil,
    ).toBe(1000);
  });
});

describe("retryAfterSeconds", () => {
  it("counts down to the end of the open period", () => {
    expect(retryAfterSeconds(openAt(0), 0)).toBe(30);
    expect(retryAfterSeconds(openAt(0), 29_500)).toBe(1);
  });

  it("points at the probe timeout while half-open", () => {
    const halfOpen = probeFrom(openAt(0), BASE_OPEN_MS);
    expect(retryAfterSeconds(halfOpen, BASE_OPEN_MS)).toBe(15);
  });
});
