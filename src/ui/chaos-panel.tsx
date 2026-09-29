import { useState } from "react";
import type { Namespace } from "../gateway/routes";
import {
  CHAOS_PRESETS,
  setChaos,
  useChaos,
  type ChaosPreset,
} from "./chaos-data";
import { Section } from "./section";
import { Segmented } from "./segmented";

export function ChaosPanel({
  namespace,
  adminToken,
}: {
  namespace: Namespace;
  adminToken: string;
}) {
  const chaos = useChaos(namespace);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const locked = namespace === "live" && adminToken === "";

  const apply = async (preset: ChaosPreset) => {
    setBusy(true);
    setFailure(null);
    try {
      await setChaos(namespace, preset, adminToken);
      chaos.refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      id="chaos-heading"
      title="Chaos"
      aside={
        <Segmented
          label="Chaos mode"
          options={CHAOS_PRESETS.map(({ mode, label, tone }) => ({
            value: mode,
            label,
            tone,
          }))}
          value={chaos.data?.mode ?? null}
          disabled={locked || busy}
          onChange={(mode) => {
            const preset = CHAOS_PRESETS.find((item) => item.mode === mode);
            if (preset) void apply(preset);
          }}
        />
      }
    >
      {(failure ?? chaos.error) && (
        <p role="status" className="text-caption text-kumo-danger">
          {failure ?? `Could not load chaos settings: ${chaos.error}`}
        </p>
      )}
    </Section>
  );
}
