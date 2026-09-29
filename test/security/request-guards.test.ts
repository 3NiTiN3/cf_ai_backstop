import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { authScope } from "../../src/gateway/cache";
import { isCrossSite, isJsonRequest } from "../../src/security/origin";

const BASE = "http://backstop.test";

async function status(path: string, init?: RequestInit): Promise<number> {
  const response = await exports.default.fetch(`${BASE}${path}`, init);
  await response.body?.cancel();
  return response.status;
}

describe("gateway request guards", () => {
  it("refuses credentials in the query string", async () => {
    expect(await status("/demo/gh/repos/demo/api?access_token=ghp_leaky")).toBe(
      400,
    );
    expect(await status("/gh/repos/octo/app?client_secret=shh")).toBe(400);
    expect(await status("/demo/gh/repos/demo/api?per_page=5")).toBe(200);
  });

  it("refuses write bodies over 512 KB, declared or streamed", async () => {
    const big = "x".repeat(512 * 1024 + 1);
    expect(
      await status("/demo/gh/repos/demo/web/issues/1/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: big,
      }),
    ).toBe(413);

    const chunk = new TextEncoder().encode("y".repeat(200 * 1024));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 3; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    expect(
      await status("/demo/gh/repos/demo/web/issues/1/comments", {
        method: "POST",
        body: stream,
      }),
    ).toBe(413);
  });
});

describe("API and chat origin guards", () => {
  it("only accepts JSON POSTs on the API", async () => {
    const body = JSON.stringify({ namespace: "demo", mode: "off" });
    expect(
      await status("/api/chaos", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body,
      }),
    ).toBe(415);
    expect(
      await status("/api/chaos", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body,
      }),
    ).toBe(200);
  });

  it("refuses the chat agent from other sites", async () => {
    expect(
      await status("/agents/ops-agent/default/get-messages", {
        headers: { origin: "https://evil.example" },
      }),
    ).toBe(403);
    expect(
      await status("/agents/ops-agent/default/get-messages", {
        headers: { origin: BASE },
      }),
    ).not.toBe(403);
  });

  it("compares origins by host", () => {
    const at = (origin: string | null) =>
      new Request("https://backstop.example/agents/x", {
        headers: origin === null ? {} : { origin },
      });
    expect(isCrossSite(at(null))).toBe(false);
    expect(isCrossSite(at("https://backstop.example"))).toBe(false);
    expect(isCrossSite(at("https://backstop.example.evil.test"))).toBe(true);
    expect(isCrossSite(at("null"))).toBe(true);
    expect(
      isJsonRequest(
        new Request("https://x.test", {
          method: "POST",
          headers: { "content-type": "Application/JSON" },
        }),
      ),
    ).toBe(true);
  });
});

describe("cache scope", () => {
  it("does not change with the auth scheme's casing or spacing", async () => {
    const publicScope = await authScope(null);
    const scope = await authScope("Bearer ghp_abc");
    expect(await authScope("token ghp_abc")).toBe(scope);
    expect(await authScope("BEARER   ghp_abc  ")).toBe(scope);
    expect(scope).not.toBe(publicScope);
    expect(await authScope("Bearer ghp_other")).not.toBe(scope);
    expect(await authScope("Bearer ghp_abc, Bearer ghp_other")).not.toBe(scope);
    expect(await authScope("")).toBe(publicScope);
  });
});
