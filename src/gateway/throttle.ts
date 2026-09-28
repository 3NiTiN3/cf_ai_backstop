export class TrailingThrottle {
  private lastRun = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly intervalMs: number,
    private readonly run: () => void,
    private readonly now: () => number = Date.now,
  ) {}

  trigger(): void {
    if (this.timer) return;
    const wait = this.lastRun + this.intervalMs - this.now();
    if (wait <= 0) {
      this.fire();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fire();
    }, wait);
  }

  private fire(): void {
    this.lastRun = this.now();
    this.run();
  }
}
