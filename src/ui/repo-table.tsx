import { BreakerPill } from "./breaker-pill";
import type { RepoRow } from "./repo-rows";
import { Sparkline } from "./sparkline";

const HEADERS = [
  "Repo",
  "Breaker",
  "Error rate",
  "p95",
  "Hit rate",
  "Queue",
  "Last 5 min",
];

export function RepoTable({
  rows,
  selected,
  onSelect,
}: {
  rows: RepoRow[];
  selected: string | null;
  onSelect: (repoKey: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-kumo-line bg-kumo-base">
      <table className="w-full text-body">
        <caption className="sr-only">
          Repos seen by the gateway. Select one to see its timeline.
        </caption>
        <thead>
          <tr className="border-b border-kumo-line text-left text-caption text-kumo-subtle">
            {HEADERS.map((header) => (
              <th
                key={header}
                scope="col"
                className="px-3 py-2 font-medium whitespace-nowrap"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = row.repoKey === selected;
            return (
              <tr
                key={row.repoKey}
                onClick={() => onSelect(row.repoKey)}
                className={`cursor-pointer border-b border-kumo-line transition-colors duration-200 last:border-0 ${isSelected ? "bg-kumo-control" : "hover:bg-kumo-elevated"}`}
              >
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    className="text-kumo-default hover:underline whitespace-nowrap rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus"
                  >
                    {row.repoKey}
                  </button>
                </th>
                <td className="px-3 py-2">
                  <BreakerPill state={row.breaker} />
                </td>
                <Cell>{row.errorRate}</Cell>
                <Cell>{row.p95}</Cell>
                <Cell>{row.hitRate}</Cell>
                <Cell>{row.queueDepth}</Cell>
                <td className="px-3 py-2">
                  <Sparkline
                    values={row.errorHistory}
                    label={`Upstream error rate for ${row.repoKey} over the last 5 minutes`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ children }: { children: string }) {
  return (
    <td className="px-3 py-2 font-figures text-caption whitespace-nowrap text-kumo-default">
      {children}
    </td>
  );
}
