import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { LIMIT_RULES, limitRequest } from "../../src/security/request-limits";

function chaosPost(ip: string): Promise<Response> {
  return exports.default.fetch("http://backstop.test/api/chaos", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify({ namespace: "demo", mode: "off" }),
  });
}

describe("request limits", () => {
  it("answers 429 with Retry-After once a client passes the demo action limit", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 35; i++) {
      const response = await chaosPost("203.0.113.7");
      statuses.push(response.status);
      if (response.status === 429) {
        expect(response.headers.get("retry-after")).toBe("60");
        expect(await response.json()).toMatchObject({ retryAfterSeconds: 60 });
        break;
      }
      await response.body?.cancel();
    }
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.filter((code) => code === 200).length).toBe(30);

    const other = await chaosPost("203.0.113.8");
    expect(other.status).toBe(200);
    await other.body?.cancel();
  });

  it("picks the rule for each public demo path and leaves reads of the API alone", () => {
    const rule = (method: string, path: string) =>
      LIMIT_RULES.find((candidate) =>
        candidate.applies(
          new Request(`https://x.test${path}`, { method }),
          path,
        ),
      )?.name ?? null;
    expect(rule("GET", "/demo/gh/repos/demo/api")).toBe("demo-gateway");
    expect(rule("POST", "/api/chaos")).toBe("demo-actions");
    expect(rule("POST", "/api/demo/story")).toBe("demo-actions");
    expect(rule("POST", "/api/repos/demo/demo/api/replay")).toBe(
      "demo-actions",
    );
    expect(rule("POST", "/mcp")).toBe("mcp");
    expect(rule("GET", "/api/overview")).toBeNull();
    expect(rule("GET", "/api/demo/story")).toBeNull();
    expect(rule("GET", "/gh/repos/octo/app")).toBeNull();
  });

  it("keys limits by client address", async () => {
    const keys: string[] = [];
    const fake = {
      ...env,
      MCP_LIMITER: {
        limit: async ({ key }: { key: string }) => {
          keys.push(key);
          return { success: true };
        },
      },
    } as Env;
    await limitRequest(
      new Request("https://x.test/mcp", {
        method: "POST",
        headers: { "cf-connecting-ip": "198.51.100.4" },
      }),
      fake,
    );
    expect(keys).toEqual(["mcp:198.51.100.4"]);
  });
});
