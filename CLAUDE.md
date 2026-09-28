# Backstop

A resilience gateway that sits between AI coding agents and the GitHub API. It caches and deduplicates reads, detects outages with a circuit breaker, serves stale data when GitHub is down, queues safe writes and replays them with a Cloudflare Workflow when GitHub recovers. An ops agent (Workers AI) explains what is happening through chat. Built on Cloudflare Workers, Durable Objects, Workflows and the Agents SDK.

## Start here

Before doing any work in this repo, read `build/ORCHESTRATOR.md` and follow it. It tells you how to find the next task, how to validate it and how to commit it. Do not freelance outside the plan. If the plan is wrong, say so and propose a change to the plan first.

## Hard rules

These apply to every task, every file and every commit.

### Commits
- Commit after every completed task. One task, one commit. Never batch tasks into one commit.
- Conventional Commits: `type(scope): subject`, subject in imperative mood, 72 characters max.
- The body lists the concrete changes as `- ` bullets, then a final line `Task: <id>`.
- Never add `Co-Authored-By`, `Generated with`, session links, emoji, or any mention of Claude, Anthropic or AI tools in commit messages or PR descriptions.
- Never use `git commit --no-verify`, `-n`, or edit/disable the hooks in `.githooks/`. If a hook fails, fix the cause.
- Never force push. Never rewrite history that is already pushed.

### Code
- TypeScript strict. No `any`. No `@ts-ignore`. Use `unknown` and narrow.
- No unnecessary comments. Code should explain itself through names and small functions.
  - Allowed: a short comment explaining *why* something non-obvious is done (a GitHub quirk, a platform limit, a security reason).
  - Not allowed: comments that restate the code, section banners, commented-out code, TODO/FIXME, JSDoc on internal functions, "this function does X" headers, changelog-style comments.
- Small files (aim under 250 lines) and small functions. One responsibility per module.
- Validate all external input with zod at the boundary.
- Never log, store in plain text, or return tokens or Authorization headers.
- Prefer platform primitives (Durable Object SQLite, Workflows, Workers AI bindings) over extra dependencies. Ask before adding a dependency that is not named in the plan.
- Before using a Cloudflare or Agents SDK API, check the current docs at developers.cloudflare.com. The APIs named in the plan are indicative; the docs win.

### Writing (README, docs, UI copy)
- Plain, natural language. No marketing tone, no hype words.
- No em dashes. Use commas, colons, full stops or parentheses.
- Short sentences. Say what it does and why.

## Commands

- `npm run dev` start local dev server
- `npm run check` typecheck, lint and tests (must pass before every commit)
- `npm run test` tests only
- `npx wrangler deploy` deploy (ask the user first)
- `node scripts/export-prompts.mjs` regenerate PROMPTS.md from Claude Code transcripts
- `bash scripts/check-comments.sh --all` list every comment in src for review
