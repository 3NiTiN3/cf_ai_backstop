import { useCallback } from "react";
import { z } from "zod";
import { CHAOS_MODES, type ChaosMode } from "../gateway/chaos";
import type { Namespace } from "../gateway/routes";
import { getJson, postJson } from "./api-client";
import type { Tone } from "./segmented";
import { usePoll } from "./use-poll";

const ChaosSchema = z.object({
  mode: z.enum(CHAOS_MODES),
  errorRate: z.number(),
  latencyMs: z.number(),
});

export interface ChaosPreset {
  label: string;
  mode: ChaosMode;
  tone: Tone;
  errorRate?: number;
}

export const CHAOS_PRESETS: ChaosPreset[] = [
  { label: "Normal", mode: "off", tone: "success" },
  { label: "Errors 50%", mode: "errors", tone: "warning", errorRate: 0.5 },
  { label: "Slow", mode: "latency", tone: "info" },
  { label: "Blackout", mode: "blackout", tone: "danger" },
];

export function useChaos(namespace: Namespace) {
  const load = useCallback(
    (signal: AbortSignal) =>
      getJson(`/api/chaos?namespace=${namespace}`, ChaosSchema, signal),
    [namespace],
  );
  return usePoll(namespace, load);
}

export function setChaos(
  namespace: Namespace,
  preset: ChaosPreset,
  adminToken: string,
): Promise<void> {
  const { mode, errorRate } = preset;
  return postJson("/api/chaos", { namespace, mode, errorRate }, adminToken);
}
