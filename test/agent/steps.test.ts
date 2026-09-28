import { describe, expect, it } from "vitest";
import { answerAfterTools } from "../../src/agent/steps";

function step(...calls: [string, unknown][]) {
  return {
    toolCalls: calls.map(([toolName, input]) => ({ toolName, input })),
  };
}

describe("answerAfterTools", () => {
  it("keeps tools while calls are new", () => {
    expect(answerAfterTools({ steps: [] })).toBeUndefined();
    expect(
      answerAfterTools({
        steps: [
          step(["getOverview", {}]),
          step(["getRepoHealth", { repo: "demo/api" }]),
        ],
      }),
    ).toBeUndefined();
  });

  it("withdraws tools once a call repeats", () => {
    const health = ["getRepoHealth", { repo: "demo/api" }] as [string, unknown];
    expect(answerAfterTools({ steps: [step(health), step(health)] })).toEqual({
      activeTools: [],
    });
  });

  it("withdraws tools after three tool steps", () => {
    expect(
      answerAfterTools({
        steps: [
          step(["getOverview", {}]),
          step(["listQueue", { repo: "demo/api" }]),
          step(["getRecentEvents", { repo: "demo/api" }]),
        ],
      }),
    ).toEqual({ activeTools: [] });
  });
});
