import { SensitiveInput } from "@cloudflare/kumo";

export function AdminToken({
  value,
  onChange,
}: {
  value: string;
  onChange: (token: string) => void;
}) {
  return (
    <SensitiveInput
      label="Admin token"
      description="Kept in this tab only and never saved. Needed for chaos and queue actions on live."
      value={value}
      onValueChange={onChange}
      autoComplete="off"
    />
  );
}
