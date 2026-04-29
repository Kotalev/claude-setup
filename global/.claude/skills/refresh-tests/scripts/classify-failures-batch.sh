#!/usr/bin/env bash
# classify-failures-batch.sh — Batch version of classify-failure.sh
# Reads test file paths from stdin (one per line), emits one classification
# block per file. Uses a single `git log` call to fetch all timestamps at once
# instead of N calls — much faster for large failure sets.
#
# Usage:
#   echo -e "test1.js\ntest2.js" | classify-failures-batch.sh <repo-root>
#   classify-failures-batch.sh <repo-root> < failures.txt
#
# Output: same format as classify-failure.sh, blank-line separated blocks.

set -euo pipefail

ROOT="${1:-.}"
if [[ ! -d "$ROOT" ]]; then
  echo "not a directory: $ROOT" >&2
  exit 2
fi

cd "$ROOT"

# ---------------------------------------------------------------------------
# Read test files from stdin
# ---------------------------------------------------------------------------
TEST_FILES=()
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  TEST_FILES+=("${f#./}")
done

if [[ ${#TEST_FILES[@]} -eq 0 ]]; then
  echo "no test files received on stdin" >&2
  exit 0
fi

# ---------------------------------------------------------------------------
# Source inference (mirror of classify-failure.sh; kept inline for portability)
# ---------------------------------------------------------------------------
infer_source() {
  local t="$1"
  local base dir stem ext

  base=$(basename "$t")
  dir=$(dirname "$t")

  local candidates=()
  case "$base" in
    *.test.*|*.spec.*)
      stem="${base%.test.*}"
      [[ "$stem" == "$base" ]] && stem="${base%.spec.*}"
      ext="${base##*.}"
      for e in "$ext" js ts jsx tsx mjs cjs; do
        candidates+=("$dir/$stem.$e")
      done
      ;;
    *_test.go)   candidates+=("$dir/${base%_test.go}.go") ;;
    *_spec.rb)   candidates+=("$dir/${base%_spec.rb}.rb") ;;
    *_test.rb)   candidates+=("$dir/${base%_test.rb}.rb") ;;
    *Test.java|*Tests.java|*IT.java)
      stem="${base%Test.java}"
      [[ "$stem" == "$base" ]] && stem="${base%Tests.java}"
      [[ "$stem" == "$base" ]] && stem="${base%IT.java}"
      candidates+=("$dir/$stem.java") ;;
    *Test.kt|*Tests.kt)
      stem="${base%Test.kt}"
      [[ "$stem" == "$base" ]] && stem="${base%Tests.kt}"
      candidates+=("$dir/$stem.kt") ;;
    *Tests.cs|*Test.cs|*.Tests.cs)
      stem="${base%.Tests.cs}"
      [[ "$stem" == "$base" ]] && stem="${base%Tests.cs}"
      [[ "$stem" == "$base" ]] && stem="${base%Test.cs}"
      candidates+=("$dir/$stem.cs") ;;
    *Test.php|*TestCase.php)
      stem="${base%Test.php}"
      [[ "$stem" == "$base" ]] && stem="${base%TestCase.php}"
      candidates+=("$dir/$stem.php") ;;
    test_*.py)
      stem="${base#test_}"; stem="${stem%.py}"
      candidates+=("$dir/$stem.py" "$(dirname "$dir")/$stem.py") ;;
    *_test.py)
      stem="${base%_test.py}"
      candidates+=("$dir/$stem.py" "$(dirname "$dir")/$stem.py") ;;
  esac

  if [[ "$dir" == */__tests__* ]]; then
    local parent="${dir%/__tests__*}"
    case "$base" in
      *.test.*|*.spec.*)
        stem="${base%.test.*}"
        [[ "$stem" == "$base" ]] && stem="${base%.spec.*}"
        local short="${stem%%.*}"
        ext="${base##*.}"
        for sub in "" "lib/" "src/"; do
          for s in "$stem" "$short"; do
            for e in "$ext" js ts jsx tsx mjs cjs; do
              candidates+=("$parent/$sub$s.$e")
            done
          done
        done
        ;;
    esac
  fi

  if [[ "$dir" == */__tests__/* ]]; then
    local mirrored="${dir/\/__tests__\///}"
    case "$base" in
      *.test.*|*.spec.*)
        stem="${base%.test.*}"
        [[ "$stem" == "$base" ]] && stem="${base%.spec.*}"
        ext="${base##*.}"
        for e in "$ext" js ts jsx tsx mjs cjs; do
          candidates+=("$mirrored/$stem.$e")
        done
        ;;
    esac
  fi

  for c in "${candidates[@]}"; do
    if [[ -f "$c" ]]; then
      # Strip leading "./" so paths match git's representation.
      printf '%s\n' "${c#./}"
      return 0
    fi
  done
  return 1
}

# ---------------------------------------------------------------------------
# Build the union list of files we need timestamps for, then fetch in ONE
# git log call. We use `git log --format='COMMIT %ct' --name-only --no-renames
# -- <files>` which lists each commit followed by its changed file names.
# That gives us the latest commit per file with one process.
# ---------------------------------------------------------------------------
declare -a all_files=()
declare -a tests_arr=()
declare -a sources_arr=()

for t in "${TEST_FILES[@]}"; do
  src=""
  if src=$(infer_source "$t"); then :; else src=""; fi
  tests_arr+=("$t")
  sources_arr+=("$src")
  all_files+=("$t")
  [[ -n "$src" ]] && all_files+=("$src")
done

# Dedupe all_files (bash 3 compatible: sort -u via process substitution)
unique_files=()
while IFS= read -r f; do
  unique_files+=("$f")
done < <(printf '%s\n' "${all_files[@]}" | sort -u)

# Single git log invocation: walk history and record latest commit per file.
# Using a temp file because the parser needs to read sequentially.
TMP=$(mktemp -t refresh-tests.XXXXXX)
trap 'rm -f "$TMP"' EXIT

# %ct = committer timestamp (epoch). --name-only with --no-renames lists files.
# Restrict to the file set with `-- <files>` so output is bounded.
if [[ ${#unique_files[@]} -gt 0 ]]; then
  git log --no-renames --format='COMMIT %ct' --name-only -- "${unique_files[@]}" > "$TMP" 2>/dev/null || true
fi

# Parse the log: build a map file -> latest_ts (first occurrence wins because
# git log is reverse-chronological).
TS_FILE=$(mktemp -t refresh-tests-ts.XXXXXX)
trap 'rm -f "$TMP" "$TS_FILE"' EXIT

awk '
  /^COMMIT / { ts = $2; next }
  NF > 0 {
    # First occurrence per file = latest timestamp
    if (!(seen[$0])) {
      seen[$0] = 1
      printf "%s\t%s\n", $0, ts
    }
  }
' "$TMP" > "$TS_FILE"

# Helper: lookup timestamp for a file
ts_lookup() {
  local f="$1"
  awk -F'\t' -v target="$f" '$1 == target { print $2; exit }' "$TS_FILE"
}

iso_from_ts() {
  local ts="$1"
  if [[ -z "$ts" ]]; then echo "n/a"; return; fi
  if date -r "$ts" -u '+%Y-%m-%dT%H:%M:%SZ' >/dev/null 2>&1; then
    date -r "$ts" -u '+%Y-%m-%dT%H:%M:%SZ'
  else
    date -d "@$ts" -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo "n/a"
  fi
}

# ---------------------------------------------------------------------------
# Emit one block per test
# ---------------------------------------------------------------------------
for i in "${!tests_arr[@]}"; do
  test_rel="${tests_arr[$i]}"
  source_rel="${sources_arr[$i]}"

  test_ts=$(ts_lookup "$test_rel")
  source_ts=""
  [[ -n "$source_rel" ]] && source_ts=$(ts_lookup "$source_rel")

  verdict="ambiguous"
  delta_str="n/a"
  notes=""

  if [[ -z "$test_ts" ]]; then
    verdict="no_history"
    notes="test file not tracked in git"
  elif [[ -z "$source_rel" ]]; then
    verdict="ambiguous"
    notes="could not infer source-under-test path"
  elif [[ -z "$source_ts" ]]; then
    verdict="ambiguous"
    notes="source file not tracked in git ($source_rel)"
  else
    delta=$((source_ts - test_ts))
    delta_str="$delta"
    if (( delta > 86400 )); then
      verdict="likely_stale"
      notes="source modified $((delta / 86400)) day(s) after test"
    elif (( delta < -86400 )); then
      verdict="likely_bug"
      notes="test modified $((-delta / 86400)) day(s) after source"
    else
      verdict="ambiguous"
      notes="test and source modified within ~1 day"
    fi
  fi

  printf 'test: %s\n' "$test_rel"
  printf 'source: %s\n' "${source_rel:-unknown}"
  printf 'verdict: %s\n' "$verdict"
  printf 'test_last_commit: %s\n' "$(iso_from_ts "$test_ts")"
  printf 'source_last_commit: %s\n' "$(iso_from_ts "$source_ts")"
  printf 'delta_seconds: %s\n' "$delta_str"
  printf 'notes: %s\n\n' "$notes"
done
