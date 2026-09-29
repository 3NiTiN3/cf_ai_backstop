import { gatewayPrefix, type Namespace } from "../gateway/routes";
import { PanelBody } from "./panel-body";
import { Section } from "./section";
import type { RepoRow } from "./repo-rows";
import { RepoTable } from "./repo-table";

export function RepoPanel({
  namespace,
  rows,
  error,
  selected,
  onSelect,
}: {
  namespace: Namespace;
  rows: RepoRow[] | null;
  error: string | null;
  selected: string | null;
  onSelect: (repoKey: string) => void;
}) {
  const prefix = gatewayPrefix(namespace);
  return (
    <Section id="repos-heading" title="Repos">
      <PanelBody data={rows} error={error} what="repos" skeletonClass="h-40">
        {(loaded) =>
          loaded.length === 0 ? (
            <p className="text-body text-kumo-subtle">
              No traffic yet. Send a request through{" "}
              <code className="text-kumo-default">
                {prefix}/repos/owner/name
              </code>
              .
            </p>
          ) : (
            <RepoTable rows={loaded} selected={selected} onSelect={onSelect} />
          )
        }
      </PanelBody>
    </Section>
  );
}
