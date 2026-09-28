import { Banner } from "@cloudflare/kumo";
import { KeyIcon } from "@phosphor-icons/react";
import type { Namespace } from "../gateway/routes";
import { OverviewCards } from "./overview-cards";

export function Dashboard({ namespace }: { namespace: Namespace }) {
  return (
    <section
      aria-label="Gateway dashboard"
      className="px-4 sm:px-6 py-5 space-y-5"
    >
      {namespace === "live" && (
        <Banner
          variant="alert"
          icon={<KeyIcon size={18} />}
          title="Live namespace"
          description="This shows real traffic. Chaos, queue and replay controls need an admin token."
        />
      )}
      <OverviewCards namespace={namespace} />
    </section>
  );
}
