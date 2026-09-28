const WINDOW_SECONDS = 60;

export type RateBuckets = [second: number, count: number][];

export class RequestRate {
  private readonly buckets = new Map<number, number>();

  constructor(private readonly now: () => number) {}

  hit(): void {
    const second = secondOf(this.now());
    this.buckets.set(second, (this.buckets.get(second) ?? 0) + 1);
    this.prune(second);
  }

  recent(): RateBuckets {
    this.prune(secondOf(this.now()));
    return [...this.buckets];
  }

  private prune(current: number): void {
    for (const second of this.buckets.keys()) {
      if (second <= current - WINDOW_SECONDS) this.buckets.delete(second);
    }
  }
}

export function countLastMinute(buckets: RateBuckets, now: number): number {
  const oldest = secondOf(now) - WINDOW_SECONDS;
  return buckets.reduce(
    (sum, [second, count]) => (second > oldest ? sum + count : sum),
    0,
  );
}

function secondOf(ms: number): number {
  return Math.floor(ms / 1000);
}
