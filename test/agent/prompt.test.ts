import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../src/agent/prompt";
import { INITIAL_OPS_STATE } from "../../src/agent/state";

const watching = {
  namespace: "live" as const,
  watchedRepos: ["acme/api", "acme/web"],
};

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

describe("buildSystemPrompt", () => {
  it("matches the snapshot for the initial state", () => {
    expect(buildSystemPrompt(INITIAL_OPS_STATE)).toMatchSnapshot();
  });

  it("stays under 400 words", () => {
    expect(wordCount(buildSystemPrompt(watching))).toBeLessThan(400);
  });

  it("includes the namespace and watched repos", () => {
    const prompt = buildSystemPrompt(watching);
    expect(prompt).toContain("Current namespace: live");
    expect(prompt).toContain("Watched repos: acme/api, acme/web");
  });

  it("says when no repos are watched", () => {
    expect(buildSystemPrompt(INITIAL_OPS_STATE)).toContain(
      "Watched repos: none yet",
    );
  });

  it("contains no em dashes", () => {
    expect(buildSystemPrompt(watching)).not.toContain("—");
  });
});
