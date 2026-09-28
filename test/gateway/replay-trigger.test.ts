import { env, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import {
  ReplayTrigger,
  type ReplayTarget,
} from "../../src/gateway/replay-trigger";

const TARGET: ReplayTarget = { namespace: "demo", repoKey: "demo/api" };

interface TriggerHarness {
  trigger: ReplayTrigger;
  created: ReplayTarget[];
  statuses: Map<string, string | null>;
  started: string[];
  setWaiting: (waiting: boolean) => void;
}

let counter = 0;

function withTrigger(run: (harness: TriggerHarness) => Promise<void>) {
  const stub = env.RepoGateway.getByName(`test:trigger-${++counter}`);
  return runInDurableObject(stub, async (_instance, state) => {
    const created: ReplayTarget[] = [];
    const statuses = new Map<string, string | null>();
    const started: string[] = [];
    let waiting = true;
    const trigger = new ReplayTrigger(state.storage.sql, {
      hasWaiting: () => waiting,
      runner: {
        create: async (target) => {
          created.push(target);
          const id = `run-${created.length}`;
          statuses.set(id, "queued");
          return id;
        },
        status: async (id) => statuses.get(id) ?? null,
      },
      onStart: (id, reason) => started.push(`${reason}:${id}`),
    });
    await run({
      trigger,
      created,
      statuses,
      started,
      setWaiting: (next) => (waiting = next),
    });
  });
}

it("starts one run and refuses a second while it is active", () =>
  withTrigger(async ({ trigger, created, statuses, started }) => {
    expect(await trigger.start(TARGET, "recovered")).toEqual({
      started: true,
      instanceId: "run-1",
    });
    statuses.set("run-1", "running");
    expect(await trigger.start(TARGET, "manual")).toEqual({
      started: false,
      reason: "running",
      instanceId: "run-1",
    });
    expect(created).toEqual([TARGET]);
    expect(started).toEqual(["recovered:run-1"]);
  }));

it("starts a new run once the previous one has finished or vanished", () =>
  withTrigger(async ({ trigger, statuses }) => {
    await trigger.start(TARGET, "manual");
    statuses.set("run-1", "complete");
    expect(await trigger.start(TARGET, "manual")).toMatchObject({
      instanceId: "run-2",
    });
    statuses.set("run-2", "errored");
    expect(await trigger.start(TARGET, "manual")).toMatchObject({
      instanceId: "run-3",
    });
    statuses.delete("run-3");
    expect(await trigger.start(TARGET, "manual")).toMatchObject({
      instanceId: "run-4",
    });
  }));

it("shares one attempt between concurrent callers", () =>
  withTrigger(async ({ trigger, created }) => {
    const results = await Promise.all([
      trigger.start(TARGET, "recovered"),
      trigger.start(TARGET, "queued"),
      trigger.start(TARGET, "manual"),
    ]);
    expect(created).toHaveLength(1);
    expect(new Set(results.map((result) => JSON.stringify(result))).size).toBe(
      1,
    );
  }));

it("does not start while paused or when nothing is waiting", () =>
  withTrigger(async ({ trigger, created, setWaiting }) => {
    trigger.setPaused(true);
    expect(trigger.paused()).toBe(true);
    expect(await trigger.start(TARGET, "recovered")).toEqual({
      started: false,
      reason: "paused",
    });
    trigger.setPaused(false);
    setWaiting(false);
    expect(await trigger.start(TARGET, "recovered")).toEqual({
      started: false,
      reason: "empty",
    });
    expect(created).toHaveLength(0);
  }));

it("passes only the namespace and repo key to the workflow", () =>
  withTrigger(async ({ trigger, created }) => {
    const route = { ...TARGET, upstreamPath: "/repos/demo/api", search: "" };
    await trigger.start(route, "queued");
    expect(created).toEqual([TARGET]);
  }));
