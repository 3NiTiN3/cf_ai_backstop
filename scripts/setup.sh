#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing $1. $2" >&2
    exit 1
  fi
}

need git "Install git first."
need node "Install Node.js 20 or newer."
need npm "Install npm (comes with Node.js)."

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 20 ]; then
  echo "Node $node_major found. Node 20 or newer is required." >&2
  exit 1
fi

if [ ! -d .git ]; then
  git init -b main >/dev/null
  echo "Initialised git repository on main."
fi

git config core.hooksPath .githooks
chmod +x .githooks/* scripts/*.sh
echo "Git hooks enabled from .githooks/."

name="$(git config user.name || true)"
email="$(git config user.email || true)"
if [ -z "$name" ] || [ -z "$email" ]; then
  echo "Set your git identity, then run this script again:" >&2
  echo "  git config --global user.name \"Your Name\"" >&2
  echo "  git config --global user.email \"you@example.com\"" >&2
  exit 1
fi
echo "Commits will be authored by: $name <$email>"

if [ -z "$(git log --oneline -1 2>/dev/null || true)" ]; then
  git add -A
  git commit -q -F - <<'EOF'
chore(build): add build system

- Add goal, orchestrator, phases, validation and progress tracking
- Add Claude Code settings and slash commands
- Add commit-msg and pre-commit hooks
- Add setup, comment audit and prompt export scripts

Task: setup
EOF
  echo "Created the first commit."
fi

echo ""
echo "Next:"
echo "  1. npx wrangler login"
echo "  2. Open Claude Code in VS Code and type /phase"
