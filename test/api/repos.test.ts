import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

const BASE = "http://backstop.test/api/repos";

async function status(path: string): Promise<number> {
  const response = await exports.default.fetch(`${BASE}${path}`);
  await response.body?.cancel();
  return response.status;
}

it("returns health, breaker state and stats for a repo with traffic", async () => {
  const read = await exports.default.fetch(
    "http://backstop.test/demo/gh/repos/Demo/Health/issues",
  );
  await read.body?.cancel();

  let response = await exports.default.fetch(`${BASE}/demo/demo/health`);
  for (let i = 0; i < 20 && response.status === 404; i++) {
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 100));
    response = await exports.default.fetch(`${BASE}/demo/demo/health`);
  }
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    namespace: "demo",
    repoKey: "demo/health",
    mode: "normal",
    breaker: { state: "closed" },
    health: { requestCount: 1, errorRate: 0, consecutiveFailures: 0 },
    counters: { requests: 1, upstream_calls: 1 },
  });
});

it("returns 404 for a repo without traffic", async () => {
  expect(await status("/demo/nobody/nothing")).toBe(404);
});

it("rejects bad namespaces and names", async () => {
  expect(await status("/staging/a/b")).toBe(400);
  expect(await status("/demo/a/b%2Fc")).toBe(400);
  expect(await status("/demo/a")).toBe(404);
  expect(await status("/demo/a/b/c")).toBe(404);
});
