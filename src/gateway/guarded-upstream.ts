import {
  BASE_OPEN_MS,
  admit,
  observe,
  retryAfterSeconds,
  type Breaker,
  type Step,
  type Transition,
} from "./breaker";
import type { BreakerStore } from "./breaker-store";
import type { HealthWindow } from "./health";
import { signalOf } from "./rate-limit";
import { unavailableBody } from "./responses";
import type { Namespace } from "./routes";
import type { UpstreamResult } from "./upstream";

export type GatewayMode = "normal" | "degraded";

export interface GuardDeps {
  now: () => number;
  fetch: (namespace: Namespace, request: Request) => Promise<UpstreamResult>;
  onTransition: (transition: Transition) => void;
}

export class GuardedUpstream {
  private breaker: Breaker;

  constructor(
    private readonly store: BreakerStore,
    private readonly health: HealthWindow,
    private readonly deps: GuardDeps,
  ) {
    this.breaker = store.load();
  }

  async call(namespace: Namespace, request: Request): Promise<UpstreamResult> {
    const admission = admit(this.breaker, this.deps.now());
    this.apply(admission);
    if (!admission.allowed) {
      return shortCircuit(retryAfterSeconds(this.breaker, this.deps.now()));
    }
    const result = await this.deps.fetch(namespace, request);
    this.health.record(result.outcome, result.latencyMs);
    const now = this.deps.now();
    this.apply(
      observe(
        this.breaker,
        signalOf(result, now, BASE_OPEN_MS),
        this.health.snapshot(),
        now,
      ),
    );
    return result;
  }

  state(): Breaker {
    return this.breaker;
  }

  mode(): GatewayMode {
    return this.breaker.state === "closed" ? "normal" : "degraded";
  }

  private apply(step: Step): void {
    if (step.breaker === this.breaker) return;
    this.breaker = step.breaker;
    this.store.save(step.breaker);
    if (step.transition === null) return;
    // Old failures would otherwise trip the breaker again right after it closes.
    if (step.transition.to === "closed") this.health.reset();
    this.deps.onTransition(step.transition);
  }
}

function shortCircuit(retryAfter: number): UpstreamResult {
  return {
    status: 503,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retryAfter),
    },
    body: unavailableBody(retryAfter),
    etag: null,
    lastModified: null,
    latencyMs: 0,
    outcome: "circuit_open",
  };
}
