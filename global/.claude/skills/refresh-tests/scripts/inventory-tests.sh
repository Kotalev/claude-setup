#!/usr/bin/env bash
# inventory-tests.sh — Phase 2 of refresh-tests
# Inventory unit/integration test files inside a workspace.
# Excludes E2E tests (Playwright, Cypress, Selenium, k6, etc.) and load tests.
#
# Usage: inventory-tests.sh <workspace> <project-type> [--summary]
#   project-type: node | python | go | rust | ruby | php | java | dotnet | unknown
#   --summary: emit only count + first 10 paths (useful for large repos)
#
# Stdout (machine-readable):
#   count: <N>
#   <test file path>
#   <test file path>
#   ...
#   (if --summary and N>10, ends with "... (N-10 more)")
#
# Stderr (diagnostics):
#   excluded:e2e <path>   # one line per E2E exclusion (for visibility)
#   excluded:gen <path>   # one line per snapshot/build artifact

set -euo pipefail

WORKSPACE="${1:-.}"
PROJECT="${2:-unknown}"
SUMMARY=0
if [[ "${3:-}" == "--summary" ]]; then
  SUMMARY=1
fi

if [[ ! -d "$WORKSPACE" ]]; then
  echo "not a directory: $WORKSPACE" >&2
  exit 2
fi

cd "$WORKSPACE"

# ---------------------------------------------------------------------------
# E2E / load test exclusion patterns
# ---------------------------------------------------------------------------
# Path fragments that mark a test as E2E or otherwise out-of-scope.
# Match is case-insensitive substring against the relative path.
E2E_PATH_PATTERNS=(
  '/e2e/'           # tests/e2e/, src/e2e/
  '/__e2e__/'
  '/e2e-tests/'
  '/integration-e2e/'
  '/playwright/'    # playwright project layout
  '/cypress/'       # cypress project layout
  '/selenium/'
  '/webdriver/'
  '/load-tests/'    # k6, artillery, locust
  '/load_tests/'
  '/perf-tests/'
  '/perf_tests/'
  '/stress-tests/'
  '/smoke-tests/'   # often E2E in nature
  '/.storybook/'    # storybook stories ≠ tests
)
# File-name patterns that mark a test as E2E even outside the above dirs.
E2E_FILE_PATTERNS=(
  '*.e2e.*'
  '*.e2e-spec.*'
  '*.spec.e2e.*'
  '*.cy.js'
  '*.cy.ts'
  '*.cy.jsx'
  '*.cy.tsx'
  '*.pw.js'
  '*.pw.ts'
)

is_excluded() {
  local p="$1"
  local lower
  lower=$(printf '%s' "$p" | tr '[:upper:]' '[:lower:]')
  for pat in "${E2E_PATH_PATTERNS[@]}"; do
    if [[ "/$lower" == *"$pat"* ]]; then
      return 0
    fi
  done
  for pat in "${E2E_FILE_PATTERNS[@]}"; do
    # shellcheck disable=SC2053 (intentional glob match)
    if [[ "$lower" == $pat ]]; then
      return 0
    fi
  done
  return 1
}

# Standard noise prune list (directories to skip entirely).
PRUNE_NAMES=(node_modules .git dist build .next vendor .venv venv __pycache__ .pytest_cache coverage tmp .cache target .gradle .mvn .idea .vscode out)
PRUNE=""
for n in "${PRUNE_NAMES[@]}"; do
  PRUNE+="${PRUNE:+ -o }-name $n"
done

