import type { HealthSnapshot } from "./health";

export const BREAKER_STATES = ["closed", "open", "half_open"] as const;

export type BreakerState = (typeof BREAKER_STATES)[number];

export const TRANSITION_REASONS = [
  "error_rate",
  "consecutive_failures",
  "rate_limited",
  "probe_failed",
  "probe_succeeded",
  "cooldown_elapsed",
] as const;

type TransitionReason = (typeof TRANSITION_REASONS)[number];

export interface Breaker {
  state: BreakerState;
  openUntil: number | null;
  openDurationMs: number;
  reason: TransitionReason | null;
  probeStartedAt: number | null;
}

export interface Transition {
  from: BreakerState;
  to: BreakerState;
  reason: TransitionReason;
  at: number;
}

export interface Step {
  breaker: Breaker;
  transition: Transition | null;
}

export interface Admission extends Step {
  allowed: boolean;
}

export interface ResultSignal {
  failed: boolean;
  rateLimitResetAt: number | null;
}

export const BASE_OPEN_MS = 30_000;
export const MAX_OPEN_MS = 5 * 60_000;
const MIN_REQUESTS_FOR_RATE = 10;
const ERROR_RATE_THRESHOLD = 0.5;
const CONSECUTIVE_FAILURE_THRESHOLD = 5;
// A probe whose result never arrived (for example the object was evicted) must not block recovery forever.
const PROBE_TIMEOUT_MS = 15_000;

export const INITIAL_BREAKER: Breaker = {
  state: "closed",
  openUntil: null,
  openDurationMs: BASE_OPEN_MS,
  reason: null,
  probeStartedAt: null,
};

export function admit(breaker: Breaker, now: number): Admission {
  if (breaker.state === "closed") {
    return { breaker, transition: null, allowed: true };
  }
  if (breaker.state === "open") {
    if (now < (breaker.openUntil ?? 0)) {
      return { breaker, transition: null, allowed: false };
    }
    return {
      ...moveTo(breaker, "half_open", "cooldown_elapsed", now, {
        openUntil: null,
        probeStartedAt: now,
      }),
      allowed: true,
    };
  }
  if (probeInFlight(breaker, now)) {
    return { breaker, transition: null, allowed: false };
  }
  return {
    breaker: { ...breaker, probeStartedAt: now },
    transition: null,
    allowed: true,
  };
}

export function observe(
  breaker: Breaker,
  signal: ResultSignal,
  health: HealthSnapshot,
  now: number,
): Step {
  if (breaker.state === "open") return { breaker, transition: null };
  if (signal.rateLimitResetAt !== null) {
    return open(breaker, "rate_limited", now, {
      openUntil: Math.max(signal.rateLimitResetAt, now),
    });
  }
  if (breaker.state === "half_open") return settleProbe(breaker, signal, now);
  const reason = signal.failed ? tripReason(health) : null;
  if (reason === null) return { breaker, transition: null };
  return open(breaker, reason, now, {
    openUntil: now + breaker.openDurationMs,
  });
}

export function retryAfterSeconds(breaker: Breaker, now: number): number {
  const until =
    breaker.state === "open"
      ? (breaker.openUntil ?? now)
      : (breaker.probeStartedAt ?? now) + PROBE_TIMEOUT_MS;
  return Math.max(1, Math.ceil((until - now) / 1000));
}

function settleProbe(
  breaker: Breaker,
  signal: ResultSignal,
  now: number,
): Step {
  if (!signal.failed) {
    return moveTo(breaker, "closed", "probe_succeeded", now, {
      openUntil: null,
      openDurationMs: BASE_OPEN_MS,
      probeStartedAt: null,
    });
  }
  const openDurationMs = Math.min(breaker.openDurationMs * 2, MAX_OPEN_MS);
  return open(breaker, "probe_failed", now, {
    openDurationMs,
    openUntil: now + openDurationMs,
  });
}

function tripReason(health: HealthSnapshot): TransitionReason | null {
  if (
    health.requestCount >= MIN_REQUESTS_FOR_RATE &&
    health.errorRate >= ERROR_RATE_THRESHOLD
  ) {
    return "error_rate";
  }
  if (health.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
    return "consecutive_failures";
  }
  return null;
}

function open(
  breaker: Breaker,
  reason: TransitionReason,
  now: number,
  changes: Partial<Breaker>,
): Step {
  return moveTo(breaker, "open", reason, now, {
    probeStartedAt: null,
    ...changes,
  });
}

function moveTo(
  breaker: Breaker,
  to: BreakerState,
  reason: TransitionReason,
  now: number,
  changes: Partial<Breaker>,
): Step {
  return {
    breaker: { ...breaker, ...changes, state: to, reason },
    transition: { from: breaker.state, to, reason, at: now },
  };
}

function probeInFlight(breaker: Breaker, now: number): boolean {
  return (
    breaker.probeStartedAt !== null &&
    now - breaker.probeStartedAt < PROBE_TIMEOUT_MS
  );
}
