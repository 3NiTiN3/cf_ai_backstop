import type { Namespace } from "../gateway/routes";
import { BrandMark } from "./brand-mark";
import { NamespaceSwitch } from "./namespace-switch";
import type { OverviewData } from "./overview-data";
import { StatusPill } from "./status-pill";
import { ThemeToggle } from "./theme-toggle";

export function Header({
  namespace,
  onNamespaceChange,
  overview,
}: {
  namespace: Namespace;
  onNamespaceChange: (namespace: Namespace) => void;
  overview: OverviewData | null;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b border-kumo-line bg-kumo-base/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <BrandMark />
        <h1 className="text-title text-kumo-default">Backstop</h1>
        <p className="hidden truncate text-body text-kumo-subtle md:block">
          Resilience gateway between AI agents and the GitHub API
        </p>
        <StatusPill overview={overview} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <NamespaceSwitch value={namespace} onChange={onNamespaceChange} />
        <ThemeToggle />
      </div>
    </header>
  );
}
