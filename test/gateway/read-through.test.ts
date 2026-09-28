import { describe, expect, it } from "vitest";
import { okResult, withHarness } from "./helpers";

describe("ReadThroughCache", () => {
  it("misses then hits", () =>
    withHarness(async ({ get, upstream, rows }) => {
      const first = await get("/demo/gh/repos/demo/api");
      expect(first.headers.get("x-backstop-cache")).toBe("MISS");
      expect(await first.text()).toBe('{"n":1}');

      const second = await get("/demo/gh/repos/demo/api");
      expect(second.headers.get("x-backstop-cache")).toBe("HIT");
      expect(second.headers.get("content-type")).toBe("application/json");
      expect(await second.text()).toBe('{"n":1}');
      expect(upstream.calls).toHaveLength(1);
      expect(upstream.calls[0]?.url).toBe(
        "https://api.github.com/repos/demo/api",
      );

      expect(rows()).toEqual([expect.objectContaining({ hits: 1 })]);
    }));

  it("fetches again after the TTL expires", () =>
    withHarness(async ({ get, upstream, clock }) => {
      await get("/demo/gh/repos/demo/api");
      clock.now += 59_000;
      expect(
        (await get("/demo/gh/repos/demo/api")).headers.get("x-backstop-cache"),
      ).toBe("HIT");
      clock.now += 2_000;
      expect(
        (await get("/demo/gh/repos/demo/api")).headers.get("x-backstop-cache"),
      ).toBe("MISS");
      expect(upstream.calls).toHaveLength(2);
    }));

  it("keeps separate entries per token", () =>
    withHarness(async ({ get, upstream }) => {
      const path = "/gh/repos/acme/private";
      const tokenA = { Authorization: "Bearer token-a" };
      const tokenB = { Authorization: "Bearer token-b" };
      upstream.respond = (request) =>
        okResult(JSON.stringify({ for: request.headers.get("authorization") }));

      await get(path, tokenA);
      const b = await get(path, tokenB);
      expect(b.headers.get("x-backstop-cache")).toBe("MISS");
      expect(await b.json()).toEqual({ for: "Bearer token-b" });

      const again = await get(path, tokenA);
      expect(again.headers.get("x-backstop-cache")).toBe("HIT");
      expect(await again.json()).toEqual({ for: "Bearer token-a" });
      expect(upstream.calls).toHaveLength(2);
    }));

  it("never serves authenticated entries to anonymous callers", () =>
    withHarness(async ({ get, upstream }) => {
      const path = "/gh/repos/acme/private";
      upstream.respond = (request) =>
        okResult(request.headers.has("authorization") ? "secret" : "public");

      await get(path, { Authorization: "Bearer token-a" });
      const anonymous = await get(path);
      expect(anonymous.headers.get("x-backstop-cache")).toBe("MISS");
      expect(await anonymous.text()).toBe("public");
      expect(upstream.calls[1]?.headers.has("authorization")).toBe(false);
    }));

  it("does not cache non-200 responses", () =>
    withHarness(async ({ get, upstream, rows }) => {
      upstream.respond = () =>
        okResult('{"message":"Not Found"}', {
          status: 404,
          outcome: "client_error",
        });
      const first = await get("/demo/gh/repos/demo/missing");
      expect(first.status).toBe(404);
      const second = await get("/demo/gh/repos/demo/missing");
      expect(second.headers.get("x-backstop-cache")).toBe("MISS");
      expect(upstream.calls).toHaveLength(2);
      expect(rows()).toHaveLength(0);
    }));

  it("answers unreachable upstreams with 503 and caches nothing", () =>
    withHarness(async ({ get, upstream, rows }) => {
      for (const outcome of ["timeout", "network_error"] as const) {
        upstream.respond = () => okResult("", { status: 504, outcome });
        const response = await get("/gh/repos/a/b");
        expect(response.status).toBe(503);
        expect(response.headers.get("x-backstop-cache")).toBe("MISS");
        expect(response.headers.get("retry-after")).toBe("5");
        expect(await response.json()).toEqual({
          error: "upstream_unavailable",
          retryAfterSeconds: 5,
        });
      }
      expect(rows()).toHaveLength(0);
    }));
});
