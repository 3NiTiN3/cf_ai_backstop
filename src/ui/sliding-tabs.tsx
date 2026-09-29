import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { useIndicator } from "./use-indicator";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  badge?: ReactNode;
}

export function SlidingTabs<T extends string>({
  id,
  label,
  tabs,
  value,
  onChange,
}: {
  id: string;
  label: string;
  tabs: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { container, box } = useIndicator(value);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.value);
    buttons.current[next]?.focus();
  };

  return (
    <div
      ref={container}
      role="tablist"
      aria-label={label}
      className="relative flex gap-5 border-b border-kumo-line"
    >
      {tabs.map((tab, index) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            id={`${id}-tab-${tab.value}`}
            type="button"
            role="tab"
            data-active={active}
            aria-selected={active}
            aria-controls={`${id}-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`-mb-px flex h-10 items-center gap-1.5 text-body font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus ${active ? "text-kumo-default" : "text-kumo-subtle hover:text-kumo-default"}`}
          >
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
      {box && (
        <span
          aria-hidden
          className="absolute -bottom-px left-0 h-0.5 rounded-full bg-kumo-brand transition-[transform,width] duration-300 ease-out-soft"
          style={{ transform: `translateX(${box.left}px)`, width: box.width }}
        />
      )}
    </div>
  );
}

export function TabPanel({
  id,
  value,
  children,
}: {
  id: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div
      key={value}
      id={`${id}-panel`}
      role="tabpanel"
      aria-labelledby={`${id}-tab-${value}`}
      className="animate-enter space-y-6 pt-5 pb-6 lg:-mx-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-6 max-lg:pb-4"
    >
      {children}
    </div>
  );
}
