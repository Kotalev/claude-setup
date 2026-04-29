#!/usr/bin/env bash
# discover.sh — Phase 1 of refresh-setup
# Inventory every CLAUDE.md / CLAUDE.local.md and .claude/ artifact in the repo.
# Output: tab-separated table (path \t bytes \t mtime-iso) sorted by path.
# Usage: discover.sh <repo-root>

set -euo pipefail

ROOT="${1:-}"
if [[ -z "$ROOT" ]]; then
  echo "usage: discover.sh <repo-root>" >&2
  exit 2
fi
if [[ ! -d "$ROOT" ]]; then
  echo "not a directory: $ROOT" >&2
  exit 2
fi

cd "$ROOT"

# Skip well-known noise dirs. Project may also have its own — caller can grep further.
PRUNE='-path ./node_modules -o -path ./.git -o -path ./dist -o -path ./build -o -path ./.next -o -path ./vendor -o -path ./.venv -o -path ./venv -o -path ./__pycache__ -o -path ./.pytest_cache -o -path ./coverage -o -path ./tmp -o -path ./.cache'

# 1) All CLAUDE.md / CLAUDE.local.md anywhere in the tree.
# 2) Everything under any .claude/ directory (project root and nested).
{
  eval "find . \\( $PRUNE \\) -prune -o -type f \\( -name 'CLAUDE.md' -o -name 'CLAUDE.local.md' \\) -print"
  eval "find . \\( $PRUNE \\) -prune -o -type d -name '.claude' -print" \
    | while IFS= read -r d; do
        find "$d" -type f
      done
} | sort -u | while IFS= read -r f; do
  # macOS stat differs from GNU stat. Try BSD first, fall back to GNU.
  if size=$(stat -f '%z' "$f" 2>/dev/null); then
    mtime=$(stat -f '%Sm' -t '%Y-%m-%dT%H:%M:%S' "$f" 2>/dev/null || echo '?')
  else
    size=$(stat -c '%s' "$f" 2>/dev/null || echo '?')
    mtime=$(stat -c '%y' "$f" 2>/dev/null | cut -d'.' -f1 || echo '?')
  fi
  printf '%s\t%s\t%s\n' "$f" "$size" "$mtime"
done
