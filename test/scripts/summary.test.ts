import { expect, it } from "vitest";
import {
  formatSummary,
  summarize,
  type Sample,
} from "../../scripts/simulate/summary";

function sample(overrides: Partial<Sample>): Sample {
  return {
    status: 200,
    cache: "HIT",
    coalesced: false,
    latencyMs: 10,
    ...overrides,
  };
}

it("classifies gateway responses and counts calls avoided", () => {
  const summary = summarize([
    sample({ cache: "HIT", latencyMs: 5 }),
    sample({ cache: "HIT", latencyMs: 6 }),
    sample({ cache: "MISS", latencyMs: 120 }),
    sample({ cache: "MISS", coalesced: true, latencyMs: 118 }),
    sample({ cache: "REVALIDATED", latencyMs: 60 }),
    sample({ cache: "STALE", latencyMs: 8 }),
    sample({ status: 202, cache: "QUEUED", latencyMs: 12 }),
    sample({ status: 503, cache: null, latencyMs: 2 }),
    sample({ status: 201, cache: null, latencyMs: 90 }),
    sample({ status: 429, cache: null, latencyMs: 1 }),
  ]);
  expect(summary).toEqual({
    requests: 10,
    hits: 2,
    revalidated: 1,
    coalesced: 1,
    stale: 1,
    queued: 1,
    upstreamCalls: 3,
    rateLimited: 1,
    failed: 1,
    avoidedPercent: 57.1,
    p50Ms: 8,
    p95Ms: 120,
    hitP50Ms: 5,
    hitP95Ms: 6,
  });
});

it("formats an aligned report and handles no samples", () => {
  const empty = summarize([]);
  expect(empty).toMatchObject({ requests: 0, avoidedPercent: 0, p50Ms: null });
  const text = formatSummary(empty);
  expect(text).toContain("Upstream calls avoided  0%");
  expect(text).toContain("Gateway latency p95     -");
});
