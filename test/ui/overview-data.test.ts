import { describe, expect, it } from "vitest";
import { OverviewSchema, overviewStats } from "../../src/ui/overview-data";

const response = {
  namespace: "demo",
  totals: {
    requests: 1200,
    hits: 900,
    coalesced: 40,
    upstream_calls: 100,
    upstream_avoided: 300,
    revalidated: 20,
    avoidedRatio: 0.75,
    cacheHitRatio: 0.75,
    requestsPerMinute: 84,
    queueDepth: 3,
  },
  reposDegraded: 1,
  repos: [
    { repoKey: "demo/api", breaker: "open", requests: 700 },
    { repoKey: "demo/web", breaker: "closed", requests: 500 },
  ],
};

describe("overviewStats", () => {
  it("formats the overview response for the cards", () => {
    const stats = overviewStats(OverviewSchema.parse(response));
    expect(stats).toEqual([
      {
        label: "Requests per minute",
        value: "84",
        detail: "1,200 in total",
        alert: false,
      },
      {
        label: "Cache hit rate",
        value: "75%",
        detail: "900 of 1,200 requests",
        alert: false,
      },
      {
        label: "Upstream calls avoided",
        value: "300",
        detail: "75% of upstream calls",
        alert: false,
      },
      {
        label: "Queue depth",
        value: "3",
        detail: "writes waiting to replay",
        alert: false,
      },
      {
        label: "Repos degraded",
        value: "1",
        detail: "of 2 repos",
        alert: true,
      },
    ]);
  });

  it("keeps labels and empty values while loading", () => {
    const stats = overviewStats(null);
    expect(stats).toHaveLength(5);
    expect(stats.every((stat) => stat.value === null)).toBe(true);
    expect(stats[0]?.label).toBe("Requests per minute");
  });

  it("rejects a response with missing totals", () => {
    expect(OverviewSchema.safeParse({ ...response, totals: {} }).success).toBe(
      false,
    );
  });
});
