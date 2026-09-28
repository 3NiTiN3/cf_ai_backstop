import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { afterEach, expect, it } from "vitest";
import { REGISTRY_NAME } from "../../src/gateway/registry";

const GH = "http://backstop.test/demo/gh/repos/demo/timeline";
const API = "http://backstop.test/api/repos/demo/demo/timeline";

function setChaos(mode: "off" | "blackout") {
  return env.Registry.getByName(REGISTRY_NAME).setChaos("demo", {
    mode,
    errorRate: 0,
    latencyMs: 0,
  });
}

async function send(path: string, init?: RequestInit): Promise<number> {
  const response = await exports.default.fetch(`${GH}${path}`, init);
  await response.body?.cancel();
  return response.status;
}

afterEach(() => setChaos("off"));

it("lists breaker, chaos and queue events for a repo, newest first", async () => {
  await send("/issues");
  await setChaos("blackout");
  await new Promise((resolve) => setTimeout(resolve, 2100));
  for (let i = 1; i <= 5; i++) await send(`/issues/${i}`);
  expect(
    await send("/issues/1/comments", {
      method: "POST",
      body: JSON.stringify({ body: "hello" }),
    }),
  ).toBe(202);

  const response = await exports.default.fetch(`${API}/timeline`);
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    repoKey: string;
    entries: { at: number; kind: string; text: string }[];
  };
  expect(body.repoKey).toBe("demo/timeline");
  const kinds = body.entries.map((entry) => entry.kind);
  expect(kinds).toEqual(
    expect.arrayContaining(["queue", "breaker", "incident", "chaos"]),
  );
  expect(body.entries[0]?.text).toBe(
    "Queued POST /repos/demo/timeline/issues/1/comments",
  );
  const times = body.entries.map((entry) => entry.at);
  expect(times).toEqual([...times].sort((a, b) => b - a));
});

it("shows health in the overview repo rows", async () => {
  await send("/pulls");
  const response = await exports.default.fetch(
    "http://backstop.test/api/overview?namespace=demo",
  );
  const { repos } = (await response.json()) as {
    repos: { errorHistory: unknown[]; errorRate: number }[];
  };
  expect(repos[0]?.errorHistory).toHaveLength(20);
  expect(repos[0]?.errorRate).toEqual(expect.any(Number));
});
