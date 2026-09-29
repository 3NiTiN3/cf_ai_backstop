export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

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
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-lg bg-kumo-control p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`h-7 rounded-md px-3 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-kumo-focus active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 ${active ? "bg-kumo-base text-kumo-default shadow-sm" : "text-kumo-subtle enabled:hover:text-kumo-default"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
