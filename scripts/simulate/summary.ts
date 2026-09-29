export interface Sample {
  status: number;
  cache: string | null;
  coalesced: boolean;
  latencyMs: number;
}

export interface Summary {
  requests: number;
  hits: number;
  revalidated: number;
  coalesced: number;
  stale: number;
  queued: number;
  upstreamCalls: number;
  rateLimited: number;
  failed: number;
  avoidedPercent: number;
  p50Ms: number | null;
  p95Ms: number | null;
  hitP50Ms: number | null;
  hitP95Ms: number | null;
}

const UPSTREAM = new Set(["MISS", "REVALIDATED", "BYPASS"]);

export function summarize(samples: Sample[]): Summary {
  const count = (test: (sample: Sample) => boolean) =>
    samples.filter(test).length;
  const coalesced = count((sample) => sample.coalesced);
  const hits = count((sample) => !sample.coalesced && sample.cache === "HIT");
  const stale = count((sample) => sample.cache === "STALE");
  const queued = count((sample) => sample.cache === "QUEUED");
  const failed = count(
    (sample) => sample.status >= 500 && !servedFromGateway(sample),
  );
  const rateLimited = count((sample) => sample.status === 429);
  const upstreamCalls = count(
    (sample) =>
      !sample.coalesced &&
      sample.status < 500 &&
      sample.status !== 429 &&
      (sample.cache === null || UPSTREAM.has(sample.cache)),
  );
  const avoided = hits + coalesced + stale;
  const latencies = sortedLatencies(samples);
  const hitLatencies = sortedLatencies(
    samples.filter((sample) => !sample.coalesced && sample.cache === "HIT"),
  );
  return {
    requests: samples.length,
    hits,
    revalidated: count(
      (sample) => !sample.coalesced && sample.cache === "REVALIDATED",
    ),
    coalesced,
    stale,
    queued,
    upstreamCalls,
    rateLimited,
    failed,
    avoidedPercent:
      avoided + upstreamCalls === 0
        ? 0
        : Math.round((avoided / (avoided + upstreamCalls)) * 1000) / 10,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    hitP50Ms: percentile(hitLatencies, 0.5),
    hitP95Ms: percentile(hitLatencies, 0.95),
  };
}

export function formatSummary(summary: Summary): string {
  const rows: [string, string][] = [
    ["Requests", String(summary.requests)],
    ["Cache hits", String(summary.hits)],
    ["Revalidated", String(summary.revalidated)],
    ["Coalesced", String(summary.coalesced)],
    ["Served stale", String(summary.stale)],
    ["Queued writes", String(summary.queued)],
    ["Upstream calls", String(summary.upstreamCalls)],
    ["Rate limited", String(summary.rateLimited)],
    ["Failed", String(summary.failed)],
    ["Upstream calls avoided", `${summary.avoidedPercent}%`],
    ["Gateway latency p50", milliseconds(summary.p50Ms)],
    ["Gateway latency p95", milliseconds(summary.p95Ms)],
    ["Cache hit latency p50", milliseconds(summary.hitP50Ms)],
    ["Cache hit latency p95", milliseconds(summary.hitP95Ms)],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows
    .map(([label, value]) => `${label.padEnd(width)}  ${value}`)
    .join("\n");
}

function sortedLatencies(samples: Sample[]): number[] {
  return samples.map((sample) => sample.latencyMs).sort((a, b) => a - b);
}

function servedFromGateway(sample: Sample): boolean {
  return sample.cache === "STALE" || sample.cache === "QUEUED";
}

function percentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.max(Math.ceil(fraction * sorted.length), 1);
  return sorted[rank - 1] ?? null;
}

function milliseconds(value: number | null): string {
  return value === null ? "-" : `${Math.round(value)} ms`;
}
