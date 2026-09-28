import { env, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { BASE_OPEN_MS } from "../../src/gateway/breaker";
import { BreakerStore } from "../../src/gateway/breaker-store";
import {
  CHAOS_OFF,
  CachedChaos,
  applyChaos,
  type ChaosConfig,
  type ChaosDeps,
} from "../../src/gateway/chaos";
import { GuardedUpstream } from "../../src/gateway/guarded-upstream";
import { HealthWindow } from "../../src/gateway/health";
import { REGISTRY_NAME } from "../../src/gateway/registry";
import { okResult } from "./helpers";

function deps(random = 0.5): ChaosDeps & { slept: number[] } {
  const slept: number[] = [];
  return {
    slept,
    random: () => random,
    sleep: async (ms) => {
      slept.push(ms);
    },
  };
}

function chaos(overrides: Partial<ChaosConfig>): ChaosConfig {
  return { ...CHAOS_OFF, ...overrides };
}

describe("applyChaos", () => {
  it("calls upstream untouched when off", async () => {
    const call = vi.fn(async () => okResult("{}"));
    expect(await applyChaos(CHAOS_OFF, call, deps())).toEqual(okResult("{}"));
    expect(call).toHaveBeenCalledOnce();
  });

  it("fails every call as a network error during a blackout", async () => {
    const call = vi.fn(async () => okResult("{}"));
    const result = await applyChaos(chaos({ mode: "blackout" }), call, deps());
    expect(result).toMatchObject({ status: 502, outcome: "network_error" });
    expect(call).not.toHaveBeenCalled();
  });

  it("returns synthetic 502s at the configured rate", async () => {
    const config = chaos({ mode: "errors", errorRate: 0.3 });
    const call = vi.fn(async () => okResult("{}"));

    const failed = await applyChaos(config, call, deps(0.29));
    expect(failed).toMatchObject({ status: 502, outcome: "server_error" });
    expect(call).not.toHaveBeenCalled();

    const passed = await applyChaos(config, call, deps(0.3));
    expect(passed.outcome).toBe("ok");
    expect(call).toHaveBeenCalledOnce();
  });

  it("delays the call and reports the added latency", async () => {
    const d = deps();
    const result = await applyChaos(
      chaos({ mode: "latency", latencyMs: 800 }),
      async () => okResult("{}", { latencyMs: 20 }),
      d,
    );
    expect(d.slept).toEqual([800]);
    expect(result.latencyMs).toBe(820);
  });
});

describe("CachedChaos", () => {
  it("reuses the config for 2 seconds per namespace", async () => {
    const clock = { now: 0 };
    const load = vi.fn(async () => chaos({ mode: "blackout" }));
    const cached = new CachedChaos(load, () => clock.now);

    await cached.get("demo");
    clock.now = 1999;
    await cached.get("demo");
    expect(load).toHaveBeenCalledTimes(1);

    await cached.get("live");
    clock.now = 2000;
    await cached.get("demo");
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("treats an unreachable registry as chaos off", async () => {
    const cached = new CachedChaos(
      () => Promise.reject(new Error("down")),
      () => 0,
    );
    expect(await cached.get("demo")).toEqual(CHAOS_OFF);
  });
});

describe("Registry chaos", () => {
  it("stores config per namespace and records start and end events", async () => {
    const registry = env.Registry.getByName("test:chaos-store");
    expect(await registry.getChaos("demo")).toEqual(CHAOS_OFF);

    const blackout = chaos({ mode: "blackout" });
    expect(await registry.setChaos("demo", blackout)).toEqual(blackout);
    await registry.setChaos("demo", blackout);
    await registry.setChaos("demo", CHAOS_OFF);

    expect(await registry.getChaos("live")).toEqual(CHAOS_OFF);
    const events = await registry.chaosEvents("demo", 10);
    expect(events.map((event) => event.mode)).toEqual(["off", "blackout"]);
    expect(events[0]?.ts).toEqual(expect.any(Number));
  });
});

it("opens the breaker under blackout and closes it once chaos is off", async () => {
  const stub = env.RepoGateway.getByName("test:chaos-breaker");
  await runInDurableObject(stub, async (_instance, state) => {
    const clock = { now: 1_000_000 };
    let config = chaos({ mode: "blackout" });
    const guard = new GuardedUpstream(
      new BreakerStore(state.storage.sql),
      new HealthWindow(() => clock.now),
      {
        now: () => clock.now,
        fetch: () => applyChaos(config, async () => okResult("{}"), deps()),
        onTransition: () => undefined,
      },
    );
    const call = () => guard.call("demo", new Request("https://x/"));

    for (let i = 0; i < 5; i++) await call();
    expect(guard.state().state).toBe("open");

    config = CHAOS_OFF;
    expect((await call()).outcome).toBe("circuit_open");
    clock.now += BASE_OPEN_MS;
    expect((await call()).outcome).toBe("ok");
    expect(guard.state().state).toBe("closed");
  });
});

it("applies namespace chaos to real gateway requests", async () => {
  const registry = env.Registry.getByName(REGISTRY_NAME);
  await registry.setChaos("demo", chaos({ mode: "blackout" }));
  const base = "http://backstop.test/demo/gh/repos/demo/chaos-e2e";

  for (let i = 0; i < 5; i++) {
    const response = await exports.default.fetch(`${base}/issues?page=${i}`);
    expect(response.status).toBe(503);
    await response.body?.cancel();
  }
  const refused = await exports.default.fetch(`${base}/pulls`);
  expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(25);
  expect(refused.headers.get("x-backstop-mode")).toBe("degraded");
  await refused.body?.cancel();

  const gateway = env.RepoGateway.getByName("demo:demo/chaos-e2e");
  const events = await gateway.getRecentEvents(10);
  expect(events).toContainEqual(
    expect.objectContaining({
      kind: "breaker",
      detail: "closed -> open (consecutive_failures)",
    }),
  );
});