# ---------------------------------------------------------------------------
# Find candidate test files per project type
# ---------------------------------------------------------------------------
case "$PROJECT" in
  node)
    # Common JS/TS test patterns: *.test.{js,ts,jsx,tsx}, *.spec.{js,ts,jsx,tsx},
    # plus files under __tests__/.
    candidates=$(eval "find . -type d \\( $PRUNE \\) -prune -o -type f \\( \
      -name '*.test.js' -o -name '*.test.jsx' -o -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test.mjs' -o -name '*.test.cjs' \
      -o -name '*.spec.js' -o -name '*.spec.jsx' -o -name '*.spec.ts' -o -name '*.spec.tsx' -o -name '*.spec.mjs' -o -name '*.spec.cjs' \
    \\) -print")
    # Add __tests__/ files that don't follow the .test/.spec naming
    extra=$(eval "find . -type d \\( $PRUNE \\) -prune -o -type d -name '__tests__' -print" \
      | while IFS= read -r d; do
          find "$d" -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' -o -name '*.cjs' \) 2>/dev/null
        done)
    candidates=$(printf '%s\n%s\n' "$candidates" "$extra" | grep -v '^$' | sort -u)
    ;;
  python)
    candidates=$(eval "find . -type d \\( $PRUNE \\) -prune -o -type f \\( \
      -name 'test_*.py' -o -name '*_test.py' -o -name 'tests.py' \
    \\) -print")
    ;;
  go)
    candidates=$(eval "find . -type d \\( $PRUNE \\) -prune -o -type f -name '*_test.go' -print")
    ;;
  rust)
    # Cargo unit tests live in src/ files alongside `#[cfg(test)]`. Integration
    # tests live in tests/. We surface the integration test files directly and
    # mark inline-tested src files separately.
    candidates=$(eval "find . -type d \\( $PRUNE \\) -prune -o -path '*/tests/*.rs' -print")
    inline_units=$(grep -rl --include='*.rs' '#\[cfg(test)\]' src 2>/dev/null || true)
    if [[ -n "$inline_units" ]]; then
      candidates=$(printf '%s\n%s\n' "$candidates" "$inline_units" | grep -v '^$' | sort -u)
    fi
    ;;
  ruby)
    candidates=$(eval "find . -type d \\( $PRUNE \\) -prune -o -type f \\( \
      -name '*_spec.rb' -o -name '*_test.rb' \
    \\) -print")
    ;;
  php)
    candidates=$(eval "find . -type d \\( $PRUNE \\) -prune -o -type f \\( \
      -name '*Test.php' -o -name '*TestCase.php' \
    \\) -print")
    ;;
  java)
    candidates=$(eval "find . -type d \\( $PRUNE \\) -prune -o -type f \\( \
      -name '*Test.java' -o -name '*Tests.java' -o -name '*IT.java' \
      -o -name '*Test.kt' -o -name '*Tests.kt' \
    \\) -print")
    ;;
  dotnet)
    candidates=$(eval "find . -type d \\( $PRUNE \\) -prune -o -type f \\( \
      -name '*Tests.cs' -o -name '*Test.cs' -o -name '*.Tests.cs' \
    \\) -print")
    ;;
  *)
    # Generic fallback — anything that looks like a test
    candidates=$(eval "find . -type d \\( $PRUNE \\) -prune -o -type f \\( \
      -name '*test*' -o -name '*spec*' \
    \\) -print" | grep -v -E '\.(md|txt|json|yaml|yml)$')
    ;;
esac

# ---------------------------------------------------------------------------
# Filter out E2E and emit
# ---------------------------------------------------------------------------
included=()
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  f="${f#./}"
  if is_excluded "$f"; then
    echo "excluded:e2e $f" >&2
    continue
  fi
  included+=("$f")
done <<< "$candidates"

printf 'count: %d\n' "${#included[@]}"
total=${#included[@]}
limit=$total
if [[ "$SUMMARY" == 1 && $total -gt 10 ]]; then
  limit=10
fi
i=0
for f in "${included[@]}"; do
  if (( i >= limit )); then
    break
  fi
  printf '%s\n' "$f"
  i=$((i + 1))
done
if [[ "$SUMMARY" == 1 && $total -gt $limit ]]; then
  printf '... (%d more)\n' $((total - limit))
fi
