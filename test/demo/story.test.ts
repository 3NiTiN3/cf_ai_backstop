import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  NORMAL_MS,
  OUTAGE_MS,
  RECOVERY_MAX_MS,
  StoryRunner,
  storyHealth,
  type StoryHealth,
} from "../../src/demo/story";

let counter = 0;

interface Harness {
  runner: StoryRunner;
  calls: string[];
  clock: { now: number };
  health: StoryHealth;
}

function withStory(run: (harness: Harness) => Promise<void>): Promise<void> {
  const stub = env.Registry.getByName(`test:story-${++counter}`);
  return runInDurableObject(stub, async (_instance, state) => {
    const calls: string[] = [];
    const clock = { now: 5_000_000 };
    const health: StoryHealth = { queueDepth: 0, reposDegraded: 0 };
    const runner = new StoryRunner(state.storage.sql, {
      now: () => clock.now,
      setChaos: (mode) => calls.push(`chaos ${mode}`),
      startTraffic: async (agents) => {
        calls.push(`traffic ${agents}`);
      },
      stopTraffic: () => calls.push("stop"),
      health: () => health,
      schedule: async () => undefined,
    });
    await run({ runner, calls, clock, health });
  });
}

describe("StoryRunner", () => {
  it("plays normal, outage, recovery and replayed in order", () =>
    withStory(async ({ runner, calls, clock, health }) => {
      expect((await runner.start()).ok).toBe(true);
      expect(calls).toEqual(["chaos off", "stop", "traffic 10"]);
      expect((await runner.start()).ok).toBe(false);

      clock.now += NORMAL_MS - 1;
      expect(runner.tick()).toBe(true);
      expect(runner.status().step).toBe("normal");
      clock.now += 1;
      runner.tick();
      expect(runner.status().step).toBe("outage");
      expect(calls.at(-1)).toBe("chaos blackout");

      clock.now += OUTAGE_MS;
      runner.tick();
      expect(runner.status().step).toBe("recovery");
      expect(calls.at(-1)).toBe("chaos off");

      health.queueDepth = 4;
      health.reposDegraded = 1;
      clock.now += 5_000;
      expect(runner.tick()).toBe(true);
      health.reposDegraded = 0;
      expect(runner.tick()).toBe(true);
      health.queueDepth = 0;
      expect(runner.tick()).toBe(false);
      expect(runner.status()).toMatchObject({
        step: "replayed",
        running: false,
        finishedAt: clock.now,
      });
      expect(calls.at(-1)).toBe("stop");
    }));

  it("ends recovery after the time limit even if the queue has not drained", () =>
    withStory(async ({ runner, clock, health }) => {
      await runner.start();
      clock.now += NORMAL_MS;
      runner.tick();
      clock.now += OUTAGE_MS;
      runner.tick();
      health.queueDepth = 3;
      clock.now += RECOVERY_MAX_MS;
      expect(runner.tick()).toBe(false);
      expect(runner.status().step).toBe("replayed");
      expect((await runner.start()).ok).toBe(true);
    }));
});

describe("StoryRunner stop", () => {
  it("ends a playing story, clears chaos and stops traffic", () =>
    withStory(async ({ runner, calls, clock }) => {
      await runner.start();
      clock.now += NORMAL_MS;
      runner.tick();
      calls.length = 0;
      expect(runner.stop()).toMatchObject({ step: "idle", running: false });
      expect(calls).toEqual(["chaos off", "stop"]);
      expect(runner.tick()).toBe(false);
      expect((await runner.start()).ok).toBe(true);
    }));
});

describe("storyHealth", () => {
  it("only counts the repos the story sends traffic to", () => {
    const repo = (
      repoKey: string,
      breaker: "open" | "closed",
      queueDepth: number,
    ) => ({ repoKey, breaker, queueDepth }) as never;
    expect(
      storyHealth({
        repos: [
          repo("demo/api", "open", 2),
          repo("demo/web", "closed", 1),
          repo("demo/old", "open", 9),
        ],
      }),
    ).toEqual({ queueDepth: 3, reposDegraded: 1 });
  });
});
