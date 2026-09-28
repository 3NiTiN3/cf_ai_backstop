import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../src/agent/prompt";
import { INITIAL_OPS_STATE, type OpsState } from "../../src/agent/state";

const watching: OpsState = {
  namespace: "live",
  watchedRepos: ["acme/api", "acme/web"],
  lastSeenIncidentAt: Date.UTC(2026, 8, 29, 10, 1, 0),
};

const EM_DASH = String.fromCharCode(0x2014);

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
    expect(prompt).toContain(
      "Incidents already shown to the user up to: 2026-09-29T10:01:00.000Z",
    );
  });

  it("says when no repos are watched", () => {
    expect(buildSystemPrompt(INITIAL_OPS_STATE)).toContain(
      "Watched repos: none yet",
    );
  });

  it("contains no em dashes", () => {
    expect(buildSystemPrompt(watching)).not.toContain(EM_DASH);
  });
});
