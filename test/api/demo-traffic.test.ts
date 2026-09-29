import { env, runDurableObjectAlarm } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { afterEach, expect, it } from "vitest";
import { REGISTRY_NAME } from "../../src/gateway/registry";

const BASE = "http://backstop.test/api/demo/traffic";

function call(path: string, body?: unknown): Promise<Response> {
  return exports.default.fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function demoRequests(): Promise<number> {
  const response = await exports.default.fetch(
    "http://backstop.test/api/overview?namespace=demo",
  );
  const { totals } = (await response.json()) as {
    totals: { requests: number };
  };
  return totals.requests;
}

afterEach(async () => {
  await (await call("/stop", {})).body?.cancel();
});

it("runs simulated agents through the gateway on registry alarms", async () => {
  const started = await call("/start", { agents: 3, durationSeconds: 10 });
  expect(started.status).toBe(200);
  expect(await started.json()).toMatchObject({ running: true, agents: 3 });

  const again = await call("/start", { agents: 1, durationSeconds: 10 });
  expect(again.status).toBe(409);
  await again.body?.cancel();

  const registry = env.Registry.getByName(REGISTRY_NAME);
  expect(await runDurableObjectAlarm(registry)).toBe(true);
  const status = (await (await call("")).json()) as { requestsSent: number };
  expect(status.requestsSent).toBe(6);

  let requests = 0;
  for (let i = 0; i < 30 && requests < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    requests = await demoRequests();
  }
  expect(requests).toBeGreaterThanOrEqual(6);

  const stopped = await call("/stop", {});
  expect(await stopped.json()).toMatchObject({ running: false });
});

it("validates the request", async () => {
  for (const body of [
    { agents: 0, durationSeconds: 10 },
    { agents: 21, durationSeconds: 10 },
    { agents: 2, durationSeconds: 5 },
    { agents: 2, durationSeconds: 181 },
    { agents: 2, durationSeconds: 30, extra: true },
  ]) {
    const response = await call("/start", body);
    expect(response.status, JSON.stringify(body)).toBe(400);
    await response.body?.cancel();
  }
  const wrongMethod = await call("/start");
  expect(wrongMethod.status).toBe(405);
  await wrongMethod.body?.cancel();
  const unknown = await exports.default.fetch(
    "http://backstop.test/api/demo/x",
  );
  expect(unknown.status).toBe(404);
  await unknown.body?.cancel();
});
