import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 2000;

export interface Polled<T> {
  data: T | null;
  error: string | null;
}

type Keyed<T> = Polled<T> & { key: string };

export type Poll<T> = Polled<T> & { refresh: () => void };

export function usePoll<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): Poll<T> {
  const tickNow = useRef<() => void>(() => undefined);
  const refresh = useCallback(() => tickNow.current(), []);
  const [state, setState] = useState<Keyed<T>>({
    key,
    data: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;

    const tick = async () => {
      clearTimeout(timer);
      if (running || document.hidden) return;
      running = true;
      try {
        const data = await load(controller.signal);
        if (!controller.signal.aborted) setState({ key, data, error: null });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState((previous) => ({
            key,
            data: previous.key === key ? previous.data : null,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      } finally {
        running = false;
      }
      if (!controller.signal.aborted && !document.hidden) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearTimeout(timer);
      else void tick();
    };

    tickNow.current = () => void tick();
    document.addEventListener("visibilitychange", onVisibilityChange);
    void tick();
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [key, load]);

  if (state.key !== key) return { data: null, error: null, refresh };
  return { data: state.data, error: state.error, refresh };
}
