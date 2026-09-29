import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { REGISTRY_NAME } from "../../src/gateway/registry";

const BASE = "http://backstop.test";
const GH = `${BASE}/demo/gh/repos/demo/api`;

interface Listing {
  namespace: string;
  incidents: Record<string, unknown>[];
}

async function fetchJson(path: string): Promise<[number, unknown]> {
  const response = await exports.default.fetch(`${BASE}${path}`);
  return [response.status, await response.json()];
}

async function registerRepo(): Promise<void> {
  const registry = env.Registry.getByName(REGISTRY_NAME);
  for (let i = 0; i < 30; i++) {
    const read = await exports.default.fetch(GH);
    await read.body?.cancel();
    if (await registry.hasRepo("demo", "demo/api")) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("repo was not registered");
}

function setChaos(mode: string): Promise<unknown> {
  return env.Registry.getByName(REGISTRY_NAME).setChaos("demo", {
    mode: mode === "blackout" ? "blackout" : "off",
    errorRate: 0,
    latencyMs: 0,
  });
}

afterEach(() => setChaos("off"));

describe("incidents API", () => {
  it("opens an incident when a blackout opens the breaker", async () => {
    await registerRepo();
    await setChaos("blackout");
    await new Promise((resolve) => setTimeout(resolve, 2100));
    for (let i = 1; i <= 6; i++) {
      const read = await exports.default.fetch(`${GH}/issues/${i}`);
      await read.body?.cancel();
    }
    const write = await exports.default.fetch(`${GH}/issues/1/comments`, {
      method: "POST",
      body: JSON.stringify({ body: "hello" }),
    });
    expect(write.status).toBe(202);
    await write.body?.cancel();

    const [status, body] = await fetchJson(
      "/api/incidents?namespace=demo&repo=demo/api",
    );
    expect(status).toBe(200);
    const { incidents } = body as Listing;
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({
      repo: "demo/api",
      endedAt: null,
      peakErrorRate: expect.closeTo(5 / 6),
      writesQueued: 1,
      summary: null,
    });

    const [, all] = await fetchJson("/api/incidents");
    expect((all as Listing).incidents).toEqual(incidents);
  });

  it("validates the query", async () => {
    expect((await fetchJson("/api/incidents?namespace=prod"))[0]).toBe(400);
    expect((await fetchJson("/api/incidents?repo=just-a-name"))[0]).toBe(400);
    expect((await fetchJson("/api/incidents?repo=nobody/nothing"))[0]).toBe(
      404,
    );
    const post = await exports.default.fetch(`${BASE}/api/incidents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(post.status).toBe(405);
    await post.body?.cancel();
  });
});
