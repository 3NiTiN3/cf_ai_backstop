import type { Namespace } from "../gateway/routes";
import { NamespaceSwitch } from "./namespace-switch";
import { ThemeToggle } from "./theme-toggle";

export function Header({
  namespace,
  onNamespaceChange,
}: {
  namespace: Namespace;
  onNamespaceChange: (namespace: Namespace) => void;
}) {
  return (
    <header className="px-4 sm:px-6 py-3 bg-kumo-base border-b border-kumo-line">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-kumo-default">Backstop</h1>
          <p className="text-sm text-kumo-subtle">
            A gateway between AI coding agents and GitHub. It caches reads,
            serves stale data during outages and replays queued writes when
            GitHub recovers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <NamespaceSwitch value={namespace} onChange={onNamespaceChange} />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
