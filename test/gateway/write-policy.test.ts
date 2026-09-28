import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { CHAOS_OFF } from "../../src/gateway/chaos";
import { REGISTRY_NAME } from "../../src/gateway/registry";
import { classifyWrite } from "../../src/gateway/write-policy";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const REPO = "/repos/octo/app";

const queueable: [method: string, path: string, body?: string][] = [
  ["POST", `${REPO}/issues`],
  ["POST", `${REPO}/issues/7/comments`],
  ["POST", `${REPO}/issues/7/labels`],
  ["POST", `${REPO}/statuses/${SHA}`],
  ["POST", `${REPO}/statuses/${SHA.toUpperCase()}`],
  ["POST", `${REPO}/pulls/3/reviews`, '{"event":"COMMENT","body":"ok"}'],
];

const rejected: [method: string, path: string, body: string, reason: RegExp][] =
  [
    ["PUT", `${REPO}/pulls/3/merge`, "{}", /Merging/],
    ["POST", `${REPO}/pulls/3/merge`, "{}", /Merging/],
    ["POST", `${REPO}/pulls/3/reviews`, '{"event":"APPROVE"}', /COMMENT/],
    [
      "POST",
      `${REPO}/pulls/3/reviews`,
      '{"event":"REQUEST_CHANGES"}',
      /COMMENT/,
    ],
    ["POST", `${REPO}/pulls/3/reviews`, '{"body":"draft"}', /COMMENT/],
    ["POST", `${REPO}/pulls/3/reviews`, "not json", /COMMENT/],
    ["POST", `${REPO}/pulls/3/reviews`, "null", /COMMENT/],
    ["POST", `${REPO}/statuses/main`, "{}", /full commit SHA/],
    ["POST", `${REPO}/statuses/abc1234`, "{}", /full commit SHA/],
    ["PATCH", `${REPO}/issues/7`, "{}", /overwrite newer changes/],
    ["DELETE", `${REPO}/issues/7/labels/bug`, "", /overwrite newer changes/],
    ["PUT", `${REPO}/issues/7/labels`, "[]", /overwrite newer changes/],
    ["POST", `${REPO}/issues/`, "{}", /not on the list/],
    ["POST", `${REPO}/issues/0/comments`, "{}", /not on the list/],
    ["POST", `${REPO}/issues/abc/comments`, "{}", /not on the list/],
    ["POST", `${REPO}/issues/7/comments/extra`, "{}", /not on the list/],
    ["POST", `${REPO}/pulls`, "{}", /not on the list/],
    ["POST", `${REPO}/git/refs`, "{}", /not on the list/],
    ["POST", "/repos/octo/issues", "{}", /not on the list/],
    ["POST", "/user/repos", "{}", /not on the list/],
  ];

describe("classifyWrite", () => {
  it.each(queueable)("queues %s %s", (method, path, body = "{}") => {
    expect(classifyWrite(method, path, body)).toEqual({ queueable: true });
  });

  it.each(rejected)("refuses %s %s %s", (method, path, body, reason) => {
    const result = classifyWrite(method, path, body);
    expect(result.queueable).toBe(false);
    if (!result.queueable) expect(result.reason).toMatch(reason);
  });
});

it("refuses non-queueable writes with 503 while the breaker is open", async () => {
  const registry = env.Registry.getByName(REGISTRY_NAME);
  await registry.setChaos("demo", { ...CHAOS_OFF, mode: "blackout" });
  const base = "http://backstop.test/demo/gh/repos/demo/write-policy";
  for (let i = 0; i < 5; i++) {
    const read = await exports.default.fetch(`${base}/issues?page=${i}`);
    await read.body?.cancel();
  }

  const merge = await exports.default.fetch(`${base}/pulls/1/merge`, {
    method: "PUT",
    body: "{}",
  });
  expect(merge.status).toBe(503);
  expect(merge.headers.get("x-backstop-mode")).toBe("degraded");
  expect(await merge.json()).toEqual({
    error: "write_not_queueable",
    reason: expect.stringMatching(/Merging/),
  });
  await registry.setChaos("demo", CHAOS_OFF);
});
