import { env, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import { CHAOS_OFF } from "../../src/gateway/chaos";
import { REGISTRY_NAME } from "../../src/gateway/registry";

const BASE = "http://backstop.test";
const GH = `${BASE}/demo/gh/repos/demo/infra`;
const API = `${BASE}/api/repos/demo/demo/infra`;
const COOLDOWN_MS = 30_000;

interface QueueItem {
  id: string;
  status: string;
  resultStatus: number | null;
  updatedAt: number;
}

async function read(path: string) {
  const response = await exports.default.fetch(`${GH}${path}`);
  await response.body?.cancel();
  return {
    status: response.status,
    cache: response.headers.get("x-backstop-cache"),
    mode: response.headers.get("x-backstop-mode"),
  };
}

async function comment(key: string, text: string) {
  const response = await exports.default.fetch(`${GH}/issues/1/comments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
      authorization: "token ghp_e2e_agent",
    },
    body: JSON.stringify({ body: text }),
  });
  return {
    status: response.status,
    body: (await response.json()) as { id: string },
  };
}

async function queue(): Promise<QueueItem[]> {
  const response = await exports.default.fetch(`${API}/queue`);
  return ((await response.json()) as { items: QueueItem[] }).items;
}

function setChaos(mode: "off" | "blackout") {
  return env.Registry.getByName(REGISTRY_NAME).setChaos("demo", {
    ...CHAOS_OFF,
    mode,
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

it("reads, serves stale in a blackout, queues writes, recovers and replays them in order", async () => {
  expect(await read("/issues?state=open")).toMatchObject({
    status: 200,
    cache: "MISS",
  });
  expect((await read("/issues?state=open")).cache).toBe("HIT");

  await runInDurableObject(
    env.RepoGateway.getByName("demo:demo/infra"),
    async (_instance, state) => {
      state.storage.sql.exec("UPDATE cache_entries SET expires_at = 0");
    },
  );
  await setChaos("blackout");
  await sleep(2_100);

  expect(await read("/issues?state=open")).toMatchObject({
    status: 200,
    cache: "STALE",
  });
  for (let page = 1; page <= 5; page++) await read(`/pulls?page=${page}`);
  expect(await read("/issues?state=open")).toMatchObject({
    cache: "STALE",
    mode: "degraded",
  });

  const first = await comment("e2e-1", "first");
  const second = await comment("e2e-2", "second");
  expect(first.status).toBe(202);
  expect(second.status).toBe(202);
  expect((await comment("e2e-1", "first")).body.id).toBe(first.body.id);

  await setChaos("off");
  await sleep(COOLDOWN_MS + 1_000);
  expect(await read("/issues?state=open")).toMatchObject({
    status: 200,
    mode: "normal",
  });

  let items: QueueItem[] = [];
  for (let i = 0; i < 60; i++) {
    items = await queue();
    if (items.every((item) => item.status === "done")) break;
    await sleep(250);
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  const firstDone = byId.get(first.body.id);
  const secondDone = byId.get(second.body.id);
  expect(firstDone).toMatchObject({ status: "done", resultStatus: 201 });
  expect(secondDone).toMatchObject({ status: "done", resultStatus: 201 });
  expect(firstDone?.updatedAt ?? 0).toBeLessThanOrEqual(
    secondDone?.updatedAt ?? 0,
  );

  const incidents = await exports.default.fetch(
    `${BASE}/api/incidents?namespace=demo&repo=demo/infra`,
  );
  const [incident] = (
    (await incidents.json()) as { incidents: Record<string, unknown>[] }
  ).incidents;
  expect(incident).toMatchObject({
    endedAt: expect.any(Number),
    writesQueued: 2,
    writesReplayed: 2,
  });
  expect(incident?.readsServedStale).toBeGreaterThanOrEqual(1);
}, 90_000);
