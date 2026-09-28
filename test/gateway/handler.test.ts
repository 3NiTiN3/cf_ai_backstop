import { env, listDurableObjectIds } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

it("routes a demo repo request to its RepoGateway", async () => {
  const response = await exports.default.fetch(
    "http://backstop.test/demo/gh/repos/Demo/API?per_page=1",
  );
  await response.body?.cancel();

  const ids = await listDurableObjectIds(env.RepoGateway);
  const expected = env.RepoGateway.idFromName("demo:demo/api");
  expect(ids.map((id) => id.toString())).toContain(expected.toString());
});

it("returns 404 JSON for unknown paths", async () => {
  const response = await exports.default.fetch("http://backstop.test/nope");
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ message: "Not Found" });
});
