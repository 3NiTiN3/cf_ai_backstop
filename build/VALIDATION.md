# Validation

Four levels of checks. Lower levels run more often. Nothing is committed that fails the task gate.

## 1. Task gate (every task, before committing)

Run in this order and fix anything that fails.

- [ ] The task's own "Done when" checks in its phase file all pass.
- [ ] `npm run check` passes (typecheck, lint, tests). From phase 0 task 0.5 onwards.
- [ ] New logic has tests, or the task says why it cannot be unit tested and how it was checked instead.
- [ ] `git diff --cached` reviewed by you before committing:
  - [ ] only files related to this task
  - [ ] no secrets, tokens, `.dev.vars`, `.env`
  - [ ] no debug output left behind (`console.log` used for debugging, temporary files)
  - [ ] no comments that break the comment rules in `CLAUDE.md`
  - [ ] no dead code, no unused exports
- [ ] PROGRESS.md updated in the same commit.
- [ ] Commit message follows the format in ORCHESTRATOR.md with no attribution.

The git hooks enforce part of this automatically:
- `pre-commit` blocks secrets, secret files, TODO/FIXME comments, banner comments, commented-out code, AI mentions in comments and em dashes in markdown. It warns when a file adds a high share of comment lines.
- `commit-msg` strips attribution lines, blocks em dashes and enforces the Conventional Commits subject.

## 2. Phase gate (end of every phase)

- [ ] Every task in the phase is ticked and committed.
- [ ] The phase file's exit gate checks all pass.
- [ ] `npm run check` passes on a clean tree (`git status` shows nothing to commit).
- [ ] `bash scripts/check-comments.sh --all` reviewed. Remove any comment that restates the code.
- [ ] `npm run dev` starts without errors or warnings you have not explained in DECISIONS.md.
- [ ] If the phase deploys: the deployed URL works and the phase's smoke test passes there, not only locally.
- [ ] Nothing from a later phase was built early.
- [ ] PROGRESS.md shows the phase complete.

## 3. Quality bar (checked in phase 8, kept true afterwards)

### Correctness
- [ ] Cache never serves one token's private data to another token or to anonymous callers.
- [ ] Only GET responses with status 200 are cached. Never cache responses to authenticated requests under the public scope.
- [ ] Breaker transitions are covered by tests with an injected clock.
- [ ] Queued writes replay in enqueue order per repo, exactly once per idempotency key.
- [ ] Non-retryable upstream errors (4xx other than 408 and 429) are not retried.

### Security
- [ ] Tokens are never logged, never returned, and only stored encrypted (AES-GCM) for pending writes, then deleted once the write completes or is dropped.
- [ ] Admin actions on the live namespace require `ADMIN_TOKEN`. Demo namespace actions are rate limited.
- [ ] All `/api/*` input validated with zod. Request bodies have a size limit.
- [ ] Dev-only endpoints are disabled unless `ENVIRONMENT` is `dev`.

### Code
- [ ] No `any`, no `@ts-ignore`, no unused dependencies.
- [ ] Files mostly under 250 lines, functions small, names explain intent.
- [ ] Comments only where they explain a non-obvious why.

### AI
- [ ] The ops agent answers only from tool results. It says so when it does not know.
- [ ] Destructive tools (chaos, pause, replay on live) require confirmation in the UI.
- [ ] Tool-selection evals pass at 85% or higher and results are committed in `evals/results.md`.
- [ ] Incident summaries use deterministic facts. The LLM only phrases them. A template fallback exists when the model fails.

## 4. Final acceptance (phase 9)

Run all of these against the **deployed** URL.

### Assignment requirements
- [ ] Repository name starts with `cf_ai_`.
- [ ] LLM: Workers AI Llama 3.3 in use for chat and summaries.
- [ ] Workflow: `ReplayWorkflow` drains a real queue during the demo.
- [ ] Chat input works on the deployed site.
- [ ] Memory: chat history persists across reloads, watched repos persist, incidents persist.
- [ ] README has project description, architecture, local run instructions, deploy instructions and the deployed link.
- [ ] PROMPTS.md exists and contains the prompt history.

### Demo script (a reviewer's first 90 seconds)
- [ ] Open the site. Dashboard loads with no console errors.
- [ ] Press "Play the outage story". Traffic starts, cache hit rate climbs.
- [ ] Blackout starts. Breaker opens. Reads show as STALE, writes show as QUEUED. No 5xx storm.
- [ ] Recovery. Breaker half-opens then closes. Workflow drains the queue. Queue reaches zero.
- [ ] Incident summary appears.
- [ ] Ask the chat "what just happened?" Answer is accurate and cites numbers that match the dashboard.

### Success criteria from GOAL.md
- [ ] At least 60% upstream calls avoided with 20 simulated agents, recorded in `docs/BENCHMARKS.md`.
- [ ] Claude Code connects to `/mcp` and completes a `github_read`.
- [ ] Evals at 85% or higher.

### Repo hygiene
- [ ] `git log` shows one commit per task, Conventional Commits, no attribution lines anywhere:
      `git log --format=%B | grep -iE "co-authored|claude|anthropic|generated with"` returns nothing.
- [ ] No secrets in history: `git log -p | grep -E "ghp_|github_pat_"` returns nothing.
- [ ] README reads naturally, no em dashes, no hype.
