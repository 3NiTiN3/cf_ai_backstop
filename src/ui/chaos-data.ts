import { useCallback } from "react";
import { z } from "zod";
import { CHAOS_MODES, type ChaosMode } from "../gateway/chaos";
import type { Namespace } from "../gateway/routes";
import { getJson, postJson } from "./api-client";
import { usePoll } from "./use-poll";

const ChaosSchema = z.object({
  mode: z.enum(CHAOS_MODES),
  errorRate: z.number(),
  latencyMs: z.number(),
});

export interface ChaosPreset {
  label: string;
  mode: ChaosMode;
  errorRate?: number;
}

export const CHAOS_PRESETS: ChaosPreset[] = [
  { label: "Normal", mode: "off" },
  { label: "Errors 50%", mode: "errors", errorRate: 0.5 },
  { label: "Slow", mode: "latency" },
  { label: "Blackout", mode: "blackout" },
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
