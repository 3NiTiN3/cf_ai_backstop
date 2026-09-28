import type { ResultSignal } from "./breaker";
import { isHealthFailure } from "./health";
import type { UpstreamResult } from "./upstream";

export function signalOf(
  result: UpstreamResult,
  now: number,
  fallbackMs: number,
): ResultSignal {
  return {
    failed: isHealthFailure(result.outcome),
    rateLimitResetAt: isRateLimited(result)
      ? (resetAt(result.headers, now) ?? now + fallbackMs)
      : null,
  };
}

function isRateLimited(result: UpstreamResult): boolean {
  return (
    result.status === 429 ||
    result.outcome === "rate_limited" ||
    "retry-after" in result.headers ||
    result.headers["x-ratelimit-remaining"] === "0"
  );
}

function resetAt(headers: Record<string, string>, now: number): number | null {
  const retryAfter = headers["retry-after"];
  if (retryAfter !== undefined) {
    const seconds = Number(retryAfter);
    if (retryAfter.trim() !== "" && Number.isFinite(seconds)) {
      return now + seconds * 1000;
    }
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return date;
  }
  const reset = Number(headers["x-ratelimit-reset"]);
  return Number.isFinite(reset) && reset > 0 ? reset * 1000 : null;
}
