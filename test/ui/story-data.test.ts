import { expect, it } from "vitest";
import { storyCaption, storySteps } from "../../src/ui/story-data";

function states(step: Parameters<typeof storySteps>[0]): string[] {
  return storySteps(step).map((item) => `${item.label}:${item.state}`);
}

it("marks earlier steps done and the current one active", () => {
  expect(states("idle")).toEqual([
    "Normal:upcoming",
    "Outage:upcoming",
    "Recovery:upcoming",
    "Replayed:upcoming",
  ]);
  expect(states("outage")).toEqual([
    "Normal:done",
    "Outage:current",
    "Recovery:upcoming",
    "Replayed:upcoming",
  ]);
  expect(states("replayed").every((item) => item.endsWith(":done"))).toBe(true);
});

it("has a plain caption for every step", () => {
  for (const step of [
    "idle",
    "normal",
    "outage",
    "recovery",
    "replayed",
  ] as const) {
    const caption = storyCaption(step);
    expect(caption.length).toBeGreaterThan(10);
    expect(caption).not.toContain(String.fromCharCode(0x2014));
  }
});
