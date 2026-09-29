import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { CHAOS_OFF } from "../../src/gateway/chaos";
import { REGISTRY_NAME } from "../../src/gateway/registry";
import { backstopStatus, githubRead, githubWrite } from "../../src/mcp/tools";

const TOKEN = "ghp_mcp_secret_value";
const context = { env, token: TOKEN };

afterEach(() =>
  env.Registry.getByName(REGISTRY_NAME).setChaos("demo", CHAOS_OFF),
);

describe("github_read", () => {
  it("reads through the gateway and reports cache status", async () => {
    const first = await githubRead(context, {
      namespace: "demo",
      path: "/repos/demo/api",
    });
    expect(first).toMatchObject({ status: 200, cache: "MISS", mode: "normal" });
    expect(JSON.parse(first.body)).toMatchObject({ full_name: "demo/api" });

    const second = await githubRead(context, {
      namespace: "demo",
      path: "/repos/demo/api",
    });
    expect(second.cache).toBe("HIT");
    expect(JSON.stringify(second)).not.toContain(TOKEN);
  });
});

describe("github_write", () => {
  it("sends a write when GitHub is healthy", async () => {
    const result = await githubWrite(
      { env, token: null },
      {
        namespace: "demo",
        method: "POST",
        path: "/repos/demo/web/issues/1/comments",
        body: { body: "from MCP" },
        idempotencyKey: "mcp-sent-1",
      },
    );
    expect(result).toMatchObject({ outcome: "sent", status: 201 });
  });

  it("queues a safe write during an outage and says so", async () => {
    await env.Registry.getByName(REGISTRY_NAME).setChaos("demo", {
      ...CHAOS_OFF,
      mode: "blackout",
    });
    const result = await githubWrite(context, {
      namespace: "demo",
      method: "POST",
      path: "/repos/demo/infra/issues/2/comments",
      body: { body: "while GitHub is down" },
      idempotencyKey: "mcp-queued-1",
    });
    expect(result).toMatchObject({ status: 202, cache: "QUEUED" });
    expect(result.outcome).toMatch(/^queued: GitHub is unavailable/);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("refuses live writes without a token", async () => {
    expect(
      await githubWrite(
        { env, token: null },
        { namespace: "live", method: "POST", path: "/repos/a/b/issues" },
      ),
    ).toEqual({
      outcome: "refused",
      message: "Live writes need a GitHub token in the x-github-token header.",
    });
  });
});

describe("backstop_status", () => {
  it("reports a namespace and one repo", async () => {
    await githubRead(context, { namespace: "demo", path: "/repos/demo/web" });
    const namespace = await backstopStatus(context, { namespace: "demo" });
    expect(namespace).toMatchObject({
      namespace: "demo",
      chaos: { mode: "off" },
      recentIncidents: expect.any(Array),
    });

    const repo = await backstopStatus(context, {
      namespace: "demo",
      repo: "demo/web",
    });
    expect(repo).toMatchObject({
      repo: "demo/web",
      breaker: { state: "closed" },
      queue: expect.objectContaining({ pending: expect.any(Number) }),
    });
  });

  it("explains unknown and invalid repos", async () => {
    expect(
      await backstopStatus(context, { namespace: "demo", repo: "no/where" }),
    ).toEqual({ error: "No traffic seen for demo/no/where yet" });
    expect(
      await backstopStatus(context, { namespace: "demo", repo: "nope" }),
    ).toEqual({ error: "nope is not owner/name" });
  });
});
