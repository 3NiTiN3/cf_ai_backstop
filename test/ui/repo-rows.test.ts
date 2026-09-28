import { describe, expect, it } from "vitest";
import { OverviewSchema } from "../../src/ui/overview-data";
import { pickRepo, repoRows } from "../../src/ui/repo-rows";
import { sparklineSegments } from "../../src/ui/sparkline-points";

const overview = OverviewSchema.parse({
  totals: {
    requests: 10,
    hits: 5,
    upstream_avoided: 5,
    avoidedRatio: 0.5,
    cacheHitRatio: 0.5,
    requestsPerMinute: 10,
    queueDepth: 2,
  },
  reposDegraded: 1,
  repos: [
    {
      repoKey: "demo/api",
      breaker: "open",
      errorRate: 0.8333,
      p95LatencyMs: 212,
      cacheHitRatio: 0.4,
      queueDepth: 2,
      errorHistory: [null, 1],
    },
    {
      repoKey: "demo/web",
      breaker: "closed",
      errorRate: 0,
      p95LatencyMs: null,
      cacheHitRatio: 1,
      queueDepth: 1200,
      errorHistory: [],
    },
  ],
});

describe("repoRows", () => {
  it("formats each repo for the table", () => {
    expect(repoRows(overview)).toEqual([
      {
        repoKey: "demo/api",
        breaker: "open",
        errorRate: "83.3%",
        p95: "212 ms",
        hitRate: "40%",
        queueDepth: "2",
        errorHistory: [null, 1],
      },
      {
        repoKey: "demo/web",
        breaker: "closed",
        errorRate: "0%",
        p95: "-",
        hitRate: "100%",
        queueDepth: "1,200",
        errorHistory: [],
      },
    ]);
  });

  it("keeps the selected repo while it exists, else picks the first", () => {
    const rows = repoRows(overview);
    expect(pickRepo(rows, "demo/web")).toBe("demo/web");
    expect(pickRepo(rows, "demo/gone")).toBe("demo/api");
    expect(pickRepo(rows, null)).toBe("demo/api");
    expect(pickRepo([], null)).toBeNull();
  });
});

describe("sparklineSegments", () => {
  it("splits at idle slots and maps rates onto the height", () => {
    expect(sparklineSegments([0, 1, null, 0.5], 30, 20)).toEqual([
      [
        { x: 0, y: 20 },
        { x: 10, y: 0 },
      ],
      [{ x: 30, y: 10 }],
    ]);
    expect(sparklineSegments([null, null], 30, 20)).toEqual([]);
  });
});
