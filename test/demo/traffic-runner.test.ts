import { env, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import type { PlannedRequest } from "../../src/demo/traffic-plan";
import { TICK_MS, TrafficRunner } from "../../src/demo/traffic-runner";

let counter = 0;

function withRunner(
  run: (context: {
    runner: TrafficRunner;
    sent: PlannedRequest[];
    scheduled: number[];
    clock: { now: number };
  }) => Promise<void>,
): Promise<void> {
  const stub = env.Registry.getByName(`test:traffic-${++counter}`);
  return runInDurableObject(stub, async (_instance, state) => {
    const sent: PlannedRequest[] = [];
    const scheduled: number[] = [];
    const clock = { now: 1_000_000 };
    const runner = new TrafficRunner(state.storage.sql, {
      now: () => clock.now,
      random: () => 0.5,
      send: async (request) => {
        sent.push(request);
      },
      schedule: async (at) => {
        scheduled.push(at);
      },
    });
    await run({ runner, sent, scheduled, clock });
  });
}

it("starts one run at a time and schedules the first tick", () =>
  withRunner(async ({ runner, scheduled, clock }) => {
    const first = await runner.start(3, 10);
    expect(first).toMatchObject({
      ok: true,
      status: { running: true, agents: 3, endsAt: clock.now + 10_000 },
    });
    expect(scheduled).toEqual([clock.now + TICK_MS]);

    const second = await runner.start(5, 30);
    expect(second.ok).toBe(false);
    expect(second.status.agents).toBe(3);
  }));

it("sends two requests per agent on each tick and counts them", () =>
  withRunner(async ({ runner, sent, clock }) => {
    await runner.start(4, 10);
    clock.now += TICK_MS;
    expect(await runner.tick()).toBe(true);
    expect(await runner.tick()).toBe(true);
    expect(sent).toHaveLength(16);
    expect(runner.status()).toMatchObject({ ticks: 2, requestsSent: 16 });
  }));

it("stops by itself at the end of the duration", () =>
  withRunner(async ({ runner, sent, clock }) => {
    await runner.start(2, 10);
    clock.now += 9_999;
    expect(await runner.tick()).toBe(true);
    clock.now += 1;
    expect(await runner.tick()).toBe(false);
    expect(runner.status().running).toBe(false);
    expect(sent).toHaveLength(4);
  }));

it("stops on request and ignores ticks afterwards", () =>
  withRunner(async ({ runner, sent }) => {
    await runner.start(2, 60);
    expect(runner.stop().running).toBe(false);
    expect(await runner.tick()).toBe(false);
    expect(sent).toHaveLength(0);
    expect((await runner.start(1, 10)).ok).toBe(true);
  }));
