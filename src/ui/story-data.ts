import { useCallback } from "react";
import { z } from "zod";
import { STORY_STEPS, type StoryStep } from "../demo/story";
import { getJson, postJson } from "./api-client";
import { usePoll } from "./use-poll";

const StorySchema = z.object({
  step: z.enum([...STORY_STEPS, "idle"]),
  running: z.boolean(),
  startedAt: z.number().nullable(),
});

export type StoryData = z.infer<typeof StorySchema>;
export type StepState = "done" | "current" | "upcoming";

const LABELS: Record<StoryStep, string> = {
  normal: "Normal",
  outage: "Outage",
  recovery: "Recovery",
  replayed: "Replayed",
};

const CAPTIONS: Record<StoryData["step"], string> = {
  idle: "About 90 seconds of agent traffic with a 30 second GitHub outage.",
  normal: "Ten agents read and write. Watch the cache hit rate climb.",
  outage: "GitHub is down. Reads come from stale cache and writes are queued.",
  recovery: "GitHub is back. The breaker closes and the queue replays.",
  replayed: "Queue drained. Ask the chat what just happened.",
};

export function storySteps(
  current: StoryData["step"],
): { step: StoryStep; label: string; state: StepState }[] {
  const index = current === "idle" ? -1 : STORY_STEPS.indexOf(current);
  return STORY_STEPS.map((step, position) => ({
    step,
    label: LABELS[step],
    state:
      position < index || current === "replayed"
        ? "done"
        : position === index
          ? "current"
          : "upcoming",
  }));
}

export function storyCaption(step: StoryData["step"]): string {
  return CAPTIONS[step];
}

export function useStory() {
  const load = useCallback(
    (signal: AbortSignal) => getJson("/api/demo/story", StorySchema, signal),
    [],
  );
  return usePoll("story", load);
}

export function playStory(): Promise<void> {
  return postJson("/api/demo/story", {}, "");
}

export function stopStory(): Promise<void> {
  return postJson("/api/demo/story/stop", {}, "");
}
