import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { emptyCounters } from "../../src/gateway/counters";

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
  });
  await registry.report({
    namespace: "live",
    repoKey: "cloudflare/workers-sdk",
    counters: { ...emptyCounters(), requests: 5 },
    lastEventAt: 300,
  });

  const overview = await registry.overview("demo");
  expect(overview.namespace).toBe("demo");
  expect(overview.repos.map((repo) => repo.repoKey)).toEqual([
    "demo/web",
    "demo/api",
  ]);
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
  });
});

it("replaces a repo's previous snapshot", async () => {
  const registry = env.Registry.getByName("test:registry-replace");
  const snapshot = {
    namespace: "demo" as const,
    repoKey: "demo/api",
    counters: { ...emptyCounters(), requests: 1 },
    lastEventAt: 1,
  };
  await registry.report(snapshot);
  await registry.report({
    ...snapshot,
    counters: { ...emptyCounters(), requests: 4 },
  });
  const overview = await registry.overview("demo");
  expect(overview.repos).toHaveLength(1);
  expect(overview.totals.requests).toBe(4);
  expect(overview.totals.avoidedRatio).toBe(0);
});
