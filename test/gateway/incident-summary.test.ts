import { describe, expect, it } from "vitest";
import {
  summarizeIncident,
  templateSummary,
  withReplayStatus,
} from "../../src/gateway/incident-summary";
import {
  replayProgress,
  type ClosedIncident,
} from "../../src/gateway/incidents";

const incident: ClosedIncident = {
  id: "i-1",
  startedAt: Date.UTC(2026, 8, 29, 9, 58, 0),
  endedAt: Date.UTC(2026, 8, 29, 10, 3, 0),
  peakErrorRate: 0.625,
  readsServedStale: 40,
  writesQueued: 5,
  writesReplayed: 0,
  summary: null,
};

describe("summarizeIncident", () => {
  it("uses the template when the model hangs", async () => {
    const summary = await summarizeIncident(
      incident,
      "demo/web",
      () => new Promise(() => undefined),
      20,
    );
    expect(summary).toBe(templateSummary(incident, "demo/web"));
  });

  it("uses the template when the model returns nothing", async () => {
    const summary = await summarizeIncident(incident, null, async () => "   ");
    expect(summary).toBe(
      "The repo was degraded for 5 minutes from 09:58:00 UTC, with a peak upstream error rate of 63%. " +
        "Backstop served 40 stale reads and queued 5 writes for replay.",
    );
  });

  it("keeps replay progress out of the model's facts", async () => {
    let facts = "";
    await summarizeIncident(incident, "demo/web", async (_system, sheet) => {
      facts = sheet;
      return "ok";
    });
    expect(facts).toContain("Writes queued for replay: 5");
    expect(facts).not.toMatch(/replayed|under way/);
  });

  it("caps long model output", async () => {
    const summary = await summarizeIncident(incident, null, async () =>
      "word ".repeat(400),
    );
    expect(summary.length).toBeLessThanOrEqual(600);
    expect(summary.endsWith("...")).toBe(true);
  });
});

describe("replayProgress", () => {
  it("is completed only when every queued write was replayed", () => {
    expect(replayProgress({ writesQueued: 0, writesReplayed: 0 })).toBe(
      "nothing queued",
    );
    expect(replayProgress({ writesQueued: 2, writesReplayed: 1 })).toBe(
      "under way",
    );
    expect(replayProgress({ writesQueued: 2, writesReplayed: 2 })).toBe(
      "completed",
    );
  });
});

describe("withReplayStatus", () => {
  const summarized = { ...incident, summary: "demo/web was down." };

  it("reports replay from the current counts", () => {
    expect(withReplayStatus(summarized)).toBe(
      "demo/web was down. Replay of the queued writes is under way: 0 of 5 replayed so far.",
    );
    expect(withReplayStatus({ ...summarized, writesReplayed: 5 })).toBe(
      "demo/web was down. All 5 queued writes have been replayed.",
    );
  });

  it("adds nothing when no writes were queued or there is no summary", () => {
    expect(withReplayStatus({ ...summarized, writesQueued: 0 })).toBe(
      "demo/web was down.",
    );
    expect(withReplayStatus(incident)).toBeNull();
  });
});
