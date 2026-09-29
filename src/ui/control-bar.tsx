import type { Namespace } from "../gateway/routes";
import { ChaosPanel } from "./chaos-panel";
import { LiveBar } from "./live-bar";
import { StoryPanel } from "./story-panel";

export function ControlBar({
  namespace,
  adminToken,
  onAdminTokenChange,
}: {
  namespace: Namespace;
  adminToken: string;
  onAdminTokenChange: (token: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-kumo-line bg-kumo-base px-4 py-3">
      {namespace === "demo" ? (
        <StoryPanel />
      ) : (
        <LiveBar
          adminToken={adminToken}
          onAdminTokenChange={onAdminTokenChange}
        />
      )}
      <div aria-hidden className="h-px bg-kumo-line" />
      <ChaosPanel namespace={namespace} adminToken={adminToken} />
    </div>
  );
}
