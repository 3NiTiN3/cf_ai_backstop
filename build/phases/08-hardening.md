# Phase 8: Hardening

## Objective
Make it trustworthy: secure defaults, abuse protection on the public demo, strong tests, clean code and real numbers.

## Read first
- `build/VALIDATION.md` section 3 (Quality bar)
- Cloudflare docs: Workers rate limiting binding

## Tasks

### 8.1 Security review
- Walk every item in the Security part of the quality bar and check the code, not the intent.
- Also check: CORS policy on `/api/*` and `/mcp`, error responses never include stack traces or upstream headers that leak data, cache scope derivation cannot be bypassed with header casing or duplicate headers, admin token comparison is constant time, dev endpoints are off in production config.
- Fix each finding in this task. Record findings and fixes in DECISIONS.md.
- **Done when:** every security item is ticked with a pointer to the code or test that proves it.
- **Commit:** `fix(security): address security review findings`

### 8.2 Rate limiting
- Rate limit public demo endpoints (`/demo/gh/*`, `/api/demo/*`, `/api/chaos` for demo, the chat) per client IP using the Workers rate limiting binding. Sensible limits that still let one person play the story smoothly.
- Return 429 JSON with `Retry-After`.
- **Done when:** a test or scripted burst shows 429 after the limit. The outage story still runs cleanly for one user.
- **Commit:** `feat(security): rate limit public demo endpoints`

### 8.3 Test gaps
- Add tests for anything in the Correctness list of the quality bar that is not yet covered.
- Add an end-to-end style test that runs the core flow against the mock: reads, blackout, stale, queue, recovery, replay methods.
- **Done when:** every Correctness item points to a test. `npm run check` green.
- **Commit:** `test: cover correctness guarantees end to end`

### 8.4 Code quality pass
- Run `bash scripts/check-comments.sh --all` and remove comments that do not explain a non-obvious why.
- Remove dead code, unused exports and dependencies (`npx knip` if available, otherwise by hand).
- Split files over 250 lines where it improves clarity. Check naming consistency.
- **Done when:** no unused code, comment audit clean, `npm run check` green.
- **Commit:** `refactor: tidy modules, names and comments`

### 8.5 Benchmarks
- Run `scripts/simulate-agents.ts` with 20 agents for 60 seconds against the deployed demo namespace, three times. Also run 5 agents for 60 seconds against live public repos with a token, once.
- `docs/BENCHMARKS.md`: setup, raw numbers, median of runs, percent of upstream calls avoided, gateway latency on cache hit, and honest caveats (mock latency, small sample).
- **Done when:** demo runs show 60% or more avoided, or DECISIONS.md explains why not and what was changed.
- **Commit:** `docs: add benchmark results`

## Phase exit gate
- Every item in VALIDATION.md section 3 is ticked.
- `npm run check` green, evals still 85% or higher.
- Deploy (ask first). Story runs cleanly on the deployed URL.
