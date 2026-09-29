import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { dryRun } from "../../src/agent/eval";
import { INITIAL_OPS_STATE } from "../../src/agent/state";
import { createAgentTools } from "../../src/agent/toolset";

describe("dryRun", () => {
  it("keeps every tool schema but removes execution and approval", () => {
    const tools = createAgentTools({
      env,
      namespace: "demo",
      state: () => INITIAL_OPS_STATE,
      save: () => {},
    });
    const dry = dryRun(tools);
    expect(Object.keys(dry)).toEqual(Object.keys(tools));
    for (const [name, definition] of Object.entries(dry)) {
      expect(definition.execute, name).toBeUndefined();
      expect(definition.needsApproval, name).toBeUndefined();
      expect(definition.description, name).toBeTruthy();
    }
  });
});

describe("POST /api/dev/eval", () => {
  it("is not found outside the dev environment", async () => {
    expect(env.ENVIRONMENT).toBe("production");
    const response = await exports.default.fetch(
      "http://backstop.test/api/dev/eval",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "hi" }),
      },
    );
    expect(response.status).toBe(404);
    await response.body?.cancel();
  });
});
