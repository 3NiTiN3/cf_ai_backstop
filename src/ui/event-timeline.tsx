import { Badge } from "@cloudflare/kumo";
import type { Namespace } from "../gateway/routes";
import { useTimeline, type TimelineEntry } from "./timeline-data";

const KIND_LABELS: Record<TimelineEntry["kind"], string> = {
  breaker: "Breaker",
  chaos: "Chaos",
  queue: "Queue",
  replay: "Replay",
  incident: "Incident",
};

export function EventTimeline({
  namespace,
  repoKey,
}: {
  namespace: Namespace;
  repoKey: string;
}) {
  const { data, error } = useTimeline(namespace, repoKey);

  return (
    <section aria-labelledby="timeline-heading" className="space-y-2">
      <h2
        id="timeline-heading"
        className="text-sm font-semibold text-kumo-default"
      >
        Timeline for {repoKey}
      </h2>
      {error && (
        <p role="status" className="text-xs text-kumo-danger">
          Could not refresh the timeline: {error}
        </p>
      )}
      {data === null ? (
        <p className="text-sm text-kumo-subtle">Loading events</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-kumo-subtle">
          No breaker, chaos, queue or incident events for this repo yet.
        </p>
      ) : (
        <ol
          tabIndex={0}
          aria-label={`Events for ${repoKey}, newest first`}
          className="max-h-96 overflow-y-auto rounded-xl border border-kumo-line bg-kumo-base divide-y divide-kumo-line focus-visible:outline-2 focus-visible:outline-kumo-ring"
        >
          {data.map((entry, index) => (
            <li
              key={`${entry.at}-${index}`}
              className="flex items-start gap-3 px-4 py-2 text-sm"
            >
              <time
                dateTime={new Date(entry.at).toISOString()}
                className="shrink-0 w-16 tabular-nums text-xs text-kumo-subtle pt-0.5"
              >
                {clock(entry.at)}
              </time>
              <Badge variant="secondary">{KIND_LABELS[entry.kind]}</Badge>
              <span className="min-w-0 break-words text-kumo-default">
                {entry.text}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString("en-GB", { hour12: false });
}
