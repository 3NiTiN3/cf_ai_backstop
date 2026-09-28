import { describe, expect, it } from "vitest";
import { parseGatewayUrl, type GatewayRoute } from "../../src/gateway/routes";
import {
  fetchUpstream,
  toUpstreamRequest,
  type UpstreamDeps,
} from "../../src/gateway/upstream";

function route(path: string): GatewayRoute {
  const parsed = parseGatewayUrl(new URL(`http://backstop.test${path}`));
  if (!parsed) throw new Error(`not a gateway path: ${path}`);
  return parsed;
}

function stubDeps(
  respond: (request: Request) => Promise<Response>,
  timeoutMs = 1000,
): UpstreamDeps & { seen: Request[] } {
  const seen: Request[] = [];
  return {
    seen,
    timeoutMs,
    fetch: (request) => {
      seen.push(request);
      return respond(request);
    },
  };
}

const liveRequest = () =>
  new Request("https://api.github.com/repos/cloudflare/workers-sdk");

describe("toUpstreamRequest", () => {
  it("targets GitHub and forwards only the allowed headers", () => {
    const original = new Request(
      "http://backstop.test/gh/repos/a/b/issues?state=open",
      {
        headers: {
          Authorization: "Bearer secret",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          Cookie: "session=1",
          "If-None-Match": '"client"',
        },
      },
    );
    const upstream = toUpstreamRequest(
      original,
      route("/gh/repos/a/b/issues?state=open"),
    );
    expect(upstream.url).toBe(
      "https://api.github.com/repos/a/b/issues?state=open",
    );
    expect(upstream.headers.get("authorization")).toBe("Bearer secret");
    expect(upstream.headers.get("accept")).toBe("application/vnd.github+json");
    expect(upstream.headers.get("x-github-api-version")).toBe("2022-11-28");
    expect(upstream.headers.get("user-agent")).toBe("cf-ai-backstop");
    expect(upstream.headers.has("cookie")).toBe(false);
    expect(upstream.headers.has("if-none-match")).toBe(false);
  });

  it("adds gateway headers such as conditional validators", () => {
    const upstream = toUpstreamRequest(
      new Request("http://backstop.test/gh/repos/a/b"),
      route("/gh/repos/a/b"),
      { "if-none-match": '"abc"' },
    );
    expect(upstream.headers.get("if-none-match")).toBe('"abc"');
  });
});

describe("fetchUpstream with the mock", () => {
  it("returns ok with body, ETag and safe headers", async () => {
    const result = await fetchUpstream(
      "demo",
      new Request("https://api.github.com/repos/demo/api"),
      {
        ...stubDeps(() => Promise.reject(new Error("unused"))),
        mock: { latencyMs: () => 0 },
      },
    );
    expect(result.outcome).toBe("ok");
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ full_name: "demo/api" });
    expect(result.etag).toMatch(/^"[0-9a-f]{64}"$/);
    expect(result.headers).toMatchObject({
      "content-type": "application/json; charset=utf-8",
      "x-ratelimit-limit": "5000",
    });
  });

  it("classifies a missing repo as a client error", async () => {
    const result = await fetchUpstream(
      "demo",
      new Request("https://api.github.com/repos/demo/missing"),
      {
        ...stubDeps(() => Promise.reject(new Error("unused"))),
        mock: { latencyMs: () => 0 },
      },
    );
    expect(result.outcome).toBe("client_error");
    expect(result.status).toBe(404);
  });
});

describe("fetchUpstream against live GitHub", () => {
  async function outcomeFor(response: Response) {
    return fetchUpstream(
      "live",
      liveRequest(),
      stubDeps(async () => response),
    );
  }

  it("classifies statuses", async () => {
    expect((await outcomeFor(new Response("{}"))).outcome).toBe("ok");
    expect(
      (await outcomeFor(new Response(null, { status: 304 }))).outcome,
    ).toBe("ok");
    expect((await outcomeFor(new Response("", { status: 404 }))).outcome).toBe(
      "client_error",
    );
    expect((await outcomeFor(new Response("", { status: 422 }))).outcome).toBe(
      "client_error",
    );
    expect((await outcomeFor(new Response("", { status: 500 }))).outcome).toBe(
      "server_error",
    );
    expect((await outcomeFor(new Response("", { status: 503 }))).outcome).toBe(
      "server_error",
    );
    expect((await outcomeFor(new Response("", { status: 429 }))).outcome).toBe(
      "rate_limited",
    );
    expect((await outcomeFor(new Response("", { status: 408 }))).outcome).toBe(
      "timeout",
    );
  });

  it("treats a 403 as rate limited only with rate limit signals", async () => {
    const exhausted = new Response("", {
      status: 403,
      headers: { "x-ratelimit-remaining": "0" },
    });
    const secondary = new Response("", {
      status: 403,
      headers: { "retry-after": "60" },
    });
    const forbidden = new Response("", {
      status: 403,
      headers: { "x-ratelimit-remaining": "4000" },
    });
    expect((await outcomeFor(exhausted)).outcome).toBe("rate_limited");
    expect((await outcomeFor(secondary)).outcome).toBe("rate_limited");
    expect((await outcomeFor(forbidden)).outcome).toBe("client_error");
  });

  it("keeps only safe response headers", async () => {
    const result = await outcomeFor(
      new Response("{}", {
        headers: {
          "content-type": "application/json",
          etag: '"x"',
          "last-modified": "Tue, 01 Sep 2026 00:00:00 GMT",
          link: '<https://api.github.com/x?page=2>; rel="next"',
          "x-ratelimit-remaining": "10",
          "set-cookie": "a=b",
          "x-github-request-id": "abc",
        },
      }),
    );
    expect(Object.keys(result.headers).sort()).toEqual([
      "content-type",
      "etag",
      "last-modified",
      "link",
      "x-ratelimit-remaining",
    ]);
    expect(result.etag).toBe('"x"');
    expect(result.lastModified).toBe("Tue, 01 Sep 2026 00:00:00 GMT");
  });

  it("aborts slow requests as timeouts", async () => {
    const deps = stubDeps(
      (request) =>
        new Promise((_, reject) => {
          request.signal.addEventListener("abort", () =>
            reject(request.signal.reason),
          );
        }),
      20,
    );
    const result = await fetchUpstream("live", liveRequest(), deps);
    expect(result.outcome).toBe("timeout");
    expect(result.status).toBe(504);
  });

  it("classifies thrown fetch errors as network errors", async () => {
    const deps = stubDeps(() =>
      Promise.reject(new TypeError("connection reset")),
    );
    const result = await fetchUpstream("live", liveRequest(), deps);
    expect(result.outcome).toBe("network_error");
    expect(result.status).toBe(502);
  });

  it("sends requests to the fetch dependency with a signal", async () => {
    const deps = stubDeps(async () => new Response("{}"));
    await fetchUpstream("live", liveRequest(), deps);
    expect(deps.seen).toHaveLength(1);
    expect(deps.seen[0]?.url).toBe(
      "https://api.github.com/repos/cloudflare/workers-sdk",
    );
    expect(deps.seen[0]?.signal).toBeInstanceOf(AbortSignal);
  });
});
