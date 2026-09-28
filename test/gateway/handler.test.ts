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

it("serves demo reads with MISS then HIT", async () => {
  const url = "http://backstop.test/demo/gh/repos/demo/web";
  const first = await exports.default.fetch(url);
  expect(first.status).toBe(200);
  expect(first.headers.get("x-backstop-cache")).toBe("MISS");
  const body = await first.json();
  expect(body).toMatchObject({ full_name: "demo/web" });

  const second = await exports.default.fetch(url);
  expect(second.headers.get("x-backstop-cache")).toBe("HIT");
  expect(await second.json()).toEqual(body);
});

it("passes writes through without caching", async () => {
  const response = await exports.default.fetch(
    "http://backstop.test/demo/gh/repos/demo/web/issues",
    { method: "POST", body: JSON.stringify({ title: "From a test" }) },
  );
  expect(response.status).toBe(201);
  expect(response.headers.get("x-backstop-cache")).toBe("BYPASS");
});
