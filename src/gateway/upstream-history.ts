const SLOT_MS = 15_000;
export const HISTORY_SLOTS = 20;

export type HistoryBuckets = [start: number, calls: number, failures: number][];

interface Slot {
  calls: number;
  failures: number;
}

export class UpstreamHistory {
  private readonly slots = new Map<number, Slot>();

  constructor(private readonly now: () => number) {}

  record(failed: boolean): void {
    const start = slotOf(this.now());
    const slot = this.slots.get(start) ?? { calls: 0, failures: 0 };
    slot.calls += 1;
    if (failed) slot.failures += 1;
    this.slots.set(start, slot);
    this.prune(start);
  }

  recent(): HistoryBuckets {
    this.prune(slotOf(this.now()));
    return [...this.slots].map(([start, { calls, failures }]) => [
      start,
      calls,
      failures,
    ]);
  }

  private prune(current: number): void {
    for (const start of this.slots.keys()) {
      if (start <= current - HISTORY_SLOTS * SLOT_MS) this.slots.delete(start);
    }
  }
}

export function errorSeries(
  buckets: HistoryBuckets,
  now: number,
): (number | null)[] {
  const byStart = new Map(
    buckets.map(([start, calls, failures]) => [start, { calls, failures }]),
  );
  const current = slotOf(now);
  return Array.from({ length: HISTORY_SLOTS }, (_, index) => {
    const slot = byStart.get(current - (HISTORY_SLOTS - 1 - index) * SLOT_MS);
    return slot && slot.calls > 0 ? slot.failures / slot.calls : null;
  });
}

function slotOf(ms: number): number {
  return Math.floor(ms / SLOT_MS) * SLOT_MS;
}
