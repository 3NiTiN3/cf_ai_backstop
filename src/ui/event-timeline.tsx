import type { Namespace } from "../gateway/routes";
import { PanelBody } from "./panel-body";
import { Section } from "./section";
import { useTimeline, type TimelineEntry } from "./timeline-data";

const KIND_DOTS: Record<TimelineEntry["kind"], string> = {
  breaker: "bg-kumo-warning",
  chaos: "bg-kumo-info",
  queue: "bg-kumo-fill",
  replay: "bg-kumo-success",
  incident: "bg-kumo-danger",
};

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
    <Section id="timeline-heading" title="Timeline" level={3}>
      <PanelBody
        data={data}
        error={error}
        what="the timeline"
        skeletonClass="h-40"
      >
        {(entries) =>
          entries.length === 0 ? (
            <p className="text-body text-kumo-subtle">No events yet.</p>
          ) : (
            <ol
              tabIndex={0}
              aria-label={`Events for ${repoKey}, newest first`}
              className="relative max-h-96 overflow-y-auto rounded-xl border border-kumo-line bg-kumo-base divide-y divide-kumo-line focus-visible:outline-2 focus-visible:outline-kumo-focus"
            >
              {withKeys(entries).map(({ key, entry }) => (
                <li
                  key={key}
                  className="flex items-baseline gap-3 px-3 py-2 text-body animate-enter"
                >
                  <time
                    dateTime={new Date(entry.at).toISOString()}
                    className="w-16 shrink-0 font-figures text-caption text-kumo-subtle"
                  >
                    {clock(entry.at)}
                  </time>
                  <span
                    aria-hidden
                    className={`size-1.5 shrink-0 translate-y-[-1px] rounded-full ${KIND_DOTS[entry.kind]}`}
                  />
                  <span className="sr-only">{KIND_LABELS[entry.kind]}:</span>
                  <span className="min-w-0 break-words text-kumo-default">
                    {entry.text}
                  </span>
                </li>
              ))}
            </ol>
          )
        }
      </PanelBody>
    </Section>
  );
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString("en-GB", { hour12: false });
}

function withKeys(entries: TimelineEntry[]) {
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    const base = `${entry.at}-${entry.kind}-${entry.text}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { key: `${base}-${count}`, entry };
  });
}
