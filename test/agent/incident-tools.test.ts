import { env, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createIncidentTools } from "../../src/agent/incident-tools";
import { INITIAL_OPS_STATE, type OpsState } from "../../src/agent/state";
import { IncidentLog } from "../../src/gateway/incidents";
import { REGISTRY_NAME } from "../../src/gateway/registry";

const OPTIONS = { toolCallId: "call-1", messages: [] };
const STARTED = Date.UTC(2026, 8, 29, 10, 0, 0);
const ENDED = Date.UTC(2026, 8, 29, 10, 1, 0);

async function seedIncident(repo: string): Promise<void> {
  const registry = env.Registry.getByName(REGISTRY_NAME);
  for (let i = 0; i < 30 && !(await registry.hasRepo("demo", repo)); i++) {
    const read = await exports.default.fetch(
      `http://backstop.test/demo/gh/repos/${repo}`,
    );
    await read.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const gateway = env.RepoGateway.getByName(`demo:${repo}`);
  await runInDurableObject(gateway, async (_instance, storage) => {
    const log = new IncidentLog(storage.storage.sql);
    log.open(STARTED, 1);
    log.close(ENDED);
  });
}

function harness() {
  let state: OpsState = { ...INITIAL_OPS_STATE, watchedRepos: ["demo/web"] };
  const { listIncidents } = createIncidentTools({
    env,
    state: () => state,
    save: (next) => (state = next),
  });
  return {
    state: () => state,
    run: (input: { repo?: string }) =>
      listIncidents.execute?.(input, OPTIONS) as Promise<{
        count?: number;
        incidents?: Record<string, unknown>[];
        error?: string;
      }>,
  };
}

describe("listIncidents tool", () => {
  it("marks new incidents and remembers them after a full listing", async () => {
    await seedIncident("demo/web");
    const { run, state } = harness();

    const repoOnly = await run({ repo: "demo/web" });
    expect(repoOnly.count).toBe(1);
    expect(repoOnly.incidents?.[0]).toMatchObject({
      repo: "demo/web",
      startedAt: "2026-09-29T10:00:00.000Z",
      endedAt: "2026-09-29T10:01:00.000Z",
      ongoing: false,
      peakErrorRatePercent: 100,
      replay: "nothing queued",
      newSinceLastSeen: true,
    });
    expect(state().lastSeenIncidentAt).toBeNull();

    const first = await run({});
    expect(first.incidents?.[0]).toMatchObject({ newSinceLastSeen: true });
    expect(state().lastSeenIncidentAt).toBe(ENDED);

    const second = await run({});
    expect(second.incidents?.[0]).toMatchObject({ newSinceLastSeen: false });
  });

  it("reports bad and unknown repos", async () => {
    const { run } = harness();
    expect(await run({ repo: "nope" })).toEqual({
      error: "nope is not an owner/name repo",
    });
    expect(await run({ repo: "nobody/nothing" })).toEqual({
      error: "No traffic seen for demo/nobody/nothing yet",
    });
  });
});
