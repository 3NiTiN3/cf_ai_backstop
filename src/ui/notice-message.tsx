import { Banner } from "@cloudflare/kumo";
import { WarningCircleIcon } from "@phosphor-icons/react";

export function NoticeMessage({ text }: { text: string }) {
  return (
    <div role="status" className="max-w-[85%]">
      <Banner
        variant="error"
        icon={<WarningCircleIcon size={18} />}
        description={text || "The model did not answer."}
      />
    </div>
  );
}
