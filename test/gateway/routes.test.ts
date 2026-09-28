import { describe, expect, it } from "vitest";
import {
  durableObjectName,
  parseGatewayUrl,
  type GatewayRoute,
} from "../../src/gateway/routes";

function parse(path: string): GatewayRoute | null {
  return parseGatewayUrl(new URL(`http://backstop.test${path}`));
}

describe("parseGatewayUrl", () => {
  it("maps /gh to the live namespace", () => {
    expect(parse("/gh/repos/cloudflare/workers-sdk")).toEqual({
      namespace: "live",
      upstreamPath: "/repos/cloudflare/workers-sdk",
      search: "",
      repoKey: "cloudflare/workers-sdk",
    });
  });

  it("maps /demo/gh to the demo namespace", () => {
    expect(parse("/demo/gh/repos/demo/api/pulls")).toMatchObject({
      namespace: "demo",
      upstreamPath: "/repos/demo/api/pulls",
      repoKey: "demo/api",
    });
  });

  it("lowercases the repo key but keeps the upstream path", () => {
    expect(parse("/gh/repos/Cloudflare/Workers-SDK")).toMatchObject({
      upstreamPath: "/repos/Cloudflare/Workers-SDK",
      repoKey: "cloudflare/workers-sdk",
    });
  });

  it("keeps trailing slashes in the path and ignores them in the key", () => {
    expect(parse("/gh/repos/demo/api/")).toMatchObject({
      upstreamPath: "/repos/demo/api/",
      repoKey: "demo/api",
    });
  });

  it("separates the query string", () => {
    expect(parse("/gh/repos/demo/api/issues?state=open&page=2")).toMatchObject({
      upstreamPath: "/repos/demo/api/issues",
      search: "?state=open&page=2",
      repoKey: "demo/api",
    });
  });

  it("decodes encoded characters for the key", () => {
    expect(parse("/gh/repos/demo/my%2Erepo")).toMatchObject({
      upstreamPath: "/repos/demo/my%2Erepo",
      repoKey: "demo/my.repo",
    });
  });

  it("sends encoded slashes and invalid names to the global key", () => {
    expect(parse("/gh/repos/demo%2Fapi/x")?.repoKey).toBe("_global");
    expect(parse("/gh/repos/demo/%E0%A4%A")?.repoKey).toBe("_global");
    expect(parse("/gh/repos/demo/..")?.repoKey).toBe("_global");
  });

  it("uses the global key when the repo is missing", () => {
    expect(parse("/gh/repos/demo")?.repoKey).toBe("_global");
    expect(parse("/gh/repos/demo/")?.repoKey).toBe("_global");
    expect(parse("/gh/repos")?.repoKey).toBe("_global");
  });

  it("uses the global key for non repo paths", () => {
    expect(parse("/gh/user")).toMatchObject({
      upstreamPath: "/user",
      repoKey: "_global",
    });
    expect(parse("/gh")).toMatchObject({ upstreamPath: "/" });
    expect(parse("/demo/gh/")).toMatchObject({
      namespace: "demo",
      upstreamPath: "/",
    });
  });

  it("returns null for paths outside the gateway", () => {
    expect(parse("/")).toBeNull();
    expect(parse("/ghost/repos/a/b")).toBeNull();
    expect(parse("/demo/ghx/repos/a/b")).toBeNull();
    expect(parse("/agents/ops-agent/x")).toBeNull();
  });
});

describe("durableObjectName", () => {
  it("joins namespace and repo key", () => {
    const route = parse("/demo/gh/repos/demo/api");
    expect(route && durableObjectName(route)).toBe("demo:demo/api");
  });
});
