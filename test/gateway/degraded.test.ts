import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { BreakerStore } from "../../src/gateway/breaker-store";
import { CacheStore } from "../../src/gateway/cache";
import { Counters } from "../../src/gateway/counters";
import { GuardedUpstream } from "../../src/gateway/guarded-upstream";
import { HealthWindow } from "../../src/gateway/health";
import { ReadThroughCache } from "../../src/gateway/read-through";
import type { UpstreamResult } from "../../src/gateway/upstream";
import { okResult, route, withHarness } from "./helpers";

const REPO = "/demo/gh/repos/demo/api";
const OTHER = "/demo/gh/repos/demo/api/pulls";
const TTL_PLUS = 61_000;

const serverError = okResult("oops", { status: 502, outcome: "server_error" });
const circuitOpen = okResult('{"error":"upstream_unavailable"}', {
  status: 503,
  outcome: "circuit_open",
  headers: { "retry-after": "30" },
});

async function expectUnavailable(response: Response, retryAfter: number) {
  expect(response.status).toBe(503);
  expect(response.headers.get("retry-after")).toBe(String(retryAfter));
  expect(response.headers.get("x-backstop-mode")).toBe("degraded");
  expect(await response.json()).toEqual({
    error: "upstream_unavailable",
    retryAfterSeconds: retryAfter,
  });
}

describe("stale reads", () => {
  it("serves the expired entry when upstream fails while closed", () =>
    withHarness(async ({ get, upstream, clock, counters }) => {
      upstream.respond = () => okResult('{"v":1}');
      await get(REPO);
      clock.now += TTL_PLUS;

      upstream.respond = () => serverError;
      const response = await get(REPO);
      expect(response.status).toBe(200);
      expect(response.headers.get("x-backstop-cache")).toBe("STALE");
      expect(response.headers.get("x-backstop-mode")).toBe("degraded");
      expect(response.headers.get("age")).toBe("61");
      expect(await response.text()).toBe('{"v":1}');
      expect(counters()).toMatchObject({ upstream_calls: 2 });
    }));

  it("serves the expired entry while the breaker is open", () =>
    withHarness(async ({ get, upstream, clock, counters }) => {
      await get(REPO);
      clock.now += TTL_PLUS;

      upstream.respond = () => circuitOpen;
      const response = await get(REPO);
      expect(response.headers.get("x-backstop-cache")).toBe("STALE");
      expect(counters()).toMatchObject({
        upstream_calls: 1,
        upstream_avoided: 1,
      });
    }));

  it("serves stale to every coalesced caller", () =>
    withHarness(async ({ get, upstream, clock }) => {
      await get(REPO);
      clock.now += TTL_PLUS;
      upstream.respond = () => serverError;
      const responses = await Promise.all([get(REPO), get(REPO)]);
      expect(responses.map((r) => r.headers.get("x-backstop-cache"))).toEqual([
        "STALE",
        "STALE",
      ]);
      expect(upstream.calls).toHaveLength(2);
    }));

  it("passes client errors through instead of serving stale", () =>
    withHarness(async ({ get, upstream, clock }) => {
      await get(REPO);
      clock.now += TTL_PLUS;
      upstream.respond = () =>
        okResult('{"message":"Not Found"}', {
          status: 404,
          outcome: "client_error",
        });
      const response = await get(REPO);
      expect(response.status).toBe(404);
      expect(response.headers.get("x-backstop-cache")).toBe("MISS");
    }));
});

describe("nothing cached", () => {
  it("returns 503 with the breaker's Retry-After while open", () =>
    withHarness(async ({ get, upstream }) => {
      upstream.respond = () => circuitOpen;
      await expectUnavailable(await get(OTHER), 30);
    }));

  it("uses GitHub's Retry-After when rate limited", () =>
    withHarness(async ({ get, upstream }) => {
      upstream.respond = () =>
        okResult("", {
          status: 403,
          outcome: "rate_limited",
          headers: { "retry-after": "60" },
        });
      await expectUnavailable(await get(OTHER), 60);
    }));

  it("falls back to a short Retry-After on network errors", () =>
    withHarness(async ({ get, upstream }) => {
      upstream.respond = () =>
        okResult("", { status: 502, outcome: "network_error" });
      await expectUnavailable(await get(OTHER), 5);
    }));
});

it("serves stale and 503s through a real breaker during an outage", async () => {
  const stub = env.RepoGateway.getByName("test:degraded-breaker");
  await runInDurableObject(stub, async (_instance, state) => {
    const clock = { now: 1_000_000 };
    let result: UpstreamResult = okResult('{"v":1}');
    let calls = 0;
    const guard = new GuardedUpstream(
      new BreakerStore(state.storage.sql),
      new HealthWindow(() => clock.now),
      {
        now: () => clock.now,
        fetch: async () => {
          calls += 1;
          return result;
        },
        onTransition: () => undefined,
      },
    );
    const cache = new ReadThroughCache(
      new CacheStore(state.storage.sql),
      new Counters(state.storage.sql),
      { now: () => clock.now, upstream: (ns, req) => guard.call(ns, req) },
    );
    const get = (path: string) =>
      cache.read(new Request(`http://backstop.test${path}`), route(path));

    await get(REPO);
    clock.now += TTL_PLUS;
    result = serverError;
    for (let i = 0; i < 5; i++) await get(`${REPO}/issues?page=${i}`);
    expect(guard.state().state).toBe("open");

    const callsWhenOpened = calls;
    const staleHit = await get(REPO);
    expect(staleHit.headers.get("x-backstop-cache")).toBe("STALE");
    await expectUnavailable(await get(OTHER), 30);
    expect(calls).toBe(callsWhenOpened);
  });
});
