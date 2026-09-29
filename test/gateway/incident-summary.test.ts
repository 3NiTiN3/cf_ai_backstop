import { describe, expect, it } from "vitest";
import {
  summarizeIncident,
  templateSummary,
  withWriteStatus,
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
      "The repo was degraded for 5 minutes, with a peak upstream error rate of 62.5%. " +
        "Backstop served 40 reads from stale cache.",
    );
  });

  it("keeps write counts out of the stored summary", async () => {
    let facts = "";
    await summarizeIncident(incident, "demo/web", async (_system, sheet) => {
      facts = sheet;
      return "ok";
    });
    expect(facts).toContain("Reads served from stale cache: 40");
    expect(facts).not.toMatch(/write|queue|replay/i);
    expect(templateSummary(incident, "demo/web")).not.toMatch(
      /write|queue|replay/i,
    );
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

describe("withWriteStatus", () => {
  const summarized = { ...incident, summary: "demo/web was down." };

  it("reports queued and replayed writes from the current counts", () => {
    expect(withWriteStatus(summarized)).toBe(
      "demo/web was down. Backstop queued 5 writes for replay, and 0 of 5 have been replayed so far.",
    );
    expect(withWriteStatus({ ...summarized, writesReplayed: 5 })).toBe(
      "demo/web was down. Backstop queued 5 writes for replay, and all 5 have been replayed.",
    );
    expect(
      withWriteStatus({ ...summarized, writesQueued: 1, writesReplayed: 1 }),
    ).toBe(
      "demo/web was down. Backstop queued 1 write for replay, and it has been replayed.",
    );
  });

  it("counts writes credited after the summary was written", () => {
    const stored = {
      ...summarized,
      summary: templateSummary(incident, "demo/web"),
    };
    const later = { ...stored, writesQueued: 26, writesReplayed: 26 };
    expect(withWriteStatus(later)).toContain(
      "Backstop queued 26 writes for replay, and all 26 have been replayed.",
    );
    expect(withWriteStatus(later)?.match(/\d+ writes/g)).toEqual(["26 writes"]);
  });

  it("adds nothing when no writes were queued or there is no summary", () => {
    expect(withWriteStatus({ ...summarized, writesQueued: 0 })).toBe(
      "demo/web was down.",
    );
    expect(withWriteStatus(incident)).toBeNull();
  });
});
