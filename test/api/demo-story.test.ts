import { exports } from "cloudflare:workers";
import { afterEach, expect, it } from "vitest";

const STORY = "http://backstop.test/api/demo/story";
const JSON_HEADERS = { "content-type": "application/json" };

afterEach(async () => {
  const stop = await exports.default.fetch(
    "http://backstop.test/api/demo/traffic/stop",
    { method: "POST", headers: JSON_HEADERS },
  );
  await stop.body?.cancel();
});

it("starts the story once and reports its step", async () => {
  const idle = await exports.default.fetch(STORY);
  expect(await idle.json()).toMatchObject({ step: "idle", running: false });

  const started = await exports.default.fetch(STORY, {
    method: "POST",
    headers: JSON_HEADERS,
  });
  expect(started.status).toBe(200);
  expect(await started.json()).toMatchObject({ step: "normal", running: true });

  const again = await exports.default.fetch(STORY, {
    method: "POST",
    headers: JSON_HEADERS,
  });
  expect(again.status).toBe(409);
  await again.body?.cancel();

  const traffic = await exports.default.fetch(
    "http://backstop.test/api/demo/traffic",
  );
  expect(await traffic.json()).toMatchObject({ running: true, agents: 10 });

  const stopped = await exports.default.fetch(`${STORY}/stop`, {
    method: "POST",
    headers: JSON_HEADERS,
  });
  expect(await stopped.json()).toMatchObject({ step: "idle", running: false });
  const after = await exports.default.fetch(
    "http://backstop.test/api/demo/traffic",
  );
  expect(await after.json()).toMatchObject({ running: false });
});
