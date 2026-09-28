import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { emptyCounters } from "../../src/gateway/counters";

const HEALTHY = { upstreamHistory: [], errorRate: 0, p95LatencyMs: null };

it("aggregates repo snapshots per namespace", async () => {
  const registry = env.Registry.getByName("test:registry");
  await registry.report({
    namespace: "demo",
    repoKey: "demo/api",
    counters: {
      ...emptyCounters(),
      requests: 10,
      hits: 6,
      upstream_calls: 3,
      upstream_avoided: 7,
    },
    lastEventAt: 100,
    breaker: "closed",
    recentRequests: [],
    queueDepth: 0,
    ...HEALTHY,
  });
  await registry.report({
    namespace: "demo",
    repoKey: "demo/web",
    counters: {
      ...emptyCounters(),
      requests: 20,
      upstream_calls: 1,
      upstream_avoided: 9,
    },
    lastEventAt: 200,
    breaker: "open",
    recentRequests: [],
    queueDepth: 0,
    ...HEALTHY,
  });
  await registry.report({
    namespace: "live",
    repoKey: "cloudflare/workers-sdk",
    counters: { ...emptyCounters(), requests: 5 },
    lastEventAt: 300,
    breaker: "closed",
    recentRequests: [],
    queueDepth: 0,
    ...HEALTHY,
  });

  const overview = await registry.overview("demo");
  expect(overview.namespace).toBe("demo");
  expect(overview.repos.map((repo) => repo.repoKey)).toEqual([
    "demo/web",
    "demo/api",
  ]);
  expect(overview.repos[0]?.breaker).toBe("open");
  expect(overview.repos[1]).toMatchObject({
    repoKey: "demo/api",
    requests: 10,
    hits: 6,
    lastEventAt: 100,
  });
  expect(overview.totals).toMatchObject({
    requests: 30,
    upstream_calls: 4,
    upstream_avoided: 16,
    avoidedRatio: 0.8,
    cacheHitRatio: 0.2,
  });
  expect(overview.reposDegraded).toBe(1);
});

it("sums requests from the last minute and queue depth", async () => {
  const registry = env.Registry.getByName("test:registry-rate");
  const nowSecond = Math.floor(Date.now() / 1000);
  const base = {
    namespace: "demo" as const,
    counters: { ...emptyCounters(), requests: 50 },
    lastEventAt: 1,
    breaker: "closed" as const,
  };
  await registry.report({
    ...base,
    repoKey: "demo/api",
    recentRequests: [
      [nowSecond - 120, 40],
      [nowSecond - 30, 5],
      [nowSecond, 2],
    ],
    queueDepth: 3,
    ...HEALTHY,
  });
  await registry.report({
    ...base,
    repoKey: "demo/web",
    recentRequests: [[nowSecond - 10, 4]],
    queueDepth: 1,
    ...HEALTHY,
  });

  const overview = await registry.overview("demo");
  expect(overview.repos.map((repo) => repo.requestsPerMinute).sort()).toEqual([
    4, 7,
  ]);
  expect(overview.totals).toMatchObject({
    requestsPerMinute: 11,
    queueDepth: 4,
  });
  expect(overview.reposDegraded).toBe(0);
});

it("replaces a repo's previous snapshot", async () => {
  const registry = env.Registry.getByName("test:registry-replace");
  const snapshot = {
    namespace: "demo" as const,
    repoKey: "demo/api",
    counters: { ...emptyCounters(), requests: 1 },
    lastEventAt: 1,
    breaker: "closed" as const,
    recentRequests: [],
    queueDepth: 0,
    ...HEALTHY,
  };
  await registry.report(snapshot);
  await registry.report({
    ...snapshot,
    counters: { ...emptyCounters(), requests: 4 },
    breaker: "half_open",
  });
  const overview = await registry.overview("demo");
  expect(overview.repos).toHaveLength(1);
  expect(overview.repos[0]?.breaker).toBe("half_open");
  expect(overview.totals.requests).toBe(4);
  expect(overview.totals.avoidedRatio).toBe(0);
});
