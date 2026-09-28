# Phase 4: Ops agent

## Objective
A chat agent that explains what the gateway is doing, using tools that read real state. It remembers what the user cares about, writes incident summaries, and its tool choices are measured by an eval harness.

## Read first
- Cloudflare docs: Agents SDK `AIChatAgent`, agent state (`setState`, `this.state`), human-in-the-loop tool confirmation pattern used by the starter
- AI SDK docs: `tool()` with zod schemas, `streamText`, `maxSteps` or `stopWhen`
- Workers AI docs: function calling support for the chosen model

## Design notes
- The LLM never computes numbers. Tools return facts; the model phrases them.
- Keep tools few (8 or fewer) with precise descriptions. Llama tool calling degrades as the tool list grows.
- If Llama 3.3 tool calling proves unreliable during evals, record it in DECISIONS.md and ask the user before switching models.

## Tasks

### 4.1 System prompt
- `src/agent/prompt.ts`: role (ops assistant for the Backstop gateway), rules (answer from tool results only, say when unsure, be brief, use numbers from tools, ask before destructive actions, default namespace is demo), short style guide (plain language, no em dashes).
- Include the current namespace and watched repos from agent state in the prompt.
- **Done when:** prompt is under 400 words and covered by a snapshot test.
- **Commit:** `feat(agent): add ops agent system prompt`

### 4.2 Tools
- `src/agent/tools.ts` with zod input schemas:
  - `getOverview(namespace)`
  - `getRepoHealth(namespace, repo)`
  - `listQueue(namespace, repo)`
  - `getRecentEvents(namespace, repo, limit)`
  - `listIncidents(namespace, repo?)`
  - `setChaos(namespace, mode, errorRate?, latencyMs?)` requires confirmation
  - `setWritesPaused(namespace, repo, paused)` requires confirmation
  - `triggerReplay(namespace, repo)` requires confirmation
- Tools that change state on the live namespace also require the admin token configured in the Worker, otherwise they return a clear refusal.
- Tool results are compact JSON (no raw event dumps over 20 rows).
- **Done when:** unit tests call each tool's execute function against a seeded DO. Local chat answers "is demo/api healthy?" by calling `getRepoHealth`.
- **Commit:** `feat(agent): add gateway tools with confirmation for actions`

### 4.3 Memory
- Agent state: `{ namespace, watchedRepos: string[], lastSeenIncidentAt: number | null }` via `setState`.
- Tool `watchRepo(repo, watch: boolean)` (this is the ninth tool; if evals suffer, fold it into a settings tool).
- When a conversation resumes, the agent can mention incidents since `lastSeenIncidentAt` for watched repos.
- Chat history persistence comes from `AIChatAgent`; verify it survives a reload.
- **Done when:** tests cover state updates. Manual: watch a repo, reload, ask "what am I watching?"
- **Commit:** `feat(agent): remember watched repos and last seen incident`

### 4.4 Incident summaries
- RepoGateway records an incident when the breaker opens and closes it when the breaker closes: `incidents (id, started_at, ended_at, peak_error_rate, reads_served_stale, writes_queued, writes_replayed, summary)`.
- On close, generate a 2 to 3 sentence summary with Workers AI from the deterministic facts only. Run it with `ctx.waitUntil`, cap output tokens, and fall back to a template sentence if the model call fails or times out.
- `GET /api/incidents?namespace=&repo=`.
- **Done when:** tests cover incident lifecycle and the fallback path (AI binding stubbed). Manual: blackout, recover, summary appears.
- **Commit:** `feat(agent): write incident summaries from recorded facts`

### 4.5 Tool-selection evals
- `evals/cases.json`: 15 to 20 cases `{ id, question, expectTools: string[], forbidTools: string[] }`. Cover health, queue, history, chaos requests, ambiguous questions, and questions that should call no tool.
- A dev-only endpoint `POST /api/dev/eval` (only when `ENVIRONMENT` is `dev`) runs one model turn with the real tools in dry-run mode and returns the tool calls chosen.
- `scripts/run-evals.ts`: runs every case against a local dev server, scores it, prints a table and writes `evals/results.md` with the pass rate, model id and date.
- Iterate on tool descriptions and the prompt until the pass rate is 85% or higher. Record before and after numbers in DECISIONS.md.
- **Done when:** `evals/results.md` shows 85% or more.
- **Commit:** `test(evals): add tool-selection eval harness and results`

## Phase exit gate
- Chat answers health, queue and incident questions with numbers that match `/api/*`.
- Asking to start a blackout asks for confirmation first.
- Chat history and watched repos survive a reload.
- Evals at 85% or higher.
- Deploy (ask first). Chat works on the deployed URL.
