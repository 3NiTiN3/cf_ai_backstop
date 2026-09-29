import {
  env,
  introspectWorkflowInstance,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CHAOS_OFF } from "../../src/gateway/chaos";
import { REGISTRY_NAME } from "../../src/gateway/registry";
import { QueueReplayer } from "../../src/gateway/replay-sender";
import type { UpstreamResult } from "../../src/gateway/upstream";
import { WriteQueue } from "../../src/gateway/write-queue";
import { keyFromSecret, seal, unseal } from "../../src/security/crypto";
import { okResult } from "./helpers";

const PATH = "/repos/demo/infra/issues/1/comments";

interface ReplayHarness {
  queue: WriteQueue;
  replayer: QueueReplayer;
  calls: Request[];
  respond: (result: UpstreamResult) => void;
  openBreaker: () => void;
  add: (body: string, token?: string) => Promise<string>;
}

let counter = 0;

function withReplayer(run: (harness: ReplayHarness) => Promise<void>) {
  const stub = env.RepoGateway.getByName(`test:replay-${++counter}`);
  return runInDurableObject(stub, async (_instance, state) => {
    const key = await keyFromSecret("test-secret");
    const queue = new WriteQueue(state.storage.sql);
    const calls: Request[] = [];
    let result = okResult("{}", { status: 201 });
    let closed = true;
    const replayer = new QueueReplayer(queue, {
      now: () => 5_000,
      upstream: async (_namespace, request) => {
        calls.push(request);
        return result;
      },
      unsealToken: (sealed) => unseal(key, sealed),
      onSent: () => undefined,
      breakerClosed: () => closed,
    });
    let ids = 0;
    const add = async (body: string, token?: string) =>
      queue.enqueue({
        id: `w${++ids}`,
        idempotencyKey: `k${ids}`,
        method: "POST",
        path: PATH,
        body,
        token: token ? await seal(key, token) : null,
        now: 1_000,
      }).id;
    await run({
      queue,
      replayer,
      calls,
      add,
      respond: (next) => (result = next),
      openBreaker: () => (closed = false),
    });
  });
}

describe("QueueReplayer", () => {
  it("claims up to ten pending writes in enqueue order", () =>
    withReplayer(async ({ add, replayer, queue }) => {
      for (let i = 0; i < 12; i++) await add(`{"body":"${i}"}`);
      const batch = replayer.claimBatch();
      expect(batch).toEqual(Array.from({ length: 10 }, (_, i) => `w${i + 1}`));
      expect(queue.get("w1")?.status).toBe("in_flight");
      expect(queue.get("w11")?.status).toBe("pending");
    }));

  it("sends a claimed write with its token and marks it done", () =>
    withReplayer(async ({ add, replayer, queue, calls }) => {
      const id = await add('{"body":"hi"}', "token secret");
      replayer.claimBatch();
      expect(await replayer.send("demo", id)).toEqual({
        kind: "done",
        status: 201,
      });
      const request = calls[0];
      expect(request?.url).toBe(`https://api.github.com${PATH}`);
      expect(request?.headers.get("authorization")).toBe("token secret");
      expect(await request?.text()).toBe('{"body":"hi"}');
      expect(queue.get(id)).toMatchObject({
        status: "done",
        attempts: 1,
        resultStatus: 201,
      });
      expect(queue.sealedToken(id)).toBeNull();
    }));

  it("marks client errors failed with GitHub's message", () =>
    withReplayer(async ({ add, replayer, queue, respond }) => {
      const id = await add('{"body":""}');
      replayer.claimBatch();
      respond(
        okResult('{"message":"Validation Failed"}', {
          status: 422,
          outcome: "client_error",
        }),
      );
      expect(await replayer.send("demo", id)).toEqual({
        kind: "failed",
        error: "GitHub answered 422: Validation Failed",
      });
      expect(queue.get(id)).toMatchObject({
        status: "failed",
        resultStatus: 422,
      });
      expect(replayer.settle(id)).toBe("continue");
    }));

  it("keeps retryable failures in flight and releases them on settle", () =>
    withReplayer(async ({ add, replayer, queue, respond }) => {
      const first = await add("{}");
      const second = await add("{}");
      replayer.claimBatch();
      respond(okResult("", { status: 503, outcome: "circuit_open" }));
      expect(await replayer.send("demo", first)).toEqual({
        kind: "retry",
        error: "circuit_open (503)",
      });
      expect(queue.get(first)).toMatchObject({
        status: "in_flight",
        attempts: 1,
      });

      expect(replayer.settle(first)).toBe("stop");
      expect(queue.get(first)?.status).toBe("pending");
      expect(queue.get(second)?.status).toBe("pending");
    }));

  it("pauses instead of retrying once the breaker is no longer closed", () =>
    withReplayer(async ({ add, replayer, queue, respond, openBreaker }) => {
      const id = await add("{}");
      replayer.claimBatch();
      respond(okResult("", { status: 502, outcome: "network_error" }));
      openBreaker();
      expect(await replayer.send("demo", id)).toEqual({
        kind: "paused",
        error: "network_error (502)",
      });
      expect(replayer.settle(id)).toBe("stop");
      expect(queue.get(id)).toMatchObject({ status: "pending", attempts: 1 });
    }));

  it("skips writes that are not in flight", () =>
    withReplayer(async ({ add, replayer, calls }) => {
      const id = await add("{}");
      expect(await replayer.send("demo", id)).toEqual({ kind: "skipped" });
      expect(await replayer.send("demo", "missing")).toEqual({
        kind: "skipped",
      });
      expect(calls).toHaveLength(0);
    }));

  it("fails a write whose token cannot be decrypted", () =>
    withReplayer(async ({ queue, replayer, calls }) => {
      queue.enqueue({
        id: "bad",
        idempotencyKey: "bad",
        method: "POST",
        path: PATH,
        body: "{}",
        token: await seal(await keyFromSecret("rotated"), "token x"),
        now: 1_000,
      });
      replayer.claimBatch();
      expect(await replayer.send("demo", "bad")).toMatchObject({
        kind: "failed",
      });
      expect(calls).toHaveLength(0);
    }));
});

