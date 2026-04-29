#!/usr/bin/env bash
# SessionStart hook — print a brief reminder of active rules, skills, and agents.
# Output goes to stdout and is injected into Claude's context as additional system info.

set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CLAUDE_DIR="$ROOT/.claude"

[ -d "$CLAUDE_DIR" ] || exit 0

print_section() {
  local title="$1" dir="$2" pattern="$3"
  [ -d "$dir" ] || return 0
  local items
  items=$(find "$dir" -maxdepth 2 -name "$pattern" -type f 2>/dev/null | sort)
  [ -z "$items" ] && return 0
  echo "## $title"
  while IFS= read -r f; do
    local name
    name=$(basename "$(dirname "$f")")
    [ "$name" = "$(basename "$dir")" ] && name=$(basename "$f" .md)
    echo "- $name"
  done <<< "$items"
  echo
}

echo "# Active project Claude config ($CLAUDE_DIR)"
echo
print_section "Rules" "$CLAUDE_DIR/rules" "*.md"
print_section "Agents" "$CLAUDE_DIR/agents" "*.md"
print_section "Skills" "$CLAUDE_DIR/skills" "SKILL.md"
