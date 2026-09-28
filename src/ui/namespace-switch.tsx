import { Tabs } from "@cloudflare/kumo";
import type { Namespace } from "../gateway/routes";

const TABS = [
  { value: "demo", label: "Demo" },
  { value: "live", label: "Live" },
];

export function NamespaceSwitch({
  value,
  onChange,
}: {
  value: Namespace;
  onChange: (namespace: Namespace) => void;
}) {
  return (
    <div role="group" aria-label="Namespace">
      <Tabs
        size="sm"
        tabs={TABS}
        value={value}
        onValueChange={(next) => onChange(next === "live" ? "live" : "demo")}
      />
    </div>
  );
}