it("ReplayWorkflow replays a demo queue in order and skips rejected writes", async () => {
  const gateway = env.RepoGateway.getByName("demo:demo/infra");
  const bodies = ["one", "two", "", "three", "four", "five"];
  await runInDurableObject(gateway, async (_instance, state) => {
    const queue = new WriteQueue(state.storage.sql);
    bodies.forEach((body, i) =>
      queue.enqueue({
        id: `r${i}`,
        idempotencyKey: `r${i}`,
        method: "POST",
        path: PATH,
        body: JSON.stringify({ body }),
        token: null,
        now: 1_000 + i,
      }),
    );
  });

  const instance = await introspectWorkflowInstance(
    env.ReplayWorkflow,
    "replay-test",
  );
  try {
    await env.ReplayWorkflow.create({
      id: "replay-test",
      params: { namespace: "demo", repoKey: "demo/infra" },
    });
    await instance.waitForStatus("complete");
    expect(await instance.getOutput()).toEqual({
      sent: 5,
      failed: 1,
      stopped: false,
    });
  } finally {
    await instance.dispose();
  }

  const replays = (await gateway.getRecentEvents(20))
    .filter((event) => event.kind === "replay")
    .reverse();
  expect(replays.map((event) => event.detail)).toEqual(
    bodies.map((_, i) => `r${i}`),
  );
  expect(replays.map((event) => event.status)).toEqual([
    201, 201, 422, 201, 201, 201,
  ]);
});

it("ReplayWorkflow stops and returns writes to pending once the breaker opens", async () => {
  const registry = env.Registry.getByName(REGISTRY_NAME);
  await registry.setChaos("demo", { ...CHAOS_OFF, mode: "blackout" });
  const gateway = env.RepoGateway.getByName("demo:demo/web");
  await runInDurableObject(gateway, async (_instance, state) => {
    const queue = new WriteQueue(state.storage.sql);
    for (const id of ["s1", "s2"]) {
      queue.enqueue({
        id,
        idempotencyKey: id,
        method: "POST",
        path: "/repos/demo/web/issues/1/comments",
        body: '{"body":"x"}',
        token: null,
        now: 1_000,
      });
    }
  });

  const instance = await introspectWorkflowInstance(
    env.ReplayWorkflow,
    "replay-stop",
  );
  try {
    await instance.modify(async (m) => m.disableRetryDelays());
    await env.ReplayWorkflow.create({
      id: "replay-stop",
      params: { namespace: "demo", repoKey: "demo/web" },
    });
    await instance.waitForStatus("complete");
    expect(await instance.getOutput()).toEqual({
      sent: 0,
      failed: 0,
      stopped: true,
    });
  } finally {
    await instance.dispose();
    await registry.setChaos("demo", CHAOS_OFF);
  }

  await runInDurableObject(gateway, async (_instance, state) => {
    const queue = new WriteQueue(state.storage.sql);
    expect(queue.get("s1")).toMatchObject({ status: "pending", attempts: 5 });
    expect(queue.get("s2")).toMatchObject({ status: "pending", attempts: 0 });
  });
});
