import type { ChaosEvent } from "./chaos-store";
import type { GatewayEvent } from "./events";
import { withReplayStatus } from "./incident-summary";
import type { Incident } from "./incidents";

export const TIMELINE_LIMIT = 50;

export type TimelineKind =
  "breaker" | "chaos" | "queue" | "replay" | "incident";

export interface TimelineEntry {
  at: number;
  kind: TimelineKind;
  text: string;
}

export interface TimelineSources {
  events: GatewayEvent[];
  chaos: ChaosEvent[];
  incidents: Incident[];
}

const TRANSITION = /^(\w+) -> (\w+) \((\w+)\)$/;

export function buildTimeline({
  events,
  chaos,
  incidents,
}: TimelineSources): TimelineEntry[] {
  return [
    ...events.flatMap(eventEntry),
    ...chaos.map(chaosEntry),
    ...incidents.flatMap(incidentEntries),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, TIMELINE_LIMIT);
}

function eventEntry(event: GatewayEvent): TimelineEntry[] {
  const at = event.ts;
  const request = `${event.method} ${event.path}`;
  switch (event.kind) {
    case "breaker":
      return [{ at, kind: "breaker", text: transitionText(event.detail) }];
    case "write":
      return event.cache === "QUEUED"
        ? [{ at, kind: "queue", text: `Queued ${request}` }]
        : [];
    case "replay":
      return [
        {
          at,
          kind: "replay",
          text: isSuccess(event.status)
            ? `Replayed ${request} (${event.status})`
            : `Replay of ${request} failed (${event.status})`,
        },
      ];
    case "replay_started":
      return [
        {
          at,
          kind: "replay",
          text: `Replay started (${reasonOf(event.detail)})`,
        },
      ];
    case "queue":
      return [{ at, kind: "queue", text: queueText(event.detail) }];
    case "writes":
      return [
        { at, kind: "queue", text: `Writes ${event.detail ?? "changed"}` },
      ];
    default:
      return [];
  }
}

function chaosEntry(event: ChaosEvent): TimelineEntry {
  return { at: event.ts, kind: "chaos", text: chaosText(event) };
}

function incidentEntries(incident: Incident): TimelineEntry[] {
  const started: TimelineEntry = {
    at: incident.startedAt,
    kind: "incident",
    text: "Incident started",
  };
  if (incident.endedAt === null) return [started];
  const summary = withReplayStatus(incident) ?? "Incident ended";
  return [{ at: incident.endedAt, kind: "incident", text: summary }, started];
}

function transitionText(detail: string | undefined): string {
  const match = TRANSITION.exec(detail ?? "");
  if (!match) return `Breaker changed ${detail ?? ""}`.trim();
  const [, from = "", to = "", reason = ""] = match;
  return `Breaker ${words(from)} to ${words(to)} (${words(reason)})`;
}

function chaosText(event: ChaosEvent): string {
  switch (event.mode) {
    case "off":
      return "Chaos off";
    case "blackout":
      return "Chaos blackout: every upstream call fails";
    case "errors":
      return `Chaos errors: ${Math.round(event.errorRate * 100)}% of upstream calls fail`;
    case "latency":
      return `Chaos slow: upstream calls delayed ${event.latencyMs} ms`;
  }
}

function queueText(detail: string | undefined): string {
  const [action, id] = (detail ?? "").split(" ");
  if (action === "retry") return `Queued write ${id} set to retry`;
  if (action === "drop") return `Queued write ${id} dropped`;
  return `Queue changed ${detail ?? ""}`.trim();
}

function reasonOf(detail: string | undefined): string {
  return (detail ?? "").split(":")[0] || "manual";
}

function words(value: string): string {
  return value.replace("half_open", "half-open").replace(/_/g, " ");
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}
