import { describe, expect, it } from "vitest";
import {
  summarizeIncident,
  templateSummary,
} from "../../src/gateway/incident-summary";
import type { ClosedIncident } from "../../src/gateway/incidents";

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

  it("caps long model output", async () => {
    const summary = await summarizeIncident(incident, null, async () =>
      "word ".repeat(400),
    );
    expect(summary.length).toBeLessThanOrEqual(600);
    expect(summary.endsWith("...")).toBe(true);
  });
});
