# How to use this build system

## One-time setup

1. Unzip `cf_ai_backstop` wherever you keep projects and open the folder in VS Code.
2. Open a terminal in VS Code and run:
   ```
   bash scripts/setup.sh
   ```
   On Windows, run it from Git Bash. It initialises git, turns on the hooks in `.githooks/`, checks your git name and email, and makes the first commit.
3. Log in to Cloudflare once:
   ```
   npx wrangler login
   ```
4. Open the Claude Code panel in VS Code.

## Running the build

Type one of these in Claude Code:

| Command | What it does |
| --- | --- |
| `/next` | Does the next task, validates it, commits it, stops |
| `/phase` | Runs every remaining task in the current phase, then the phase gate |
| `/status` | Shows where the build is and what is next |
| `/validate` | Runs the gate for the current phase |
| `/prompts` | Regenerates PROMPTS.md from your Claude Code sessions |

You can also just say "Read build/ORCHESTRATOR.md and start." The file `CLAUDE.md` is loaded automatically in every session and points Claude Code at the orchestrator.

The default mode is `phase`: it works through a whole phase, then stops so you can look. Change `Mode` in `build/PROGRESS.md` to `task` to review every commit, or `auto` to let it run across phases. It always stops for deploys, pushing to GitHub, new dependencies and anything you need to do yourself.

After each phase, run `/clear` and then `/phase` again. All state lives in the repo, so a fresh context loses nothing.

## What keeps the commits clean

- `.claude/settings.json` turns off Claude Code's commit and PR attribution.
- `.githooks/commit-msg` strips any `Co-Authored-By` Claude lines, "Generated with" lines, session links and robot emoji, blocks em dashes, and enforces Conventional Commits.
- `.githooks/pre-commit` blocks secrets, `.dev.vars`, TODO/FIXME, banner comments, commented-out code, AI mentions in comments and em dashes in markdown. It warns when a file adds a lot of comment lines.
- `CLAUDE.md` tells Claude Code never to bypass hooks.

Your git name and email are used as the author on every commit.

## Things only you can do

Claude Code will stop and ask when it needs these:

- `npx wrangler login`
- secrets: `npx wrangler secret put ADMIN_TOKEN` and `npx wrangler secret put QUEUE_ENCRYPTION_KEY`, and a local `.dev.vars` file
- approving each deploy
- a GitHub token for live benchmarks (optional)
- screenshots and the demo GIF
- creating the public GitHub repo and pasting its URL into the Cloudflare application

## Prompt history

Cloudflare asks for your prompts. `node scripts/export-prompts.mjs` builds `PROMPTS.md` from:
- `build/PLANNING_PROMPTS.md` (the planning chat, already filled in), and
- every Claude Code session transcript for this folder, found under `~/.claude/projects/`.

Run it again before your final push. Review the output for anything private.

## Changing the plan

Edit the phase files yourself, or ask Claude Code to propose a change. It will ask before touching GOAL, ORCHESTRATOR, phases, VALIDATION or CLAUDE.md, and it logs real decisions in `build/DECISIONS.md`.
