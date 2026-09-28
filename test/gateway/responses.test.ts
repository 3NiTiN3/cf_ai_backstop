import { expect, it } from "vitest";
import { fromUpstream, stale } from "../../src/gateway/responses";
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
