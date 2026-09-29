import { useLayoutEffect, useRef, useState } from "react";

export interface IndicatorBox {
  left: number;
  width: number;
}

export function useIndicator(activeKey: string | null) {
  const container = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<IndicatorBox | null>(null);

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const measure = () => {
      const active = root.querySelector<HTMLElement>('[data-active="true"]');
      setBox(
        active ? { left: active.offsetLeft, width: active.offsetWidth } : null,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [activeKey]);

  return { container, box };
}
