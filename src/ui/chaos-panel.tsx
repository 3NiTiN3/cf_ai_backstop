import { useState } from "react";
import { Button } from "@cloudflare/kumo";
import type { Namespace } from "../gateway/routes";
import {
  CHAOS_PRESETS,
  setChaos,
  useChaos,
  type ChaosPreset,
} from "./chaos-data";

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
    <section aria-labelledby="chaos-heading" className="space-y-2">
      <h2
        id="chaos-heading"
        className="text-sm font-semibold text-kumo-default"
      >
        Chaos
      </h2>
      <p className="text-xs text-kumo-subtle">
        Inject faults into calls to GitHub for the whole {namespace} namespace.
        {locked && " Enter the admin token above to change live chaos."}
      </p>
      <div
        role="group"
        aria-label="Chaos mode"
        className="flex flex-wrap gap-2"
      >
        {CHAOS_PRESETS.map((preset) => {
          const active = chaos.data?.mode === preset.mode;
          return (
            <Button
              key={preset.mode}
              variant={active ? "primary" : "secondary"}
              aria-pressed={active}
              disabled={locked || busy}
              onClick={() => void apply(preset)}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
      {(failure ?? chaos.error) && (
        <p role="status" className="text-xs text-kumo-danger">
          {failure ?? `Could not load chaos settings: ${chaos.error}`}
        </p>
      )}
    </section>
  );
}
