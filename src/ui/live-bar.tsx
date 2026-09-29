import { SensitiveInput } from "@cloudflare/kumo";
import { KeyIcon } from "@phosphor-icons/react";

export function LiveBar({
  adminToken,
  onAdminTokenChange,
}: {
  adminToken: string;
  onAdminTokenChange: (token: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-kumo-line bg-kumo-base px-3 py-2">
      <KeyIcon size={16} className="text-kumo-warning shrink-0" />
      <p className="flex-1 min-w-48 text-sm text-kumo-default">
        Real traffic. Actions need an admin token.
      </p>
      <SensitiveInput
        size="sm"
        aria-label="Admin token"
        placeholder="Admin token"
        value={adminToken}
        onValueChange={onAdminTokenChange}
        className="w-full sm:w-56"
      />
    </div>
  );
}
