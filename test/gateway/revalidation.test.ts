import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CacheStore } from "../../src/gateway/cache";
import { Counters } from "../../src/gateway/counters";
import { ReadThroughCache } from "../../src/gateway/read-through";
import { fetchUpstream } from "../../src/gateway/upstream";
import { okResult, route, withHarness } from "./helpers";

const REPO = "/demo/gh/repos/demo/api";
const TTL_PLUS = 61_000;

describe("conditional revalidation", () => {
  it("sends If-None-Match and refreshes on 304", () =>
    withHarness(async ({ get, upstream, clock, counters }) => {
      upstream.respond = () => okResult('{"v":1}', { etag: '"v1"' });
      await get(REPO);
      clock.now += TTL_PLUS;

      upstream.respond = () =>
        okResult("", { status: 304, etag: '"v1"', headers: {} });
      const revalidated = await get(REPO);
      expect(upstream.calls[1]?.headers.get("if-none-match")).toBe('"v1"');
      expect(revalidated.status).toBe(200);
      expect(revalidated.headers.get("x-backstop-cache")).toBe("REVALIDATED");
      expect(revalidated.headers.get("content-type")).toBe("application/json");
      expect(await revalidated.text()).toBe('{"v":1}');

      const hit = await get(REPO);
      expect(hit.headers.get("x-backstop-cache")).toBe("HIT");
      expect(upstream.calls).toHaveLength(2);
      expect(counters()).toEqual({
        upstream_calls: 2,
        upstream_avoided: 1,
        revalidated: 1,
      });
    }));

  it("sends If-Modified-Since when only Last-Modified is known", () =>
    withHarness(async ({ get, upstream, clock }) => {
      const lastModified = "Tue, 01 Sep 2026 00:00:00 GMT";
      upstream.respond = () => okResult("{}", { lastModified });
      await get(REPO);
      clock.now += TTL_PLUS;
      await get(REPO);
      const conditional = upstream.calls[1]?.headers;
      expect(conditional?.get("if-modified-since")).toBe(lastModified);
      expect(conditional?.has("if-none-match")).toBe(false);
    }));

  it("replaces the entry when upstream returns 200", () =>
    withHarness(async ({ get, upstream, clock, counters }) => {
      upstream.respond = () => okResult('{"v":1}', { etag: '"v1"' });
      await get(REPO);
      clock.now += TTL_PLUS;

      upstream.respond = () => okResult('{"v":2}', { etag: '"v2"' });
      const changed = await get(REPO);
      expect(changed.headers.get("x-backstop-cache")).toBe("MISS");
      expect(await changed.text()).toBe('{"v":2}');

      const hit = await get(REPO);
      expect(await hit.text()).toBe('{"v":2}');
      clock.now += TTL_PLUS;
      await get(REPO);
      expect(upstream.calls[2]?.headers.get("if-none-match")).toBe('"v2"');
      expect(counters()).toMatchObject({ upstream_calls: 3, revalidated: 0 });
    }));

  it("sends no validators on a cold miss", () =>
    withHarness(async ({ get, upstream }) => {
      await get(REPO, { "If-None-Match": '"from-client"' });
      expect(upstream.calls[0]?.headers.has("if-none-match")).toBe(false);
      expect(upstream.calls[0]?.headers.has("if-modified-since")).toBe(false);
    }));

  it("revalidates against the mock end to end", async () => {
    const stub = env.RepoGateway.getByName("test:revalidate-mock");
    await runInDurableObject(stub, async (_instance, state) => {
      const clock = { now: 1_000_000 };
      const counters = new Counters(state.storage.sql);
      const cache = new ReadThroughCache(
        new CacheStore(state.storage.sql),
        counters,
        {
          now: () => clock.now,
          upstream: (namespace, request) =>
            fetchUpstream(namespace, request, {
              fetch: () => Promise.reject(new Error("unused")),
              timeoutMs: 1000,
              mock: { latencyMs: () => 0 },
            }),
        },
      );
      const read = () =>
        cache.read(new Request(`http://backstop.test${REPO}`), route(REPO));

      expect((await read()).headers.get("x-backstop-cache")).toBe("MISS");
      clock.now += TTL_PLUS;
      const second = await read();
      expect(second.headers.get("x-backstop-cache")).toBe("REVALIDATED");
      expect(await second.json()).toMatchObject({ full_name: "demo/api" });
      expect(counters.snapshot().revalidated).toBe(1);
    });
  });
});
