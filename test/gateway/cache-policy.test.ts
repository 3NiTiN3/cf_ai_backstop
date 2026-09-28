import { describe, expect, it } from "vitest";
import { isCacheable, ttlFor } from "../../src/gateway/cache-policy";

const sha = "a".repeat(40);

function ttl(path: string, query = "") {
  return ttlFor(path, new URLSearchParams(query));
}

describe("ttlFor", () => {
  it("keeps contents pinned to a commit sha for a day", () => {
    expect(ttl("/repos/a/b/contents/src/x.ts", `ref=${sha}`)).toBe(86_400_000);
    expect(ttl("/repos/a/b/contents/src/x.ts", "ref=main")).toBe(30_000);
  });

  it("keeps commits by sha for a day", () => {
    expect(ttl(`/repos/a/b/commits/${sha}`)).toBe(86_400_000);
  });

  it("uses 60 seconds for repo metadata", () => {
    expect(ttl("/repos/a/b")).toBe(60_000);
    expect(ttl("/repos/a/b/")).toBe(60_000);
  });

  it("uses 15 seconds for lists and commit status", () => {
    expect(ttl("/repos/a/b/pulls", "state=open")).toBe(15_000);
    expect(ttl("/repos/a/b/issues")).toBe(15_000);
    expect(ttl("/repos/a/b/commits")).toBe(15_000);
    expect(ttl(`/repos/a/b/commits/${sha}/status`)).toBe(15_000);
    expect(ttl("/repos/a/b/issues/3/comments")).toBe(15_000);
  });

  it("does not treat content paths as lists", () => {
    expect(ttl("/repos/a/b/contents/docs/issues")).toBe(30_000);
  });

  it("falls back to 30 seconds", () => {
    expect(ttl("/repos/a/b/pulls/3")).toBe(30_000);
    expect(ttl("/user")).toBe(30_000);
  });
});

describe("isCacheable", () => {
  it("only accepts GET 200 under 1 MB", () => {
    expect(isCacheable("GET", 200, "{}")).toBe(true);
    expect(isCacheable("POST", 200, "{}")).toBe(false);
    expect(isCacheable("GET", 201, "{}")).toBe(false);
    expect(isCacheable("GET", 404, "{}")).toBe(false);
    expect(isCacheable("GET", 304, "")).toBe(false);
    expect(isCacheable("GET", 200, "x".repeat(1024 * 1024))).toBe(false);
  });
});
