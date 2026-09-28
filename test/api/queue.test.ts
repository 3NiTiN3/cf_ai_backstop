import { env, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { WriteQueue } from "../../src/gateway/write-queue";

const API = "http://backstop.test/api/repos/demo/demo/api";
const GH = "http://backstop.test/demo/gh/repos/demo/api";
const ADMIN = { authorization: "Bearer test-admin-token" };

interface Listing {
  counts: Record<string, number>;
  items: Record<string, unknown>[];
}

function post(path: string, headers: HeadersInit = {}): Promise<Response> {
  return exports.default.fetch(`${API}${path}`, { method: "POST", headers });
}

async function pausedRepoWithWrite(body: string): Promise<string> {
  const read = await exports.default.fetch(GH);
  await read.body?.cancel();
  for (let i = 0; i < 20; i++) {
    const paused = await post("/pause");
    await paused.body?.cancel();
    if (paused.status === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const write = await exports.default.fetch(`${GH}/issues/1/comments`, {
    method: "POST",
    headers: { authorization: "token ghp_secretvalue" },
    body: JSON.stringify({ body }),
  });
  expect(write.status).toBe(202);
  const { id }: { id: string } = await write.json();
  return id;
}

async function listing(): Promise<Listing> {
  const response = await exports.default.fetch(`${API}/queue`);
  expect(response.status).toBe(200);
  return response.json();
}

function markFailed(id: string): Promise<void> {
  const gateway = env.RepoGateway.getByName("demo:demo/api");
  return runInDurableObject(gateway, async (_instance, state) => {
    new WriteQueue(state.storage.sql).markFailed(id, 422, "rejected", 1);
  });
}

function sealedToken(id: string) {
  const gateway = env.RepoGateway.getByName("demo:demo/api");
  return runInDurableObject(gateway, async (_instance, state) =>
    new WriteQueue(state.storage.sql).sealedToken(id),
  );
}

describe("queue API", () => {
  it("lists writes without bodies, keys or tokens", async () => {
    const id = await pausedRepoWithWrite("private words");
    const raw = await exports.default.fetch(`${API}/queue`);
    const text = await raw.text();
    expect(text).not.toContain("private words");
    expect(text).not.toContain("ghp_secretvalue");

    const { counts, items } = JSON.parse(text) as Listing;
    expect(counts).toMatchObject({ pending: 1, failed: 0 });
    expect(items[0]).toMatchObject({
      id,
      method: "POST",
      path: "/repos/demo/api/issues/1/comments",
      status: "pending",
    });
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(
      [
        "attempts",
        "createdAt",
        "id",
        "lastError",
        "method",
        "path",
        "resultStatus",
        "seq",
        "status",
        "updatedAt",
      ].sort(),
    );
  });

  it("moves a failed write back to pending and refuses other states", async () => {
    const id = await pausedRepoWithWrite("retry me");
    const early = await post(`/queue/${id}/retry`);
    expect(early.status).toBe(409);
    expect(await early.json()).toEqual({
      message: "Only failed writes can be retried",
    });

    await markFailed(id);
    const retried = await post(`/queue/${id}/retry`);
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({ id, status: "pending" });

    const missing = await post("/queue/nope/retry");
    expect(missing.status).toBe(404);
    await missing.body?.cancel();
  });

  it("drops a write and deletes its token", async () => {
    const id = await pausedRepoWithWrite("drop me");
    expect(await sealedToken(id)).not.toBeNull();

    const dropped = await post(`/queue/${id}/drop`);
    expect(await dropped.json()).toMatchObject({ id, status: "dropped" });
    expect(await sealedToken(id)).toBeNull();

    const again = await post(`/queue/${id}/drop`);
    expect(again.status).toBe(409);
    await again.body?.cancel();
    expect((await listing()).counts.dropped).toBeGreaterThanOrEqual(1);
  });

  it("rejects malformed write ids", async () => {
    const response = await post("/queue/a.b/retry");
    expect(response.status).toBe(404);
    await response.body?.cancel();
  });
});

describe("queue API on live", () => {
  it("needs the admin token to retry or drop", async () => {
    for (const action of ["retry", "drop"]) {
      const response = await exports.default.fetch(
        `http://backstop.test/api/repos/live/octo/app/queue/abc/${action}`,
        { method: "POST" },
      );
      expect(response.status).toBe(401);
      await response.body?.cancel();
    }
  });

  it("accepts the admin token and then checks the repo", async () => {
    const response = await exports.default.fetch(
      "http://backstop.test/api/repos/live/octo/app/queue/abc/drop",
      { method: "POST", headers: ADMIN },
    );
    expect(response.status).toBe(404);
    await response.body?.cancel();
  });
});
