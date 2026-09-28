import { describe, expect, it } from "vitest";
import { Coalescer } from "../../src/gateway/coalesce";
import { okResult, withHarness } from "./helpers";
import type { UpstreamResult } from "../../src/gateway/upstream";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Coalescer", () => {
  it("shares one task per key and clears it when settled", async () => {
    const coalescer = new Coalescer<number>();
    let runs = 0;
    const task = async () => ++runs;
    const first = coalescer.run("a", task);
    const second = coalescer.run("a", task);
    const other = coalescer.run("b", task);
    expect([first.shared, second.shared, other.shared]).toEqual([
      false,
      true,
      false,
    ]);
    expect(await second.promise).toBe(await first.promise);
    await other.promise;
    expect(coalescer.run("a", task).shared).toBe(false);
  });

  it("clears the key after a failure", async () => {
    const coalescer = new Coalescer<number>();
    const failing = coalescer.run("a", () => Promise.reject(new Error("boom")));
    const follower = coalescer.run("a", async () => 1);
    await expect(failing.promise).rejects.toThrow("boom");
    await expect(follower.promise).rejects.toThrow("boom");
    const retry = coalescer.run("a", async () => 2);
    expect(retry.shared).toBe(false);
    expect(await retry.promise).toBe(2);
  });
});

describe("ReadThroughCache coalescing", () => {
  it("sends ten concurrent identical reads upstream once", () =>
    withHarness(async ({ get, upstream, counters }) => {
      const gate = deferred<UpstreamResult>();
      upstream.respond = () => gate.promise;

      const pending = Array.from({ length: 10 }, () =>
        get("/demo/gh/repos/demo/api/pulls"),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      gate.resolve(okResult('[{"number":7}]'));
      const responses = await Promise.all(pending);

      expect(upstream.calls).toHaveLength(1);
      const coalesced = responses.filter(
        (r) => r.headers.get("x-backstop-coalesced") === "1",
      );
      expect(coalesced).toHaveLength(9);
      for (const response of responses) {
        expect(response.headers.get("x-backstop-cache")).toBe("MISS");
        expect(await response.text()).toBe('[{"number":7}]');
      }
      expect(counters()).toMatchObject({
        upstream_calls: 1,
        upstream_avoided: 9,
      });
    }));

  it("does not coalesce different tokens", () =>
    withHarness(async ({ get, upstream }) => {
      const gate = deferred<UpstreamResult>();
      upstream.respond = () => gate.promise;
      const pending = [
        get("/gh/repos/acme/private", { Authorization: "Bearer a" }),
        get("/gh/repos/acme/private", { Authorization: "Bearer b" }),
      ];
      await new Promise((resolve) => setTimeout(resolve, 10));
      gate.resolve(okResult("{}"));
      await Promise.all(pending);
      expect(upstream.calls).toHaveLength(2);
    }));

  it("lets the next read retry after a failed upstream call", () =>
    withHarness(async ({ get, upstream }) => {
      const gate = deferred<UpstreamResult>();
      upstream.respond = () => gate.promise;
      const pending = [
        get("/demo/gh/repos/demo/api"),
        get("/demo/gh/repos/demo/api"),
      ];
      await new Promise((resolve) => setTimeout(resolve, 10));
      gate.reject(new Error("upstream crashed"));
      const settled = await Promise.allSettled(pending);
      expect(settled.every((s) => s.status === "rejected")).toBe(true);

      upstream.respond = () => okResult("{}");
      const retry = await get("/demo/gh/repos/demo/api");
      expect(retry.status).toBe(200);
      expect(retry.headers.has("x-backstop-coalesced")).toBe(false);
      expect(upstream.calls).toHaveLength(2);
    }));
});
