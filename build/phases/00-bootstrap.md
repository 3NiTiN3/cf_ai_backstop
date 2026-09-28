# Phase 0: Bootstrap

## Objective
A clean project scaffolded from the Cloudflare agents starter, chatting through Workers AI, with typecheck, lint and tests wired up, deployed once to workers.dev.

## Read first
- `build/GOAL.md` (tech stack section)
- Cloudflare docs: Agents SDK getting started, Workers AI with the AI SDK (`workers-ai-provider`)

## Tasks

### 0.1 Toolchain check
- Verify Node 20 or newer, npm, git. Check `npx wrangler --version` and `npx wrangler whoami`.
- If wrangler is not logged in, stop and ask the user to run `npx wrangler login`.
- Confirm `git config user.name` and `user.email` are set to the user's identity, not a bot.
- Record versions and the Cloudflare account name (not ID) in `build/DECISIONS.md`.
- **Done when:** all tools present, wrangler logged in, versions recorded.
- **Commit:** `chore(build): record toolchain versions`

### 0.2 Scaffold from the agents starter
- Scaffold into a temporary folder, for example:
  `npm create cloudflare@latest .scaffold-tmp -- --template=cloudflare/agents-starter --no-deploy --no-git`
  If flags have changed, check `npm create cloudflare@latest -- --help`.
- Move the scaffold into the repo root. Do not overwrite `build/`, `.claude/`, `.githooks/`, `scripts/`, `CLAUDE.md`, `README.md` or `.gitignore`. Merge the starter's `.gitignore` entries into ours.
- Delete `.scaffold-tmp`. Run `npm install`.
- Start `npm run dev` briefly to confirm it boots, then stop it.
- **Done when:** app boots locally, repo root has the starter's `src/`, `package.json`, `wrangler.jsonc` and our build files intact.
- **Commit:** `chore(build): scaffold from Cloudflare agents starter`

### 0.3 Rename and strip examples
- Set the worker name to `cf-ai-backstop` in `wrangler.jsonc` and the package name in `package.json`.
- Set `compatibility_date` to today and keep `nodejs_compat`.
- Remove the starter's example tools, scheduling demos and anything else not needed. Keep the chat agent class, the chat UI and its components.
- Rename the chat agent class to `OpsAgent` and update bindings and migrations accordingly. Since nothing is deployed yet, rewrite the migration rather than adding a rename step.
- **Done when:** app boots, chat UI loads, no references to removed examples remain (`grep` for their names).
- **Commit:** `refactor(agent): strip starter examples and rename to OpsAgent`

### 0.4 Switch to Workers AI
- Add the `ai` binding (`"ai": { "binding": "AI" }`) in `wrangler.jsonc`.
- Install `workers-ai-provider`. Use `createWorkersAI({ binding: env.AI })` with `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.
- Remove the OpenAI provider, its dependency and any `OPENAI_API_KEY` references and `.dev.vars` requirements.
- Put the model id in one place (`src/agent/model.ts`) so it can be swapped.
- Workers AI calls from `wrangler dev` go to the real service, so the user must be logged in. That is expected.
- **Done when:** sending "hello" in the local chat gets a reply from Llama. `grep -ri openai src package.json` returns nothing.
- **Commit:** `feat(ai): use Workers AI Llama 3.3 for chat`

### 0.5 Quality tooling
- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`.
- ESLint flat config with `typescript-eslint` recommended rules plus `no-warning-comments` (error) and `@typescript-eslint/no-explicit-any` (error). Keep it light; do not add style rules that fight Prettier.
- Prettier with defaults.
- Vitest with `@cloudflare/vitest-pool-workers` so tests run in the Workers runtime with Durable Object support.
- Scripts in package.json: `typecheck`, `lint`, `test`, `format`, and `check` that runs typecheck, lint and test in sequence.
- One smoke test that calls the worker's fetch handler and gets a 200 for `/`.
- **Done when:** `npm run check` passes. A deliberate `any` makes lint fail (then remove it).
- **Commit:** `build: add typecheck, lint, format and test tooling`

### 0.6 First deploy
- Ask the user before deploying.
- `npx wrangler deploy`. Record the workers.dev URL in PROGRESS.md under "Deployed URL".
- Open the URL, send a chat message, confirm a reply.
- **Done when:** deployed chat replies.
- **Commit:** `chore(build): record first deployment`

## Phase exit gate
- `npm run check` green on a clean tree.
- Local and deployed chat both answer via Llama 3.3.
- No starter examples, no OpenAI references.
- PROGRESS.md has the deployed URL.
