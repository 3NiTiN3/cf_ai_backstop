import { expect, it } from "vitest";
import { incidentFigures, incidentWindow } from "../../src/ui/incident-data";

const incident = {
  id: "i-1",
  repo: "demo/api",
  startedAt: Date.UTC(2026, 8, 29, 10, 0, 0),
  endedAt: Date.UTC(2026, 8, 29, 10, 0, 31),
  peakErrorRate: 0.2175,
  readsServedStale: 1430,
  writesQueued: 18,
  writesReplayed: 18,
  summary: null,
};

it("lists the incident figures for the card", () => {
  expect(incidentFigures(incident)).toEqual([
    ["Stale reads", "1,430"],
    ["Queued", "18"],
    ["Replayed", "18"],
    ["Peak errors", "21.8%"],
  ]);
});

it("describes how long an incident lasted or that it is ongoing", () => {
  expect(incidentWindow(incident)).toMatch(/ to .*, 31s$/);
  expect(
    incidentWindow({ ...incident, endedAt: incident.startedAt + 300_000 }),
  ).toMatch(/, 5m$/);
  expect(incidentWindow({ ...incident, endedAt: null })).toMatch(/^Since /);
});
