import { describe, expect, it } from "vitest";
import {
  INITIAL_OPS_STATE,
  MAX_WATCHED_REPOS,
  readOpsState,
  watchRepo,
  type OpsState,
} from "../../src/agent/state";

describe("readOpsState", () => {
  it("fills fields missing from older stored state", () => {
    expect(
      readOpsState({ namespace: "demo", watchedRepos: ["demo/api"] }),
    ).toEqual({
      namespace: "demo",
      watchedRepos: ["demo/api"],
      lastSeenIncidentAt: null,
    });
  });

  it("falls back to the initial state for junk", () => {
    expect(readOpsState(undefined)).toEqual(INITIAL_OPS_STATE);
    expect(readOpsState({ namespace: "prod", watchedRepos: "x" })).toEqual(
      INITIAL_OPS_STATE,
    );
  });
});

describe("watchRepo", () => {
  it("adds repos once, sorted", () => {
    let state: OpsState = INITIAL_OPS_STATE;
    for (const repo of ["demo/web", "demo/api", "demo/web"]) {
      const change = watchRepo(state, repo, true);
      if (!change.ok) throw new Error(change.reason);
      state = change.state;
    }
    expect(state.watchedRepos).toEqual(["demo/api", "demo/web"]);
  });

  it("removes repos and ignores ones not watched", () => {
    const state = { ...INITIAL_OPS_STATE, watchedRepos: ["demo/api"] };
    expect(watchRepo(state, "demo/api", false)).toEqual({
      ok: true,
      state: INITIAL_OPS_STATE,
    });
    expect(watchRepo(state, "demo/web", false)).toEqual({ ok: true, state });
  });

  it("caps the watch list", () => {
    const watchedRepos = Array.from(
      { length: MAX_WATCHED_REPOS },
      (_, i) => `demo/r${i}`,
    );
    const full = { ...INITIAL_OPS_STATE, watchedRepos };
    expect(watchRepo(full, "demo/extra", true)).toMatchObject({ ok: false });
    expect(watchRepo(full, "demo/r0", true)).toMatchObject({ ok: true });
  });
});
