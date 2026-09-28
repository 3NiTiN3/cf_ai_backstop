# Phase 6: Demo traffic and the outage story

## Objective
A reviewer presses one button and watches the whole story play out on the deployed site without running anything locally.

## Read first
- Cloudflare docs: Durable Object alarms
- `src/gateway/registry.ts`, `src/gateway/repo-gateway.ts`

## Tasks

### 6.1 Server-side simulated agents
- `POST /api/demo/traffic/start` with `{ agents: 1..20, durationSeconds: 10..180 }`. `POST /api/demo/traffic/stop`.
- Registry drives it with an alarm every second. Each tick, each simulated agent sends a few requests to demo repos by calling RepoGateway directly (no public fetch).
- Realistic mix: about 70% reads of a small hot set (so caching matters), 20% list endpoints, 10% queueable writes with idempotency keys.
- Only one run at a time. Hard stop at the duration. Demo namespace only.
- **Done when:** tests cover start, single-run guard and auto stop (alarm with fake clock or direct tick calls). Manual: dashboard shows traffic.
- **Commit:** `feat(demo): add server-side simulated agent traffic`

### 6.2 Outage story scenario
- `POST /api/demo/story` runs a scripted timeline on Registry alarms: 20 s normal traffic, 30 s blackout, chaos off, traffic continues until the queue drains or 40 s pass, then stop.
- `GET /api/demo/story` returns the current step so the UI can show progress.
- UI: a prominent "Play the outage story" button with a step indicator (Normal, Outage, Recovery, Replayed) and a one-line caption per step explaining what to watch.
- **Done when:** the full story completes locally with the breaker opening and closing, writes queued and drained, and an incident summary produced.
- **Commit:** `feat(demo): add one-click outage story`

### 6.3 CLI simulator
- `scripts/simulate-agents.ts`: runs N agents against any base URL for a duration. Works for demo, and for live with `GITHUB_TOKEN` from the environment against real public repos (keep request rates polite).
- Prints a summary: requests, cache hits, revalidated, coalesced, stale, queued, upstream calls, percent avoided, p50 and p95 gateway latency.
- **Done when:** a local run against the demo namespace prints the summary.
- **Commit:** `feat(demo): add CLI agent simulator with summary report`

## Phase exit gate
- On the deployed URL, "Play the outage story" completes end to end in under 90 seconds and the chat can explain it afterwards.
- Deploy (ask first).
