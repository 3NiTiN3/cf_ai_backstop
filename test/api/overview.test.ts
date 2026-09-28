import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

interface OverviewBody {
  namespace: string;
  totals: Record<string, number>;
  repos: {
    repoKey: string;
    requests: number;
    hits: number;
    requestsPerMinute: number;
    queueDepth: number;
  }[];
}

async function overview(): Promise<OverviewBody> {
  const response = await exports.default.fetch(
    "http://backstop.test/api/overview?namespace=demo",
  );
  expect(response.status).toBe(200);
  return response.json();
}

async function eventually<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
) {
  const deadline = Date.now() + 5000;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

it("shows demo requests in the overview", async () => {
  for (let i = 0; i < 3; i++) {
    const response = await exports.default.fetch(
      "http://backstop.test/demo/gh/repos/demo/infra/commits",
    );
    await response.body?.cancel();
  }

  const body = await eventually(overview, (value) =>
    value.repos.some(
      (repo) => repo.repoKey === "demo/infra" && repo.requests === 3,
    ),
  );
  expect(body.namespace).toBe("demo");
  expect(body.repos).toContainEqual(
    expect.objectContaining({
      repoKey: "demo/infra",
      requests: 3,
      hits: 2,
      requestsPerMinute: 3,
      queueDepth: 0,
    }),
  );
  expect(body.totals.requests).toBeGreaterThanOrEqual(3);
});

it("exposes stats and recent events over RPC", async () => {
  const gateway = env.RepoGateway.getByName("demo:demo/api");
  const before = (await gateway.getStats()).counters;
  const response = await exports.default.fetch(
    "http://backstop.test/demo/gh/repos/demo/api/issues?state=all",
  );
  await response.body?.cancel();

  const stats = await gateway.getStats();
  expect(stats.counters.requests).toBe(before.requests + 1);
  expect(stats.lastEventAt).toEqual(expect.any(Number));

  const [event] = await gateway.getRecentEvents(10);
  expect(event).toMatchObject({
    kind: "read",
    method: "GET",
    path: "/repos/demo/api/issues?state=all",
    status: 200,
  });
  expect(["MISS", "HIT"]).toContain(event?.cache);
});

it("validates the namespace and rejects unknown API paths", async () => {
  const bad = await exports.default.fetch(
    "http://backstop.test/api/overview?namespace=prod",
  );
  expect(bad.status).toBe(400);
  const missing = await exports.default.fetch("http://backstop.test/api/nope");
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({ message: "Not Found" });
});
