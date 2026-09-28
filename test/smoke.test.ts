import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("returns 404 for unknown paths", async () => {
  const response = await exports.default.fetch("http://example.com/nope");
  expect(response.status).toBe(404);
});

it("routes websocket upgrades to OpsAgent", async () => {
  const response = await exports.default.fetch(
    "http://example.com/agents/ops-agent/smoke",
    { headers: { Upgrade: "websocket" } },
  );
  expect(response.status).toBe(101);
  response.webSocket?.accept();
  response.webSocket?.close();
});
