import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import type { Tool } from "ai";
import { describe, expect, it } from "vitest";
import { createOpsTools } from "../../src/agent/tools";
import { REGISTRY_NAME } from "../../src/gateway/registry";

const GH = "http://backstop.test/demo/gh/repos";
const OPTIONS = { toolCallId: "call-1", messages: [] };

const tools = createOpsTools({ env, namespace: () => "demo" });

async function run<INPUT, OUTPUT>(
  target: Tool<INPUT, OUTPUT>,
  input: INPUT,
): Promise<unknown> {
  if (!target.execute) throw new Error("tool has no execute");
  return target.execute(input, OPTIONS);
}

async function needsApproval<INPUT, OUTPUT>(
  target: Tool<INPUT, OUTPUT>,
  input: INPUT,
): Promise<boolean> {
  const rule = target.needsApproval;
  return typeof rule === "function" ? rule(input, OPTIONS) : rule === true;
}

async function seed(repo: string, requests = 1): Promise<void> {
  for (let i = 0; i < requests; i++) {
    const read = await exports.default.fetch(`${GH}/${repo}/issues`);
    await read.body?.cancel();
  }
  const registry = env.Registry.getByName(REGISTRY_NAME);
  for (let i = 0; i < 30; i++) {
    if (await registry.hasRepo("demo", repo)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`registry never saw ${repo}`);
}

async function queueWrite(repo: string): Promise<void> {
  const write = await exports.default.fetch(`${GH}/${repo}/issues/1/comments`, {
    method: "POST",
    headers: { authorization: "token ghp_secretvalue" },
    body: JSON.stringify({ body: "private words" }),
  });
  expect(write.status).toBe(202);
  await write.body?.cancel();
}

describe("read tools", () => {
  it("getRepoHealth reports breaker and window facts", async () => {
    await seed("demo/api", 2);
    expect(await run(tools.getRepoHealth, { repo: "Demo/API" })).toMatchObject({
      namespace: "demo",
      repo: "demo/api",
      mode: "normal",
      breaker: { state: "closed", openUntil: null },
      lastMinute: { errorRatePercent: 0, consecutiveFailures: 0 },
      totals: { requests: 2, cacheHits: 1, upstreamCalls: 1 },
      writesPaused: false,
    });
  });

  it("getOverview reports totals, chaos and repos", async () => {
    await seed("demo/web");
    const overview = await run(tools.getOverview, {});
    expect(overview).toMatchObject({
      namespace: "demo",
      chaos: { mode: "off" },
      repos: expect.arrayContaining([
        expect.objectContaining({ repo: "demo/web", breaker: "closed" }),
      ]),
    });
  });

  it("getRecentEvents caps rows and trims empty fields", async () => {
    await seed("demo/infra", 3);
    const result = await run(tools.getRecentEvents, {
      repo: "demo/infra",
      limit: 2,
    });
    expect(result).toMatchObject({ repo: "demo/infra" });
    const { events } = result as { events: Record<string, unknown>[] };
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "read", method: "GET" });
    expect(events[0]).not.toHaveProperty("latencyMs");
  });

  it("returns an error for repos without traffic or bad names", async () => {
    expect(await run(tools.listQueue, { repo: "nobody/nothing" })).toEqual({
      error: "No traffic seen for demo/nobody/nothing yet",
    });
    expect(await run(tools.listQueue, { repo: "just-a-name" })).toEqual({
      error: "just-a-name is not an owner/name repo",
    });
  });
});

describe("action tools", () => {
  it("pause holds writes, listQueue shows them without secrets", async () => {
    await seed("demo/queue");
    expect(
      await run(tools.setWritesPaused, { repo: "demo/queue", paused: true }),
    ).toMatchObject({ repo: "demo/queue", result: { paused: true } });
    await queueWrite("demo/queue");

    const listing = await run(tools.listQueue, { repo: "demo/queue" });
    expect(listing).toMatchObject({
      counts: { pending: 1 },
      shown: 1,
      items: [{ method: "POST", status: "pending" }],
    });
    expect(JSON.stringify(listing)).not.toMatch(/private words|ghp_/);

    expect(
      await run(tools.triggerReplay, { repo: "demo/queue" }),
    ).toMatchObject({ result: { started: false, reason: "paused" } });
  });

  it("setChaos changes the demo namespace", async () => {
    expect(
      await run(tools.setChaos, { mode: "errors", errorRate: 0.25 }),
    ).toEqual({
      namespace: "demo",
      chaos: { mode: "errors", errorRatePercent: 25 },
    });
    expect(await run(tools.setChaos, { mode: "off" })).toEqual({
      namespace: "demo",
      chaos: { mode: "off" },
    });
  });

  it("asks for approval on demo and refuses live without asking", async () => {
    const blackout = { mode: "blackout" as const };
    expect(await needsApproval(tools.setChaos, blackout)).toBe(true);
    expect(
      await needsApproval(tools.setChaos, { ...blackout, namespace: "live" }),
    ).toBe(false);
    expect(
      await run(tools.setChaos, { ...blackout, namespace: "live" }),
    ).toMatchObject({ refused: true });
    expect(
      await run(tools.triggerReplay, { namespace: "live", repo: "demo/api" }),
    ).toMatchObject({ refused: true });
    expect(
      await run(tools.setWritesPaused, {
        namespace: "live",
        repo: "demo/api",
        paused: true,
      }),
    ).toMatchObject({ refused: true });
    const live = await env.Registry.getByName(REGISTRY_NAME).getChaos("live");
    expect(live.mode).toBe("off");
  });

  it("does not ask for approval on read tools", async () => {
    expect(await needsApproval(tools.getRepoHealth, { repo: "demo/api" })).toBe(
      false,
    );
  });
});
