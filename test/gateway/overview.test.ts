import { describe, expect, it } from "vitest";
import { emptyCounters } from "../../src/gateway/counters";
import { toSummary } from "../../src/gateway/overview";

const NOW = 1_000_000;

function row(reportedAt: number) {
  return {
    repo_key: "demo/api",
    counters: JSON.stringify({ ...emptyCounters(), requests: 8, hits: 6 }),
    last_event_at: reportedAt,
    reported_at: reportedAt,
    breaker: "open" as const,
    recent_requests: JSON.stringify([[Math.floor(NOW / 1000) - 5, 8]]),
    queue_depth: 2,
    upstream_history: JSON.stringify([[990_000, 4, 3]]),
    error_rate: 0.75,
    p95_ms: 120,
  };
}

describe("toSummary", () => {
  it("reports health, hit ratio and an error history for a fresh report", () => {
    const summary = toSummary(row(NOW - 5_000), NOW);
    expect(summary).toMatchObject({
      repoKey: "demo/api",
      breaker: "open",
      requestsPerMinute: 8,
      queueDepth: 2,
      cacheHitRatio: 0.75,
      errorRate: 0.75,
      p95LatencyMs: 120,
    });
    expect(summary.errorHistory).toHaveLength(20);
    expect(summary.errorHistory.at(-1)).toBe(0.75);
  });

  it("drops window figures from a report older than a minute", () => {
    const summary = toSummary(row(NOW - 61_000), NOW);
    expect(summary.errorRate).toBe(0);
    expect(summary.p95LatencyMs).toBeNull();
  });
});
