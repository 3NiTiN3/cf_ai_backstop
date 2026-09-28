import { describe, expect, it } from "vitest";
import { answerAfterTools } from "../../src/agent/steps";

function step(...toolNames: string[]) {
  return { toolCalls: toolNames.map((toolName) => ({ toolName })) };
}

describe("answerAfterTools", () => {
  it("offers tools until a step calls one", () => {
    expect(answerAfterTools({ steps: [] })).toBeUndefined();
    expect(answerAfterTools({ steps: [step()] })).toBeUndefined();
  });

  it("withdraws all tools after the first step with tool calls", () => {
    expect(answerAfterTools({ steps: [step("getRepoHealth")] })).toEqual({
      activeTools: [],
    });
    expect(
      answerAfterTools({ steps: [step("getOverview", "listQueue")] }),
    ).toEqual({ activeTools: [] });
  });
});
