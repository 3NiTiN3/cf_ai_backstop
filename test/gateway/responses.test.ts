import { expect, it } from "vitest";
import {
  finishGatewayResponse,
  fromUpstream,
  gatewayLinks,
  stale,
} from "../../src/gateway/responses";
import { okResult } from "./helpers";

it("turns unreachable upstreams into JSON errors for passthrough calls", async () => {
  const timeout = fromUpstream(
    okResult("", { status: 504, outcome: "timeout" }),
    "BYPASS",
  );
  expect(timeout.status).toBe(504);
  expect(await timeout.json()).toEqual({
    message: "GitHub did not respond in time",
  });

  const network = fromUpstream(
    okResult("", { status: 502, outcome: "network_error" }),
    "BYPASS",
  );
  expect(network.status).toBe(502);
  expect(network.headers.get("x-backstop-cache")).toBe("BYPASS");
  expect(await network.json()).toEqual({ message: "Could not reach GitHub" });
});

it("never reports a negative age for stale entries", () => {
  const entry = {
    key: "k",
    status: 200,
    headers: {},
    body: "{}",
    etag: null,
    lastModified: null,
    fetchedAt: 5000,
    expiresAt: 6000,
    hits: 0,
  };
  expect(stale(entry, 1000).headers.get("age")).toBe("0");
  expect(stale(entry, 7999).headers.get("age")).toBe("2");
});

it("points GitHub pagination links at the gateway", () => {
  const link =
    '<https://api.github.com/repositories/1/issues?page=2>; rel="next", <https://api.github.com/repositories/1/issues?page=9>; rel="last"';
  expect(gatewayLinks(link, "https://backstop.example/gh")).toBe(
    '<https://backstop.example/gh/repositories/1/issues?page=2>; rel="next", <https://backstop.example/gh/repositories/1/issues?page=9>; rel="last"',
  );
});

it("adds the mode header and rewrites links on the way out", () => {
  const response = finishGatewayResponse(
    new Response("[]", {
      headers: {
        link: '<https://api.github.com/repos/a/b/pulls?page=2>; rel="next"',
      },
    }),
    "http://localhost:5173/demo/gh",
    "degraded",
  );
  expect(response.headers.get("x-backstop-mode")).toBe("degraded");
  expect(response.headers.get("link")).toBe(
    '<http://localhost:5173/demo/gh/repos/a/b/pulls?page=2>; rel="next"',
  );
});
