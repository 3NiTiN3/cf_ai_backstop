export interface Coalesced<T> {
  promise: Promise<T>;
  shared: boolean;
}

export class Coalescer<T> {
  private readonly inflight = new Map<string, Promise<T>>();

  run(key: string, task: () => Promise<T>): Coalesced<T> {
    const existing = this.inflight.get(key);
    if (existing) return { promise: existing, shared: true };
    const promise = task().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return { promise, shared: false };
  }
}
