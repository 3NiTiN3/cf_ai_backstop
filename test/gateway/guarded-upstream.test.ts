import { env, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import { BASE_OPEN_MS, type Transition } from "../../src/gateway/breaker";
import { BreakerStore } from "../../src/gateway/breaker-store";
import { GuardedUpstream } from "../../src/gateway/guarded-upstream";
import { HealthWindow } from "../../src/gateway/health";
import type { UpstreamResult } from "../../src/gateway/upstream";
import { okResult } from "./helpers";

const failure = okResult("", { status: 502, outcome: "server_error" });

interface Guard {
  clock: { now: number };
  guard: GuardedUpstream;
  health: HealthWindow;
  store: BreakerStore;
  transitions: Transition[];
  calls: () => number;
  setResult: (result: UpstreamResult) => void;
  call: () => Promise<UpstreamResult>;
}

let counter = 0;

function withGuard(run: (guard: Guard) => Promise<void>): Promise<void> {
  const stub = env.RepoGateway.getByName(`test:guard-${++counter}`);
  return runInDurableObject(stub, async (_instance, state) => {
    const clock = { now: 1_000_000 };
    const store = new BreakerStore(state.storage.sql);
    const health = new HealthWindow(() => clock.now);
    const transitions: Transition[] = [];
    let result = okResult("{}");
    let calls = 0;
    const guard = new GuardedUpstream(store, health, {
      now: () => clock.now,
      fetch: async () => {
        calls += 1;
        return result;
      },
      onTransition: (transition) => transitions.push(transition),
    });
    await run({
      clock,
      guard,
      health,
      store,
      transitions,
      calls: () => calls,
      setResult: (next) => {
        result = next;
      },
      call: () => guard.call("demo", new Request("https://api.github.com/")),
    });
  });
}

it("opens after repeated failures and stops calling upstream", () =>
  withGuard(async ({ guard, calls, setResult, call, transitions }) => {
    setResult(failure);
    for (let i = 0; i < 5; i++) await call();
    expect(guard.state().state).toBe("open");
    expect(guard.mode()).toBe("degraded");
    expect(transitions.map((t) => `${t.from}>${t.to}`)).toEqual([
      "closed>open",
    ]);

    const refused = await call();
    expect(calls()).toBe(5);
    expect(refused.status).toBe(503);
    expect(refused.outcome).toBe("circuit_open");
    expect(refused.headers["retry-after"]).toBe("30");
    expect(JSON.parse(refused.body)).toEqual({
      error: "upstream_unavailable",
      retryAfterSeconds: 30,
    });
  }));

it("persists the breaker so a new instance stays open", () =>
  withGuard(async ({ store, setResult, call, health, clock }) => {
    setResult(failure);
    for (let i = 0; i < 5; i++) await call();
    const reloaded = new GuardedUpstream(store, health, {
      now: () => clock.now,
      fetch: () => Promise.reject(new Error("must not be called")),
      onTransition: () => undefined,
    });
    expect(reloaded.state()).toMatchObject({ state: "open" });
    expect(
      (await reloaded.call("demo", new Request("https://x/"))).status,
    ).toBe(503);
  }));

it("half-opens, closes on a good probe and clears old failures", () =>
  withGuard(async ({ guard, clock, setResult, call, transitions, health }) => {
    setResult(failure);
    for (let i = 0; i < 5; i++) await call();

    clock.now += BASE_OPEN_MS;
    setResult(okResult("{}"));
    await call();
    expect(guard.state().state).toBe("closed");
    expect(guard.mode()).toBe("normal");
    expect(transitions.map((t) => t.to)).toEqual([
      "open",
      "half_open",
      "closed",
    ]);
    expect(health.snapshot()).toMatchObject({
      requestCount: 0,
      consecutiveFailures: 0,
    });

    setResult(failure);
    await call();
    expect(guard.state().state).toBe("closed");
  }));

it("does not report a transition when nothing changes", () =>
  withGuard(async ({ call, transitions }) => {
    await call();
    await call();
    expect(transitions).toEqual([]);
  }));

it("marks gateway responses as normal while the breaker is closed", async () => {
  const response = await exports.default.fetch(
    "http://backstop.test/demo/gh/repos/demo/guard/issues",
  );
  await response.body?.cancel();
  expect(response.headers.get("x-backstop-mode")).toBe("normal");
});
