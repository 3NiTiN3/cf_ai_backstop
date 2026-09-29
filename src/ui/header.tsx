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
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b border-kumo-line bg-kumo-base/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="text-title text-kumo-default">Backstop</h1>
        <p className="hidden truncate text-body text-kumo-subtle sm:block">
          Resilience gateway between AI agents and the GitHub API
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <NamespaceSwitch value={namespace} onChange={onNamespaceChange} />
        <ThemeToggle />
      </div>
    </header>
  );
}
