# Orchestrator

You are building Backstop from idea to finished product by working through a fixed sequence of phases. This file is the operating manual. Follow it literally.

## Files in the build system

| File | Purpose | Who edits it |
| --- | --- | --- |
| `build/GOAL.md` | What we are building and why, success criteria | Only with user approval |
| `build/ORCHESTRATOR.md` | This manual | Only with user approval |
| `build/phases/NN-*.md` | Tasks for each phase, with acceptance checks | Only with user approval |
| `build/VALIDATION.md` | Gates that every task, phase and the final product must pass | Only with user approval |
| `build/PROGRESS.md` | Current state: mode, phase, checklist, blockers, deploy URL | You, after every task |
| `build/DECISIONS.md` | Short log of technical decisions and deviations from the plan | You, when a decision is made |
| `CLAUDE.md` | Hard rules for code, commits and writing | Only with user approval |

## Phase index

| # | File | Outcome |
| --- | --- | --- |
| 0 | `phases/00-bootstrap.md` | Scaffolded, Workers AI chat working, tooling green, first deploy |
| 1 | `phases/01-read-path.md` | Gateway proxies, caches, revalidates and coalesces reads |
| 2 | `phases/02-breaker-and-chaos.md` | Circuit breaker, stale serving, fault injection |
| 3 | `phases/03-write-queue-workflow.md` | Safe writes queued and replayed by a Workflow |
| 4 | `phases/04-ops-agent.md` | Chat agent with tools, memory, incident summaries, evals |
| 5 | `phases/05-dashboard.md` | Live dashboard next to the chat |
| 6 | `phases/06-demo-traffic.md` | Simulated agents and the one-click outage story |
| 7 | `phases/07-mcp.md` | MCP server usable from Claude Code |
| 8 | `phases/08-hardening.md` | Security, rate limits, tests, quality pass, benchmarks |
| 9 | `phases/09-docs-and-submission.md` | README, PROMPTS.md, final deploy, public repo |

## The loop

Run this loop for every task. Do not skip steps.

1. **Orient.** Read `build/PROGRESS.md`. Find the first unchecked task. If there are open blockers, stop and raise them with the user instead.
2. **Load context.** Read the phase file for that task. Read only the source files the task touches plus anything it lists under "Read first". Do not re-read the whole repo.
3. **Plan briefly.** State in two or three lines what you will change. If the task is ambiguous, or you think the plan is wrong, stop and ask. Do not invent scope.
4. **Implement.** Do exactly the task. Nothing from later tasks. Follow every rule in `CLAUDE.md`.
5. **Validate.** Run the task's "Done when" checks, then the task gate in `build/VALIDATION.md`. Fix failures. Up to three fix attempts per failure, then treat it as blocked (see below).
6. **Record.** Tick the task in `build/PROGRESS.md`, update "Current" and "Last commit". If you made a real decision or deviated from the plan, add an entry to `build/DECISIONS.md`.
7. **Commit.** Stage the task's changes together with the PROGRESS.md update and make exactly one commit using the format below.
8. **Report.** Tell the user in at most three short lines: task done, commit subject, what is next.
9. **Continue or pause** according to the mode in PROGRESS.md.

## Modes

Set in `build/PROGRESS.md` under `Mode`.

- `task`: stop after every task and wait for the user.
- `phase` (default): run tasks back to back, stop at the end of each phase after the phase exit gate.
- `auto`: keep going across phases. Still stop for blockers, approvals and user actions.

Regardless of mode, always stop and ask before:
- the first `wrangler deploy` of each phase that deploys,
- creating or pushing to a GitHub remote,
- adding a dependency that the plan does not name,
- changing GOAL, ORCHESTRATOR, a phase file, VALIDATION or CLAUDE.md,
- anything that needs the user's hands (logging in, secrets, screenshots).

## End of a phase

When the last task in a phase is committed:

1. Run the phase exit gate from the phase file and the phase gate in `build/VALIDATION.md`.
2. If a check fails, fix it with a `fix(...)` commit. That fix is its own commit with `Task: <phase>.gate`.
3. Mark the phase complete in PROGRESS.md, set Current to the next phase's first task, and commit with `chore(build): complete phase N` and `Task: N.gate`.
4. Give the user a short phase summary: what works now, how to see it, anything they should try.
5. Suggest they run `/clear` before the next phase. All state lives in the repo, so a fresh context loses nothing and keeps quality high.

## Commit format

```
type(scope): imperative subject under 72 chars

- concrete change one
- concrete change two
- tests added or updated

Task: 1.4
```

- Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`.
- Scopes used in this project: `gateway`, `cache`, `breaker`, `chaos`, `queue`, `workflow`, `agent`, `ai`, `ui`, `demo`, `mcp`, `api`, `security`, `evals`, `docs`, `build`.
- No attribution lines of any kind. No emoji. No mention of Claude, Anthropic or AI tools. The `commit-msg` hook strips attribution anyway, but do not rely on it; write clean messages.
- Use a heredoc or `-F` with a temp file for multi-line messages so formatting survives.

## When blocked

A task is blocked when three honest attempts fail, when something needs the user, or when the plan conflicts with reality (for example an API in the plan no longer exists).

1. Do not commit broken code. Stash or revert the partial work if it would break `npm run check`.
2. Add the blocker to the "Blockers" section of PROGRESS.md: task id, what failed, what you tried, what you need.
3. Tell the user plainly and propose one or two ways forward. Wait.

## Deviating from the plan

The plan is a strong default, not scripture. If you find a clearly better approach (simpler, safer, or required by the current platform APIs):

1. Explain the change and why in a few lines and ask the user.
2. If approved, record it in DECISIONS.md and update the affected phase file in a separate `docs(build): ...` commit before implementing.

## Context hygiene

- Keep each task small. If a task grows past roughly 400 changed lines, split it: finish a coherent slice, commit it as `Task: 1.4a`, and continue with `1.4b`. Record the split in PROGRESS.md.
- Prefer reading specific files over broad searches.
- The prompt history for the submission is exported from Claude Code transcripts at the end (phase 9). You do not need to log prompts by hand.
