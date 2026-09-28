import { isUnavailable } from "./health";
import type { RepoSnapshot } from "./registry";
import type { RepoHealth } from "./repo-gateway";
import { RequestRate } from "./request-rate";
import type { GatewayRoute } from "./routes";
import { TrailingThrottle } from "./throttle";
import type { UpstreamOutcome } from "./upstream";
import { UpstreamHistory } from "./upstream-history";

const REPORT_INTERVAL_MS = 2000;

export interface ReportSource {
  route: () => GatewayRoute | null;
  health: () => RepoHealth;
  queueDepth: () => number;
}

export interface ReporterDeps {
  send: (snapshot: RepoSnapshot) => void;
  now: () => number;
}

export class RepoReporter {
  private readonly rate: RequestRate;
  private readonly history: UpstreamHistory;
  private readonly throttle: TrailingThrottle;

  constructor(
    private readonly source: ReportSource,
    private readonly deps: ReporterDeps,
  ) {
    this.rate = new RequestRate(deps.now);
    this.history = new UpstreamHistory(deps.now);
    this.throttle = new TrailingThrottle(
      REPORT_INTERVAL_MS,
      () => this.reportNow(),
      deps.now,
    );
  }

  countRequest(): void {
    this.rate.hit();
  }

  countUpstream(outcome: UpstreamOutcome): void {
    this.history.record(isUnavailable(outcome));
  }

  report(): void {
    this.throttle.trigger();
  }

  reportNow(): void {
    const route = this.source.route();
    if (!route) return;
    const { counters, lastEventAt, breaker, health } = this.source.health();
    this.deps.send({
      namespace: route.namespace,
      repoKey: route.repoKey,
      counters,
      lastEventAt,
      breaker: breaker.state,
      recentRequests: this.rate.recent(),
      queueDepth: this.source.queueDepth(),
      upstreamHistory: this.history.recent(),
      errorRate: health.errorRate,
      p95LatencyMs: health.p95LatencyMs,
    });
  }
}
