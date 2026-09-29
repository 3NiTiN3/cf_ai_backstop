import { useIndicator } from "./use-indicator";

export type Tone = "neutral" | "success" | "warning" | "info" | "danger";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  tone?: Tone;
}

const PILL: Record<Tone, string> = {
  neutral: "bg-kumo-base shadow-sm",
  success: "bg-kumo-success-tint shadow-sm",
  warning: "bg-kumo-warning-tint shadow-sm",
  info: "bg-kumo-info-tint shadow-sm",
  danger: "bg-kumo-danger-tint shadow-sm",
};

const ACTIVE_TEXT: Record<Tone, string> = {
  neutral: "text-kumo-default",
  success: "text-kumo-success",
  warning: "text-kumo-warning",
  info: "text-kumo-info",
  danger: "text-kumo-danger",
};

export function Segmented<T extends string>({
  label,
  options,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  options: SegmentedOption<T>[];
  value: T | null;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const { container, box } = useIndicator(value);
  const activeTone = options.find((option) => option.value === value)?.tone;

  return (
    <div
      ref={container}
      role="group"
      aria-label={label}
      className="relative inline-flex rounded-lg bg-kumo-control p-0.5"
    >
      {box && (
        <span
          aria-hidden
          className={`absolute inset-y-0.5 left-0 rounded-md transition-[transform,width,background-color] duration-300 ease-out-soft ${PILL[activeTone ?? "neutral"]}`}
          style={{ transform: `translateX(${box.left}px)`, width: box.width }}
        />
      )}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            data-active={active}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`relative h-7 rounded-md px-3 text-caption font-medium transition-[color,transform] duration-200 focus-visible:outline-2 focus-visible:outline-kumo-focus active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100 ${active ? ACTIVE_TEXT[option.tone ?? "neutral"] : "text-kumo-subtle enabled:hover:text-kumo-default"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
