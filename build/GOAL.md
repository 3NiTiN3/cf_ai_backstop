# Goal

## One line

Keep AI coding agents working when GitHub is slow or down, and stop them from making GitHub's bad day worse.

## The problem

AI agents now open PRs, push commits, read files, poll CI and post comments at a volume no human team produces. They are also noisy: they re-fetch the same files, poll aggressively and retry immediately on errors.

GitHub has been struggling with reliability:

- On August 17, 2026 GitHub had a multi-hour outage. Error rates reached about 20% across the web interface and API, and about 50% for raw content and archive downloads. Actions, Copilot and enterprise auth were degraded. (DevOps.com)
- IncidentHub counted 57 GitHub Actions incidents between May 2025 and April 2026.
- GitHub executives said earlier in 2026 that they had to scale capacity quickly to keep up with record traffic from AI-driven development.

GitHub has not published a root cause for the August outage, so Backstop does not claim AI traffic caused any specific incident. The claim is narrower and defensible: agent traffic raises load, and agents behave badly during failures (retry storms, hanging jobs, lost writes). A layer between agents and GitHub can fix that behaviour.

## What we are building

**Backstop**: a gateway on Cloudflare that agents call instead of `api.github.com`.

1. **Read path.** Caches responses per repo, revalidates with ETags (a 304 does not count against GitHub's rate limit), and collapses identical concurrent requests into one upstream call.
2. **Outage detection.** A circuit breaker per repo watches error rate, timeouts and rate limit signals. When GitHub is unhealthy it stops sending traffic and probes for recovery.
3. **Degraded mode.** Reads are served from stale cache with clear headers. Safe writes (comments, labels, commit statuses, issue creation) are queued with idempotency keys instead of failing.
4. **Replay.** When the breaker closes, a Cloudflare Workflow replays queued writes in order with retries and backoff.
5. **Ops agent.** A chat agent (Llama 3.3 on Workers AI) answers questions like "why are reads slow?" or "what is queued for demo/api?" using tools that read real gateway state. It also writes plain-language incident summaries. It never invents numbers.
6. **MCP server.** Coding agents like Claude Code can use Backstop directly as MCP tools.
7. **Demo mode.** A built-in mock GitHub and a chaos switch let anyone simulate an outage in 30 seconds on the deployed site, without a token and without touching real GitHub.

## Who it is for

Platform and developer productivity teams whose engineers use AI coding agents at scale. That is exactly the Cloudflare Developer Productivity team's problem space: developer infrastructure, CI/CD, AI-assisted development, MCP servers and agents.

## Assignment requirements mapping

Cloudflare's optional assignment asks for an AI-powered app with four components. Backstop covers each one with real purpose, not as decoration.

| Requirement | Backstop |
| --- | --- |
| LLM | Workers AI, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, powering the ops agent and incident summaries |
| Workflow / coordination | Cloudflare Workflows for write replay, Durable Objects coordinating per-repo state |
| User input via chat | Chat UI (Agents SDK `AIChatAgent`) next to a live dashboard |
| Memory or state | Durable Object SQLite: cache, breaker state, write queue, incidents; agent state for watched repos and preferences; persisted chat history |

Also required: public GitHub repo (named with the `cf_ai_` prefix), a README with clear run instructions and a deployed link, and prompt history in `PROMPTS.md`.

## Architecture

```
 coding agents / CI / MCP clients
          |  GitHub REST calls with the base URL pointed at Backstop
          v
 +------------------------ Worker (router) -------------------------+
 |  /gh/*   /demo/gh/*   /api/*   /agents/*   /mcp   static UI       |
 +-----+-----------------------+-----------------------+------------+
       |                       |                       |
       v                       v                       v
 RepoGateway DO           OpsAgent DO            BackstopMcp
 one per repo:            chat, Workers AI,      MCP tools over
 cache, coalescing,       tools, memory          the gateway
 breaker, queue,               |
 events, incidents             |
       |  reports              |  reads
       v                       v
 Registry DO (global): active repos, chaos config, overview stats
       |
       |  breaker closes
       v
 ReplayWorkflow  ------>  api.github.com  or  built-in mock GitHub
```

## Tech stack

- Cloudflare Workers, Durable Objects (SQLite storage), Workflows, Workers AI
- Agents SDK (`agents` package): `AIChatAgent`, `McpAgent`
- AI SDK with `workers-ai-provider`
- React + Vite + Tailwind (from the Cloudflare agents starter)
- zod, vitest with `@cloudflare/vitest-pool-workers`

## Non-goals

- Not a git protocol proxy. Clones and pushes over git are out of scope. Backstop covers the REST API that agents mostly use.
- Not a GitHub replacement or mirror.
- Not a general HTTP cache. It understands GitHub semantics on purpose.
- No queueing of writes whose order or side effects are unsafe to delay (merges, force updates, deletes of branches). Those fail fast with a clear error.

## Success criteria

The project is done when all of this is true:

1. A reviewer opens the deployed URL, presses "Play the outage story", and within 90 seconds sees: normal traffic, GitHub blackout, reads still served from cache, writes queued, recovery, queue drained by the Workflow, and an incident summary written by the LLM.
2. The reviewer asks the chat "what just happened?" and gets an accurate answer grounded in tool results.
3. Against the demo namespace with 20 simulated agents, at least 60% of upstream calls are avoided through caching, revalidation and coalescing, and the numbers are in `docs/BENCHMARKS.md`.
4. Claude Code can connect to `/mcp` and read through the gateway.
5. `npm run check` passes. Tool-selection evals pass at 85% or higher.
6. README and PROMPTS.md are complete. Every commit follows the rules in `CLAUDE.md`.
