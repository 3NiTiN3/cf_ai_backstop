import { env, runInDurableObject } from "cloudflare:test";
import { CacheStore } from "../../src/gateway/cache";
import { Counters, type CounterName } from "../../src/gateway/counters";
import { ReadThroughCache } from "../../src/gateway/read-through";
import { parseGatewayUrl, type GatewayRoute } from "../../src/gateway/routes";
import type { UpstreamResult } from "../../src/gateway/upstream";

export function route(path: string): GatewayRoute {
  const parsed = parseGatewayUrl(new URL(`http://backstop.test${path}`));
  if (!parsed) throw new Error(`not a gateway path: ${path}`);
  return parsed;
}

export function okResult(
  body: string,
  overrides: Partial<UpstreamResult> = {},
): UpstreamResult {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body,
    etag: null,
    lastModified: null,
    latencyMs: 5,
    outcome: "ok",
    ...overrides,
  };
}

export interface FakeUpstream {
  calls: Request[];
  respond: (request: Request) => UpstreamResult | Promise<UpstreamResult>;
}

export interface Harness {
  clock: { now: number };
  upstream: FakeUpstream;
  cache: ReadThroughCache;
  counters: () => Record<CounterName, number>;
  rows: () => Record<string, SqlStorageValue>[];
  get: (path: string, headers?: HeadersInit) => Promise<Response>;
}

let counter = 0;

export function withHarness(
  run: (harness: Harness) => Promise<void>,
): Promise<void> {
  const stub = env.RepoGateway.getByName(`test:harness-${++counter}`);
  return runInDurableObject(stub, async (_instance, state) => {
    const clock = { now: 1_000_000 };
    const upstream: FakeUpstream = {
      calls: [],
      respond: () => okResult('{"n":1}'),
    };
    const counters = new Counters(state.storage.sql);
    const cache = new ReadThroughCache(
      new CacheStore(state.storage.sql),
      counters,
      {
        now: () => clock.now,
        upstream: async (_namespace, request) => {
          upstream.calls.push(request);
          return upstream.respond(request);
        },
      },
    );
    const get = (path: string, headers: HeadersInit = {}) =>
      cache.read(
        new Request(`http://backstop.test${path}`, { headers }),
        route(path),
      );
    const rows = () =>
      state.storage.sql.exec("SELECT key, hits FROM cache_entries").toArray();
    await run({
      clock,
      upstream,
      cache,
      rows,
      get,
      counters: () => counters.snapshot(),
    });
  });
}
