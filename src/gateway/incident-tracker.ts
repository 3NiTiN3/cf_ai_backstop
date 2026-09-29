import type { Transition } from "./breaker";
import type { GatewayEvent } from "./events";
import { summarizeIncident, type Generate } from "./incident-summary";
import { IncidentLog, type ClosedIncident, type Incident } from "./incidents";

export interface IncidentTrackerDeps {
  sql: SqlStorage;
  errorRate: () => number;
  waitingWrites: () => string[];
  repo: () => string | null;
  generate: Generate;
  waitUntil: (promise: Promise<unknown>) => void;
}

export class IncidentTracker {
  private readonly log: IncidentLog;

  constructor(private readonly deps: IncidentTrackerDeps) {
    this.log = new IncidentLog(deps.sql);
  }

  onTransition(transition: Transition): void {
    if (transition.to === "open") {
      this.log.open(
        transition.at,
        this.deps.errorRate(),
        this.deps.waitingWrites(),
      );
    }
    if (transition.to === "closed") {
      const closed = this.log.close(transition.at);
      if (closed) this.summarize(closed);
    }
  }

  observe(event: GatewayEvent): void {
    this.log.observe(event, this.deps.errorRate(), this.deps.waitingWrites);
  }

  list(limit: number): Incident[] {
    return this.log.list(limit);
  }

  private summarize(incident: ClosedIncident): void {
    this.deps.waitUntil(
      summarizeIncident(incident, this.deps.repo(), this.deps.generate).then(
        (summary) => this.log.setSummary(incident.id, summary),
      ),
    );
  }
}
