import { describe, expect, it } from "vitest";
import { HealthWindow, isHealthFailure } from "../../src/gateway/health";

function windowAt(start: number) {
  const clock = { now: start };
  return { clock, health: new HealthWindow(() => clock.now) };
}

describe("isHealthFailure", () => {
  it("counts upstream trouble but not client errors", () => {
    expect(isHealthFailure("server_error")).toBe(true);
    expect(isHealthFailure("timeout")).toBe(true);
    expect(isHealthFailure("network_error")).toBe(true);
    expect(isHealthFailure("rate_limited")).toBe(true);
    expect(isHealthFailure("client_error")).toBe(false);
    expect(isHealthFailure("ok")).toBe(false);
  });
});

describe("HealthWindow", () => {
  it("is empty before any request", () => {
    const { health } = windowAt(0);
    expect(health.snapshot()).toEqual({
      requestCount: 0,
      errorCount: 0,
      errorRate: 0,
      consecutiveFailures: 0,
      p50LatencyMs: null,
      p95LatencyMs: null,
    });
  });

  it("computes the error rate across buckets", () => {
    const { clock, health } = windowAt(100_000);
    health.record("ok", 10);
    health.record("server_error", 10);
    clock.now += 10_000;
    health.record("client_error", 10);
    health.record("timeout", 10);

    const snapshot = health.snapshot();
    expect(snapshot.requestCount).toBe(4);
    expect(snapshot.errorCount).toBe(2);
    expect(snapshot.errorRate).toBe(0.5);
  });

  it("drops buckets once they fall out of the 60 second window", () => {
    const { clock, health } = windowAt(100_000);
    health.record("server_error", 10);
    clock.now += 10_000;
    health.record("ok", 10);

    clock.now = 159_999;
    expect(health.snapshot().requestCount).toBe(2);

    clock.now = 160_000;
    expect(health.snapshot()).toMatchObject({
      requestCount: 1,
      errorCount: 0,
      errorRate: 0,
    });

    clock.now = 170_000;
    expect(health.snapshot().requestCount).toBe(0);
  });

  it("reuses the current bucket after old ones roll off", () => {
    const { clock, health } = windowAt(100_000);
    health.record("ok", 10);
    clock.now = 200_000;
    health.record("ok", 20);
    health.record("ok", 30);
    expect(health.snapshot()).toMatchObject({
      requestCount: 2,
      p50LatencyMs: 20,
    });
  });

  it("counts consecutive failures and resets on success or client error", () => {
    const { health } = windowAt(0);
    health.record("server_error", 1);
    health.record("rate_limited", 1);
    health.record("network_error", 1);
    expect(health.snapshot().consecutiveFailures).toBe(3);

    health.record("client_error", 1);
    expect(health.snapshot().consecutiveFailures).toBe(0);

    health.record("timeout", 1);
    health.record("ok", 1);
    expect(health.snapshot().consecutiveFailures).toBe(0);
  });

  it("keeps consecutive failures when the window rolls over", () => {
    const { clock, health } = windowAt(0);
    health.record("server_error", 1);
    clock.now += 120_000;
    health.record("server_error", 1);
    expect(health.snapshot()).toMatchObject({
      requestCount: 1,
      consecutiveFailures: 2,
    });
  });

  it("reports nearest-rank p50 and p95 latencies", () => {
    const { clock, health } = windowAt(0);
    for (let latency = 100; latency >= 1; latency--) {
      if (latency === 50) clock.now += 10_000;
      health.record("ok", latency);
    }
    const snapshot = health.snapshot();
    expect(snapshot.p50LatencyMs).toBe(50);
    expect(snapshot.p95LatencyMs).toBe(95);
  });

  it("uses the single sample for both percentiles", () => {
    const { health } = windowAt(0);
    health.record("ok", 42);
    expect(health.snapshot()).toMatchObject({
      p50LatencyMs: 42,
      p95LatencyMs: 42,
    });
  });
});
