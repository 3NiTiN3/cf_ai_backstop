import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CaretUpDownIcon, CheckIcon } from "@phosphor-icons/react";
import type { BreakerState } from "../gateway/breaker";

export interface PickerOption {
  repoKey: string;
  breaker: BreakerState;
}

const BREAKER_DOT: Record<BreakerState, string> = {
  closed: "bg-kumo-success",
  half_open: "bg-kumo-warning",
  open: "bg-kumo-danger",
};

export function RepoPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: PickerOption[];
  value: string;
  onChange: (repoKey: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.repoKey === value),
  );
  const current = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    list.current?.focus();
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      list.current
        ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [active, open]);

  const show = () => {
    setActive(selectedIndex);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.repoKey);
    setOpen(false);
    trigger.current?.focus();
  };

  const onTriggerKey = (event: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      show();
    }
  };

  const onListKey = (event: KeyboardEvent) => {
    const last = options.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key] ?? active);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape" || event.key === "Tab") {
      setOpen(false);
      if (event.key === "Escape") trigger.current?.focus();
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`${label}: ${value}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onTriggerKey}
        className="flex h-9 min-w-60 items-center gap-2.5 rounded-lg border border-kumo-line bg-kumo-base pr-2.5 pl-3 text-body text-kumo-default shadow-xs transition-[border-color,transform] duration-200 hover:border-kumo-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus active:scale-[0.98]"
      >
        {current && (
          <span
            aria-hidden
            className={`size-2 shrink-0 rounded-full transition-colors duration-300 ${BREAKER_DOT[current.breaker]}`}
          />
        )}
        <span className="flex-1 truncate text-left">{value}</span>
        <CaretUpDownIcon aria-hidden size={14} className="text-kumo-subtle" />
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-option-${active}`}
          onKeyDown={onListKey}
          className="animate-pop absolute top-full left-0 z-20 mt-1.5 max-h-72 w-full min-w-60 origin-top overflow-y-auto rounded-xl border border-kumo-line bg-kumo-base p-1 shadow-lg outline-none"
        >
          {options.map((option, index) => {
            const selected = option.repoKey === value;
            return (
              <li
                key={option.repoKey}
                id={`${id}-option-${index}`}
                data-index={index}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActive(index)}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-body transition-colors duration-150 ${index === active ? "bg-kumo-control" : ""}`}
              >
                <span
                  aria-hidden
                  className={`size-2 shrink-0 rounded-full ${BREAKER_DOT[option.breaker]}`}
                />
                <span className="flex-1 truncate text-kumo-default">
                  {option.repoKey}
                </span>
                {selected && (
                  <CheckIcon
                    aria-hidden
                    size={14}
                    className="text-kumo-default"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
