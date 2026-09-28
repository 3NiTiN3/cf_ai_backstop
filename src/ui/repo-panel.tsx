import type { Namespace } from "../gateway/routes";
import type { RepoRow } from "./repo-rows";
import { RepoTable } from "./repo-table";

export function RepoPanel({
  namespace,
  rows,
  selected,
  onSelect,
}: {
  namespace: Namespace;
  rows: RepoRow[] | null;
  selected: string | null;
  onSelect: (repoKey: string) => void;
}) {
  const prefix = namespace === "demo" ? "/demo/gh" : "/gh";
  return (
    <section aria-labelledby="repos-heading" className="space-y-2">
      <h2
        id="repos-heading"
        className="text-sm font-semibold text-kumo-default"
      >
        Repos
      </h2>
      {rows === null ? (
        <p className="text-sm text-kumo-subtle">Loading repos</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-kumo-subtle">
          No traffic yet. Send a GitHub API request through{" "}
          <code className="text-kumo-default">{prefix}/repos/owner/name</code>{" "}
          to see it here.
        </p>
      ) : (
        <RepoTable rows={rows} selected={selected} onSelect={onSelect} />
      )}
    </section>
  );
}
