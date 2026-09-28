# Phase 2: Circuit breaker and chaos

## Objective
Each repo gateway knows when GitHub is unhealthy, stops hammering it, serves stale reads with honest headers, and recovers on its own. Anyone can simulate an outage on the demo namespace. Live namespace controls need an admin token.

## Read first
- `src/gateway/repo-gateway.ts`, `src/gateway/upstream.ts`
- GitHub docs: rate limits, `retry-after`, `x-ratelimit-remaining`, `x-ratelimit-reset`

## Design notes
- All time-based logic takes an injected `now()` so tests use a fake clock.
- Breaker lives in `src/gateway/breaker.ts` as a pure state machine; RepoGateway persists its state.

## Tasks

### 2.1 Health window
- `src/gateway/health.ts`: record each upstream outcome into 10 second buckets covering the last 60 seconds.
- Expose `errorRate`, `requestCount`, `consecutiveFailures`, `p50LatencyMs`, `p95LatencyMs`.
- Errors are `server_error`, `timeout`, `network_error`, `rate_limited`. `client_error` is not a health failure.
- **Done when:** tests with a fake clock cover bucket rollover, rates and percentiles.
- **Commit:** `feat(breaker): add rolling upstream health window`

### 2.2 Circuit breaker
- States `closed`, `open`, `half_open`.
- Open when the window has at least 10 requests and an error rate of 50% or more, or after 5 consecutive failures.
- Open for 30 seconds, then half-open and allow a single probe. Probe success closes. Probe failure reopens with the open duration doubled, capped at 5 minutes. Closing resets the duration.
- Rate limit signals: a 429, a `retry-after`, or `x-ratelimit-remaining: 0` open the breaker until the reset time.
- Persist state in SQLite. Every transition writes an event and reports to Registry.
- Response header `x-backstop-mode: normal | degraded`.
- **Done when:** tests cover every transition including rate limit reset and backoff cap.
- **Commit:** `feat(breaker): add per-repo circuit breaker with backoff`

### 2.3 Degraded reads
- When the breaker is open, or the upstream call fails, serve the cached entry even if expired, with `x-backstop-cache: STALE`, an `Age` header and `x-backstop-mode: degraded`.
- No cached entry: return 503 JSON `{ "error": "upstream_unavailable", "retryAfterSeconds": n }` with a `Retry-After` header. Agents back off instead of retrying immediately.
- **Done when:** tests cover stale hit while open, stale on upstream failure while closed, 503 with Retry-After when nothing is cached.
- **Commit:** `feat(gateway): serve stale reads when upstream is unhealthy`

### 2.4 Chaos injection
- Chaos config per namespace, stored in Registry: `{ mode: "off" | "errors" | "latency" | "blackout", errorRate: 0..1, latencyMs }`.
- The upstream client applies it before calling upstream: `errors` returns synthetic 502s at the given rate, `latency` adds delay, `blackout` fails every call as a network error.
- RepoGateway reads the config from Registry with a 2 second in-memory cache.
- Chaos events are recorded so the timeline shows when chaos started and ended.
- **Done when:** tests show each mode and that the breaker opens under blackout and closes after chaos is turned off.
- **Commit:** `feat(chaos): add per-namespace fault injection`

### 2.5 Admin API and validation
- `ADMIN_TOKEN` secret. Add `.dev.vars.example` with placeholder values only. Ask the user to create `.dev.vars` and to run `npx wrangler secret put ADMIN_TOKEN` before the next deploy.
- `POST /api/chaos` with zod-validated body `{ namespace, mode, errorRate?, latencyMs? }`. Demo namespace is open. Live requires `Authorization: Bearer <ADMIN_TOKEN>`, compared in constant time.
- `GET /api/chaos?namespace=`. `GET /api/repos/:namespace/:owner/:repo` returns health, breaker state and stats.
- Body size limit of 16 KB on `/api/*`.
- **Done when:** tests cover auth on live, open demo, validation failures returning 400 with a clear message.
- **Commit:** `feat(api): add chaos and repo health endpoints with admin auth`

## Phase exit gate
- Demo: turn on blackout, request a cached path (STALE), request an uncached path (503 with Retry-After), watch the breaker open. Turn chaos off, wait, the breaker half-opens and closes.
- Live chaos without the token returns 401.
- Deploy (ask first) and repeat the demo steps on the deployed URL.
