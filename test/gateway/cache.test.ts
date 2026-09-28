import { describe, expect, it } from "vitest";
import { cacheKey } from "../../src/gateway/cache";
import { route } from "./helpers";

function key(path: string, headers: HeadersInit = {}, method = "GET") {
  return cacheKey(
    new Request(`http://backstop.test${path}`, { headers, method }),
    route(path),
  );
}

describe("cacheKey", () => {
  it("ignores query parameter order", async () => {
    expect(await key("/gh/repos/a/b/issues?state=open&page=2")).toBe(
      await key("/gh/repos/a/b/issues?page=2&state=open"),
    );
  });

  it("separates methods, paths, queries and Accept headers", async () => {
    const base = await key("/gh/repos/a/b/issues");
    expect(await key("/gh/repos/a/b/issues", {}, "HEAD")).not.toBe(base);
    expect(await key("/gh/repos/a/b/pulls")).not.toBe(base);
    expect(await key("/gh/repos/a/b/issues?page=2")).not.toBe(base);
    expect(
      await key("/gh/repos/a/b/issues", {
        Accept: "application/vnd.github.raw",
      }),
    ).not.toBe(base);
  });

  it("scopes by token and never stores the token", async () => {
    const anonymous = await key("/gh/repos/a/b");
    const tokenA = await key("/gh/repos/a/b", { Authorization: "Bearer aaa" });
    const tokenB = await key("/gh/repos/a/b", { Authorization: "Bearer bbb" });
    expect(anonymous).toContain('"public"');
    expect(tokenA).not.toBe(anonymous);
    expect(tokenA).not.toBe(tokenB);
    expect(tokenA).not.toContain("aaa");
    expect(tokenA).toMatch(/"[0-9a-f]{16}"\]$/);
  });

  it("treats token and bearer schemes for the same token as one scope", async () => {
    expect(await key("/gh/repos/a/b", { Authorization: "token aaa" })).toBe(
      await key("/gh/repos/a/b", { Authorization: "Bearer aaa" }),
    );
  });
});
