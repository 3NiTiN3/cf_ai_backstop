import type { UpstreamOutcome } from "./upstream";

export interface HealthSnapshot {
  requestCount: number;
  errorCount: number;
  errorRate: number;
  consecutiveFailures: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
}

interface Bucket {
  start: number;
  requests: number;
  errors: number;
  latencies: number[];
}

const BUCKET_MS = 10_000;
const WINDOW_MS = 60_000;
const MAX_LATENCY_SAMPLES_PER_BUCKET = 1000;

const FAILURES: ReadonlySet<UpstreamOutcome> = new Set([
  "server_error",
  "timeout",
  "network_error",
  "rate_limited",
]);

export function isHealthFailure(outcome: UpstreamOutcome): boolean {
  return FAILURES.has(outcome);
}

export function isUnavailable(outcome: UpstreamOutcome): boolean {
  return outcome === "circuit_open" || isHealthFailure(outcome);
}

export class HealthWindow {
  private buckets: Bucket[] = [];
  private consecutiveFailures = 0;

  constructor(private readonly now: () => number) {}

  record(outcome: UpstreamOutcome, latencyMs: number): void {
    const failed = isHealthFailure(outcome);
    this.consecutiveFailures = failed ? this.consecutiveFailures + 1 : 0;
    const bucket = this.currentBucket();
    bucket.requests += 1;
    if (failed) bucket.errors += 1;
    if (bucket.latencies.length < MAX_LATENCY_SAMPLES_PER_BUCKET) {
      bucket.latencies.push(latencyMs);
    }
  }

  reset(): void {
    this.buckets = [];
    this.consecutiveFailures = 0;
  }

  snapshot(): HealthSnapshot {
    const live = this.liveBuckets();
    const requestCount = sum(live.map((bucket) => bucket.requests));
    const errorCount = sum(live.map((bucket) => bucket.errors));
    const latencies = live
      .flatMap((bucket) => bucket.latencies)
      .sort((a, b) => a - b);
    return {
      requestCount,
      errorCount,
      errorRate: requestCount === 0 ? 0 : errorCount / requestCount,
      consecutiveFailures: this.consecutiveFailures,
      p50LatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
    };
  }

  private currentBucket(): Bucket {
    const start = Math.floor(this.now() / BUCKET_MS) * BUCKET_MS;
    this.buckets = this.liveBuckets();
    const existing = this.buckets.find((bucket) => bucket.start === start);
    if (existing) return existing;
    const created: Bucket = { start, requests: 0, errors: 0, latencies: [] };
    this.buckets.push(created);
    return created;
  }

  private liveBuckets(): Bucket[] {
    const oldestStart = this.now() - WINDOW_MS;
    return this.buckets.filter((bucket) => bucket.start > oldestStart);
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function percentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.max(rank, 1) - 1] ?? null;
}
