import { env, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { CHAOS_OFF } from "../../src/gateway/chaos";
import type { GatewayMode } from "../../src/gateway/guarded-upstream";
import { REGISTRY_NAME } from "../../src/gateway/registry";
import type { UpstreamResult } from "../../src/gateway/upstream";
import { WritePath } from "../../src/gateway/write-path";
import { WriteQueue } from "../../src/gateway/write-queue";
import { keyFromSecret, seal, unseal } from "../../src/security/crypto";
import { okResult, route } from "./helpers";

const COMMENTS = "/demo/gh/repos/demo/api/issues/1/comments";
const MERGE = "/demo/gh/repos/demo/api/pulls/1/merge";

const created = okResult('{"id":1}', { status: 201 });
const serverError = okResult("oops", { status: 502, outcome: "server_error" });

interface WriteHarness {
  queue: WriteQueue;
  calls: Request[];
  setMode: (mode: GatewayMode) => void;
  setPaused: (paused: boolean) => void;
  queuedEvents: () => number;
  respond: (result: UpstreamResult) => void;
  send: (
    path: string,
    body: unknown,
    headers?: HeadersInit,
    method?: string,
  ) => Promise<Response>;
}

let counter = 0;

function withWrites(run: (harness: WriteHarness) => Promise<void>) {
  const stub = env.RepoGateway.getByName(`test:writes-${++counter}`);
  return runInDurableObject(stub, async (_instance, state) => {
    const key = await keyFromSecret("test-secret");
    const queue = new WriteQueue(state.storage.sql);
    const calls: Request[] = [];
    let mode: GatewayMode = "normal";
    let paused = false;
    let queuedEvents = 0;
    let result = created;
    let ids = 0;
    const writes = new WritePath(queue, {
      now: () => 1_000,
      newId: () => `w${++ids}`,
      mode: () => mode,
      paused: () => paused,
      onQueued: () => queuedEvents++,
      upstream: async (_namespace, request) => {
        calls.push(request);
        return result;
      },
      sealToken: (authorization) => seal(key, authorization),
    });
    await run({
      queue,
      calls,
      setMode: (next) => (mode = next),
      setPaused: (next) => (paused = next),
      queuedEvents: () => queuedEvents,
      respond: (next) => (result = next),
      send: (path, body, headers = {}, method = "POST") =>
        writes.handle(
          new Request(`http://backstop.test${path}`, {
            method,
            headers,
            body: JSON.stringify(body),
          }),
          route(path),
        ),
    });
  });
}

async function queuedBody(response: Response) {
  expect(response.status).toBe(202);
  expect(response.headers.get("x-backstop-cache")).toBe("QUEUED");
  const body: { id: string; position: number } = await response.json();
  expect(response.headers.get("x-backstop-queued")).toBe(body.id);
  return body;
}

describe("WritePath", () => {
  it("sends allowed writes straight through while healthy", () =>
    withWrites(async ({ send, calls, queue }) => {
      const response = await send(COMMENTS, { body: "hi" });
      expect(response.status).toBe(201);
      expect(response.headers.get("x-backstop-cache")).toBe("BYPASS");
      expect(await calls[0]?.text()).toBe('{"body":"hi"}');
      expect(queue.hasWaiting()).toBe(false);
    }));

  it("queues an allowed write that fails with a retryable outcome", () =>
    withWrites(async ({ send, respond, queue }) => {
      respond(serverError);
      const body = await queuedBody(await send(COMMENTS, { body: "hi" }));
      expect(body).toEqual({
        queued: true,
        id: "w1",
        position: 1,
        status: "pending",
      });
      expect(queue.hasWaiting()).toBe(true);
    }));

  it("queues allowed writes while paused even when healthy", () =>
    withWrites(async ({ send, setPaused, calls, queuedEvents }) => {
      setPaused(true);
      const body = await queuedBody(await send(COMMENTS, { body: "hold" }));
      expect(body.position).toBe(1);
      expect(calls).toHaveLength(0);
      expect(queuedEvents()).toBe(1);
      expect((await send(MERGE, {}, {}, "PUT")).status).toBe(201);
    }));

  it("passes client errors through without queueing", () =>
    withWrites(async ({ send, respond, queue }) => {
      respond(okResult("{}", { status: 422, outcome: "client_error" }));
      expect((await send(COMMENTS, { body: "" })).status).toBe(422);
      expect(queue.hasWaiting()).toBe(false);
    }));

  it("queues later writes behind waiting ones without calling upstream", () =>
    withWrites(async ({ send, respond, calls }) => {
      respond(serverError);
      await send(COMMENTS, { body: "first" });
      respond(created);
      const second = await queuedBody(await send(COMMENTS, { body: "second" }));
      expect(second.position).toBe(2);
      expect(calls).toHaveLength(1);
    }));

  it("returns the existing record for a duplicate idempotency key", () =>
    withWrites(async ({ send, respond, calls }) => {
      respond(serverError);
      const headers = { "idempotency-key": "abc" };
      const first = await queuedBody(
        await send(COMMENTS, { body: "a" }, headers),
      );
      const again = await queuedBody(
        await send(COMMENTS, { body: "b" }, headers),
      );
      expect(again.id).toBe(first.id);
      expect(calls).toHaveLength(1);
    }));

  it("derives the key from the content when no header is sent", () =>
    withWrites(async ({ send, respond }) => {
      respond(serverError);
      const first = await queuedBody(await send(COMMENTS, { body: "same" }));
      const same = await queuedBody(await send(COMMENTS, { body: "same" }));
      const other = await queuedBody(await send(COMMENTS, { body: "other" }));
      expect(same.id).toBe(first.id);
      expect(other.id).not.toBe(first.id);
    }));

  it("scopes idempotency keys by token", () =>
    withWrites(async ({ send, respond }) => {
      respond(serverError);
      const key = { "idempotency-key": "shared" };
      const a = await queuedBody(
        await send(
          COMMENTS,
          { body: "x" },
          { ...key, authorization: "token a" },
        ),
      );
      const b = await queuedBody(
        await send(
          COMMENTS,
          { body: "x" },
          { ...key, authorization: "token b" },
        ),
      );
      expect(a.id).not.toBe(b.id);
    }));

  it("rejects an oversized idempotency key", () =>
    withWrites(async ({ send }) => {
      const response = await send(
        COMMENTS,
        { body: "x" },
        { "idempotency-key": "k".repeat(256) },
      );
      expect(response.status).toBe(400);
    }));

  it("stores the token encrypted and deletes it once the write is done", () =>
    withWrites(async ({ send, respond, queue }) => {
      respond(serverError);
      const { id } = await queuedBody(
        await send(COMMENTS, { body: "x" }, { authorization: "token secret" }),
      );
      const sealed = queue.sealedToken(id);
      expect(sealed?.ciphertext).not.toContain("secret");
      if (!sealed) throw new Error("token was not stored");
      expect(await unseal(await keyFromSecret("test-secret"), sealed)).toBe(
        "token secret",
      );

      queue.markDone(id, 201, 2_000);
      expect(queue.sealedToken(id)).toBeNull();
      expect(queue.hasWaiting()).toBe(false);
    }));

  it("stores no token for anonymous demo writes", () =>
    withWrites(async ({ send, respond, queue }) => {
      respond(serverError);
      const { id } = await queuedBody(await send(COMMENTS, { body: "x" }));
      expect(queue.sealedToken(id)).toBeNull();
    }));

  it("refuses non-queueable writes while degraded and passes them while normal", () =>
    withWrites(async ({ send, setMode, calls }) => {
      setMode("degraded");
      expect((await send(MERGE, {}, {}, "PUT")).status).toBe(503);
      expect(calls).toHaveLength(0);
      setMode("normal");
      expect((await send(MERGE, {}, {}, "PUT")).status).toBe(201);
    }));
});

describe("crypto", () => {
  it("round trips with a fresh IV each time", async () => {
    const key = await keyFromSecret("k");
    const a = await seal(key, "ghp_example");
    const b = await seal(key, "ghp_example");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(await unseal(key, a)).toBe("ghp_example");
  });

  it("fails to open with the wrong key", async () => {
    const sealed = await seal(await keyFromSecret("k"), "value");
    await expect(
      unseal(await keyFromSecret("other"), sealed),
    ).rejects.toThrow();
  });
});

it("queues allowed writes with 202 while the breaker is open", async () => {
  const registry = env.Registry.getByName(REGISTRY_NAME);
  await registry.setChaos("demo", { ...CHAOS_OFF, mode: "blackout" });
  const base = "http://backstop.test/demo/gh/repos/demo/write-queue";
  for (let i = 0; i < 5; i++) {
    const read = await exports.default.fetch(`${base}/issues?page=${i}`);
    await read.body?.cancel();
  }

  const response = await exports.default.fetch(`${base}/issues/1/comments`, {
    method: "POST",
    body: JSON.stringify({ body: "during the outage" }),
  });
  const body = await queuedBody(response);
  expect(body.position).toBe(1);
  await registry.setChaos("demo", CHAOS_OFF);
});
