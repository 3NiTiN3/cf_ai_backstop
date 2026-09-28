# Phase 9: Docs and submission

## Objective
A public repo that a Cloudflare reviewer can understand in two minutes and try in one.

## Read first
- `build/GOAL.md`, `docs/BENCHMARKS.md`, `docs/USING_WITH_AGENTS.md`, `build/DECISIONS.md`

## Tasks

### 9.1 README
Replace the placeholder README. Plain language, no em dashes, no hype. Sections:
1. What it is, in two sentences, with the deployed link and a "try the outage story" line.
2. Why: the problem in a short paragraph with the GitHub outage facts and sources. Be careful not to claim AI caused any specific outage.
3. How it works: a Mermaid architecture diagram and one short paragraph per part (read path, breaker, degraded mode, write queue and Workflow, ops agent, MCP).
4. Assignment components: the table mapping LLM, Workflow, chat and memory to the code, with file links.
5. Run locally: prerequisites, install, `.dev.vars`, `npm run dev`, what to click.
6. Deploy: secrets, bindings, `npx wrangler deploy`.
7. Use it with agents: link to the guide and the MCP command.
8. Results: headline numbers from BENCHMARKS.md and the eval pass rate.
9. Design decisions and trade-offs: 4 to 6 bullets from DECISIONS.md.
10. Limitations and what I would do next.
11. How this was built: Claude Code driven by the build system in `build/`, prompt history in `PROMPTS.md`.
- **Done when:** a read-through from top to bottom has no stale facts and every command works as written.
- **Commit:** `docs: write project README`

### 9.2 Visuals
- Ask the user to capture: the dashboard mid-outage, the chat explaining an incident, and a short GIF of the outage story (a free tool like ScreenToGif or Kap). Save under `docs/images/`.
- Reference them in the README.
- **Done when:** images are committed and render in the README preview.
- **Commit:** `docs: add screenshots and demo gif`

### 9.3 Prompt history
- Run `node scripts/export-prompts.mjs`. It builds `PROMPTS.md` from the planning prompts in `build/PLANNING_PROMPTS.md` and every Claude Code session transcript for this folder.
- Review PROMPTS.md for secrets or personal data and remove them. Tell the user what was removed.
- **Done when:** PROMPTS.md covers planning and every build session.
- **Commit:** `docs: add prompt history`

### 9.4 Final acceptance
- Ask before deploying. Deploy.
- Run every check in VALIDATION.md section 4 against the deployed URL. Fix anything that fails with its own commit.
- Tag `v1.0.0`.
- **Done when:** section 4 is fully ticked in PROGRESS.md.
- **Commit:** `chore(build): pass final acceptance`

### 9.5 Publish
- Ask the user before creating anything on GitHub.
- Create a public repo named `cf_ai_backstop` under the user's account (`gh repo create` if the GitHub CLI is installed and logged in, otherwise give the user the exact steps), push `main` and the tag.
- Check the README renders, images load, links work.
- Give the user the repo URL to paste into the application's optional assignment field, and remind them to regenerate PROMPTS.md and push if they keep working afterwards.
- **Done when:** the public repo is live and verified.
- **Commit:** none needed unless fixes are required.

## Phase exit gate
- VALIDATION.md section 4 fully ticked.
- Public repo URL recorded in PROGRESS.md.
