import { env, introspectWorkflow } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const API = "http://backstop.test/api/repos";
const GH = "http://backstop.test/demo/gh/repos/demo/web";

function post(path: string, headers: HeadersInit = {}): Promise<Response> {
  return exports.default.fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
  });
}

async function registerRepo(): Promise<void> {
  const read = await exports.default.fetch(GH);
  await read.body?.cancel();
  for (let i = 0; i < 20; i++) {
    const health = await exports.default.fetch(`${API}/demo/demo/web`);
    await health.body?.cancel();
    if (health.status === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("repo was not registered");
}

describe("repo actions", () => {
  it("needs the admin token on the live namespace", async () => {
    for (const action of ["replay", "pause", "resume"]) {
      const response = await post(`/live/octo/app/${action}`);
      expect(response.status).toBe(401);
      await response.body?.cancel();
    }
    const wrong = await post("/live/octo/app/pause", {
      authorization: "Bearer nope",
    });
    expect(wrong.status).toBe(401);
    await wrong.body?.cancel();
  });

  it("returns 404 for unknown actions and repos and 405 for wrong methods", async () => {
    const unknown = await post("/demo/demo/web/explode");
    expect(unknown.status).toBe(404);
    await unknown.body?.cancel();

    const unseen = await post("/demo/nobody/nothing/replay");
    expect(unseen.status).toBe(404);
    await unseen.body?.cancel();

    const wrongMethod = await exports.default.fetch(
      `${API}/demo/demo/web/replay`,
    );
    expect(wrongMethod.status).toBe(405);
    await wrongMethod.body?.cancel();
  });

  it("reports an empty queue on manual replay", async () => {
    await registerRepo();
    const response = await post("/demo/demo/web/replay");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ started: false, reason: "empty" });
  });
});

it("holds writes while paused and drains them in order on resume", async () => {
  await registerRepo();
  const paused = await post("/demo/demo/web/pause");
  expect(await paused.json()).toEqual({ paused: true, replay: null });

  for (const body of ["first", "second", "third"]) {
    const response = await exports.default.fetch(`${GH}/issues/1/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    expect(response.status).toBe(202);
    await response.body?.cancel();
  }
  const health = await exports.default.fetch(`${API}/demo/demo/web`);
  expect(await health.json()).toMatchObject({
    writesPaused: true,
    mode: "normal",
  });

  const workflows = await introspectWorkflow(env.ReplayWorkflow);
  try {
    const resumed = await post("/demo/demo/web/resume");
    expect(await resumed.json()).toMatchObject({
      paused: false,
      replay: { started: true },
    });
    const [instance] = await workflows.get();
    if (!instance) throw new Error("no replay instance started");
    await instance.waitForStatus("complete");
    expect(await instance.getOutput()).toEqual({
      sent: 3,
      failed: 0,
      stopped: false,
    });
  } finally {
    await workflows.dispose();
  }

  const gateway = env.RepoGateway.getByName("demo:demo/web");
  const events = await gateway.getRecentEvents(50);
  expect(events.filter((event) => event.kind === "replay")).toHaveLength(3);
  expect(events).toContainEqual(
    expect.objectContaining({ kind: "writes", detail: "resumed" }),
  );
  expect(events).toContainEqual(
    expect.objectContaining({
      kind: "replay_started",
      detail: expect.stringMatching(/^resumed: /),
    }),
  );
});
