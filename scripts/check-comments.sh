#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

mode="${1:---staged}"
pattern='(^[[:space:]]*(//|/\*|\*)|[[:space:]]//[[:space:]])'

case "$mode" in
  --all)
    files="$(git ls-files 'src/*.ts' 'src/*.tsx' 'scripts/*.ts' 'scripts/*.mjs' 2>/dev/null || true)"
    ;;
  --staged)
    files="$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|mjs)$' || true)"
    ;;
  *)
    echo "usage: bash scripts/check-comments.sh [--all|--staged]" >&2
    exit 1
    ;;
esac

if [ -z "$files" ]; then
  echo "No files to check."
  exit 0
fi

count=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  [ -f "$f" ] || continue
  while IFS= read -r hit; do
    echo "$f:$hit"
    count=$((count + 1))
  done < <(grep -nE "$pattern" "$f" | grep -vE '^[0-9]+:[[:space:]]*(//[[:space:]]*(eslint-disable|@ts-expect-error)|/// <reference)' || true)
done <<< "$files"

echo ""
echo "$count comment lines found. Keep only comments that explain a non-obvious why."
