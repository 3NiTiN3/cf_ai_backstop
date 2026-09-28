import type { ChaosConfig } from "../gateway/chaos";
import type { GatewayEvent } from "../gateway/events";
import type { RepoIncident } from "../gateway/incident-query";
import type { QueueListing } from "../gateway/queue-control";
import type { Overview } from "../gateway/registry";
import type { RepoHealth } from "../gateway/repo-gateway";

export const MAX_ROWS = 20;

export function overviewView(overview: Overview, chaos: ChaosConfig) {
  const { totals } = overview;
  return {
    namespace: overview.namespace,
    chaos: chaosView(chaos),
    totals: {
      requests: totals.requests,
      cacheHits: totals.hits,
      coalesced: totals.coalesced,
      upstreamCalls: totals.upstream_calls,
      upstreamAvoided: totals.upstream_avoided,
      upstreamAvoidedPercent: percent(totals.avoidedRatio),
    },
    repoCount: overview.repos.length,
    repos: overview.repos.slice(0, MAX_ROWS).map((repo) => ({
      repo: repo.repoKey,
      breaker: repo.breaker,
      requests: repo.requests,
      cacheHits: repo.hits,
      upstreamCalls: repo.upstream_calls,
      lastEventAt: isoOrNull(repo.lastEventAt),
    })),
  };
}

export function chaosView(chaos: ChaosConfig) {
  return {
    mode: chaos.mode,
    ...(chaos.mode === "errors"
      ? { errorRatePercent: percent(chaos.errorRate) }
      : {}),
    ...(chaos.mode === "latency" ? { latencyMs: chaos.latencyMs } : {}),
  };
}

export function healthView(health: RepoHealth) {
  const { breaker, health: window, counters } = health;
  return {
    mode: health.mode,
    breaker: {
      state: breaker.state,
      reason: breaker.reason,
      openUntil: isoOrNull(breaker.openUntil),
    },
    lastMinute: {
      upstreamRequests: window.requestCount,
      upstreamErrors: window.errorCount,
      errorRatePercent: percent(window.errorRate),
      consecutiveFailures: window.consecutiveFailures,
      p50LatencyMs: window.p50LatencyMs,
      p95LatencyMs: window.p95LatencyMs,
    },
    totals: {
      requests: counters.requests,
      cacheHits: counters.hits,
      coalesced: counters.coalesced,
      upstreamCalls: counters.upstream_calls,
      upstreamAvoided: counters.upstream_avoided,
    },
    writesPaused: health.writesPaused,
    lastEventAt: isoOrNull(health.lastEventAt),
  };
}

export function queueView(listing: QueueListing) {
  return {
    counts: listing.counts,
    shown: Math.min(listing.items.length, MAX_ROWS),
    items: listing.items.slice(0, MAX_ROWS).map((item) => ({
      id: item.id,
      method: item.method,
      path: item.path,
      status: item.status,
      attempts: item.attempts,
      lastError: item.lastError,
      resultStatus: item.resultStatus,
      queuedAt: new Date(item.createdAt).toISOString(),
    })),
  };
}

export function eventView(event: GatewayEvent) {
  return {
    at: new Date(event.ts).toISOString(),
    kind: event.kind,
    ...(event.method ? { method: event.method, path: event.path } : {}),
    ...(event.status ? { status: event.status } : {}),
    ...(event.cache !== "NONE" ? { cache: event.cache } : {}),
    ...(event.detail ? { detail: event.detail } : {}),
  };
}

export function incidentView(
  incident: RepoIncident,
  lastSeenAt: number | null,
) {
  return {
    repo: incident.repo,
    startedAt: new Date(incident.startedAt).toISOString(),
    endedAt: isoOrNull(incident.endedAt),
    ongoing: incident.endedAt === null,
    peakErrorRatePercent: percent(incident.peakErrorRate),
    readsServedStale: incident.readsServedStale,
    writesQueued: incident.writesQueued,
    writesReplayed: incident.writesReplayed,
    summary: incident.summary,
    newSinceLastSeen:
      lastSeenAt === null || incidentTime(incident) > lastSeenAt,
  };
}

export function incidentTime(incident: RepoIncident): number {
  return incident.endedAt ?? incident.startedAt;
}

function percent(ratio: number): number {
  return Math.round(ratio * 1000) / 10;
}

function isoOrNull(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}
