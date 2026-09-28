import { Badge } from "@cloudflare/kumo";
import type { BreakerState } from "../gateway/breaker";

const PILLS = {
  closed: { label: "Closed", variant: "success" },
  half_open: { label: "Half-open", variant: "warning" },
  open: { label: "Open", variant: "error" },
} as const satisfies Record<
  BreakerState,
  { label: string; variant: "success" | "warning" | "error" }
>;

export function BreakerPill({ state }: { state: BreakerState }) {
  const { label, variant } = PILLS[state];
  return <Badge variant={variant}>{label}</Badge>;
}
