# Phase 3: Write queue and replay Workflow

## Objective
Safe writes do not fail during an outage. They are queued with idempotency keys and replayed in order by a Cloudflare Workflow when GitHub recovers. Unsafe writes fail fast with a clear explanation.

## Read first
- Cloudflare docs: Workflows (`WorkflowEntrypoint`, `step.do` retries and backoff, `NonRetryableError`, bindings, creating instances, instance status), Web Crypto AES-GCM in Workers
- `src/gateway/repo-gateway.ts`, `src/gateway/breaker.ts`

## Design notes
- Ordering is per repo. A retryable failure stops the batch so later writes do not overtake earlier ones.
- Tokens needed for replay are encrypted with AES-GCM using a `QUEUE_ENCRYPTION_KEY` secret and deleted once the write is done or dropped. The demo namespace needs no token.

## Tasks

### 3.1 Write classification
- `src/gateway/write-policy.ts`: an allowlist of queueable writes:
  - `POST /repos/{o}/{r}/issues`
  - `POST /repos/{o}/{r}/issues/{n}/comments`
  - `POST /repos/{o}/{r}/issues/{n}/labels`
  - `POST /repos/{o}/{r}/statuses/{sha}`
  - `POST /repos/{o}/{r}/pulls/{n}/reviews` with event `COMMENT` only
- Everything else is pass-through. While degraded, non-queueable writes return 503 JSON `{ "error": "write_not_queueable", "reason": ... }` with a short reason (ordering or side effects are unsafe to delay).
- **Done when:** table-driven tests cover allowed, disallowed and edge cases.
- **Commit:** `feat(queue): classify queueable GitHub writes`

### 3.2 Queue storage and enqueue
- SQLite table `write_queue (id TEXT PRIMARY KEY, seq INT, idempotency_key TEXT UNIQUE, method TEXT, path TEXT, body TEXT, token_ciphertext TEXT, token_iv TEXT, status TEXT, attempts INT, last_error TEXT, result_status INT, created_at INT, updated_at INT)`.
- Status values: `pending`, `in_flight`, `done`, `failed`, `dropped`.
- Idempotency key from the `Idempotency-Key` header, or SHA-256 of method, path, body and scope. A duplicate key returns the existing record instead of enqueuing again.
- When the breaker is open, or an allowed write fails with a retryable outcome, enqueue and return 202 `{ queued: true, id, position }` with `x-backstop-queued: <id>`.
- `src/security/crypto.ts`: encrypt and decrypt helpers. Add `QUEUE_ENCRYPTION_KEY` to `.dev.vars.example` and ask the user to set the secret.
- **Done when:** tests cover enqueue on open breaker, enqueue on retryable failure, idempotent duplicates, encryption round trip, token deleted on completion.
- **Commit:** `feat(queue): queue safe writes with idempotency and encrypted tokens`

### 3.3 ReplayWorkflow
- `src/workflows/replay.ts`: `ReplayWorkflow extends WorkflowEntrypoint` with params `{ namespace, repoKey }`. Add the `workflows` binding in `wrangler.jsonc`.
- Loop: `step.do("claim batch")` asks RepoGateway (RPC) for up to 10 pending writes in seq order and marks them in flight. For each, `step.do("send <id>", { retries: { limit: 5, delay: "10 seconds", backoff: "exponential" }, timeout: "30 seconds" })` asks RepoGateway to send it upstream (so chaos and breaker apply) and marks it done.
- Non-retryable 4xx: mark `failed`, record the error, throw `NonRetryableError` for that step, continue with the next write.
- Retryable failure after retries: return writes to `pending` and end the run. The next breaker close starts a new run.
- Repeat until no pending writes remain.
- **Done when:** RepoGateway's queue methods are unit tested. A manual integration run with `wrangler dev` replays a queue of 5 demo writes in order (note the steps you ran in DECISIONS.md if the test pool cannot run Workflows).
- **Commit:** `feat(workflow): replay queued writes in order with retries`

### 3.4 Replay triggers
- When the breaker closes and pending writes exist, RepoGateway creates a `ReplayWorkflow` instance and stores its id. It does not start a second instance while one is running (check instance status).
- `POST /api/repos/:namespace/:owner/:repo/replay` triggers manually (admin for live).
- Pause and resume flag for writes: while paused, writes are queued even if healthy and replay does not start.
- **Done when:** tests cover single-instance guard and pause behaviour. Manual check: blackout, queue 3 comments on demo, turn chaos off, queue drains.
- **Commit:** `feat(workflow): trigger replay on recovery with single-run guard`

### 3.5 Queue API
- `GET /api/repos/:namespace/:owner/:repo/queue` lists items without bodies or tokens.
- `POST .../queue/:id/retry` moves a failed item back to pending. `POST .../queue/:id/drop` drops it and deletes its token. Admin required for live.
- **Done when:** tests cover list redaction, retry, drop, auth.
- **Commit:** `feat(api): add queue inspection and control endpoints`

## Phase exit gate
- Demo: blackout, post 5 comments (all 202 queued), post a merge request (503 not queueable), chaos off, Workflow drains the 5 comments in order, queue empty.
- The same idempotency key sent twice produces one comment.
- Deploy (ask first), set secrets, repeat on the deployed URL.
