#!/usr/bin/env bash
# classify-failure.sh — Phase 4 of refresh-tests
# Classify a failing test as likely_stale, likely_bug, or ambiguous using a
# git-history heuristic: compare last-commit times of the test file vs. the
# inferred source-under-test file.
#
# Usage: classify-failure.sh <test-file> <repo-root>
#
# Stdout (machine-readable):
#   test: <relative path>
#   source: <relative path or "unknown">
#   verdict: likely_stale | likely_bug | ambiguous | no_history
#   test_last_commit: <ISO-8601 or "n/a">
#   source_last_commit: <ISO-8601 or "n/a">
#   delta_seconds: <int or "n/a">    # source_ts - test_ts; positive = source newer
#   notes: <free-form one-liner>
#
# Heuristic:
#   delta > 86400 (1 day):  likely_stale  — source modified >1 day after test
#   delta < -86400:         likely_bug    — test modified >1 day after source
#   |delta| <= 86400:       ambiguous     — modified together (same commit/day)
#   no source pair found:   ambiguous

set -euo pipefail

TEST_FILE="${1:-}"
ROOT="${2:-.}"

if [[ -z "$TEST_FILE" ]]; then
  echo "usage: classify-failure.sh <test-file> <repo-root>" >&2
  exit 2
fi
if [[ ! -d "$ROOT" ]]; then
  echo "not a directory: $ROOT" >&2
  exit 2
fi

cd "$ROOT"

# Normalise path
TEST_REL="${TEST_FILE#./}"

# ---------------------------------------------------------------------------
# Infer source-under-test path from test file path
# ---------------------------------------------------------------------------
# Try several conventions, return the first existing match.
infer_source() {
  local t="$1"
  local base dir name stem ext

  # Strip leading workspace prefix? Keep as-is; convention rules use full path.
  base=$(basename "$t")
  dir=$(dirname "$t")

  # Strip common test suffix from name
  # *.test.js   -> *.js
  # *.spec.ts   -> *.ts
  # *_test.go   -> *.go
  # *_spec.rb   -> *.rb
  # *Test.java  -> *.java
  # *Tests.cs   -> *.cs
  # test_*.py   -> *.py  (and the source typically lives one dir up)
  # *_test.py   -> *.py
  local candidates=()
  case "$base" in
    *.test.*|*.spec.*)
      stem="${base%.test.*}"
      [[ "$stem" == "$base" ]] && stem="${base%.spec.*}"
      ext="${base##*.}"
      # Try original ext first, then all common JS/TS variants — covers
      # *.test.ts -> *.js (mixed TS test / JS source) and similar mismatches.
      for e in "$ext" js ts jsx tsx mjs cjs; do
        candidates+=("$dir/$stem.$e")
      done
      ;;
    *_test.go)
      stem="${base%_test.go}"
      candidates+=("$dir/$stem.go")
      ;;
    *_spec.rb)
      stem="${base%_spec.rb}"
      candidates+=("$dir/$stem.rb")
      ;;
    *_test.rb)
      stem="${base%_test.rb}"
      candidates+=("$dir/$stem.rb")
      ;;
    *Test.java|*Tests.java|*IT.java)
      stem="${base%Test.java}"
      [[ "$stem" == "$base" ]] && stem="${base%Tests.java}"
      [[ "$stem" == "$base" ]] && stem="${base%IT.java}"
      candidates+=("$dir/$stem.java")
      ;;
    *Test.kt|*Tests.kt)
      stem="${base%Test.kt}"
      [[ "$stem" == "$base" ]] && stem="${base%Tests.kt}"
      candidates+=("$dir/$stem.kt")
      ;;
    *Tests.cs|*Test.cs|*.Tests.cs)
      stem="${base%.Tests.cs}"
      [[ "$stem" == "$base" ]] && stem="${base%Tests.cs}"
      [[ "$stem" == "$base" ]] && stem="${base%Test.cs}"
      candidates+=("$dir/$stem.cs")
      ;;
    *Test.php|*TestCase.php)
      stem="${base%Test.php}"
      [[ "$stem" == "$base" ]] && stem="${base%TestCase.php}"
      candidates+=("$dir/$stem.php")
      ;;
    test_*.py)
      stem="${base#test_}"
      stem="${stem%.py}"
      candidates+=("$dir/$stem.py" "$(dirname "$dir")/$stem.py")
      ;;
    *_test.py)
      stem="${base%_test.py}"
      candidates+=("$dir/$stem.py" "$(dirname "$dir")/$stem.py")
      ;;
  esac

  # If the test lives under __tests__/, try the parent directory and common
  # source roots (lib/, src/) too:
  #   foo/__tests__/Bar.test.js -> foo/Bar.js | foo/lib/Bar.js | foo/src/Bar.js
  if [[ "$dir" == */__tests__* ]]; then
    local parent
    parent="${dir%/__tests__*}"
    case "$base" in
      *.test.*|*.spec.*)
        stem="${base%.test.*}"
        [[ "$stem" == "$base" ]] && stem="${base%.spec.*}"
        # Strip extra qualifiers like "Foo.bar.test.js" -> try "Foo.js"
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

  # Mirror layout: services/api/src/__tests__/services/Foo.test.js
  #             -> services/api/src/services/Foo.js
  if [[ "$dir" == */__tests__/* ]]; then
    local mirrored="${dir/\/__tests__\///}"
    case "$base" in
      *.test.*|*.spec.*)
        stem="${base%.test.*}"
        [[ "$stem" == "$base" ]] && stem="${base%.spec.*}"
        ext="${base##*.}"
        # Try multiple stem extensions (.js source for .test.ts, etc.)
        candidates+=("$mirrored/$stem.$ext" \
                     "$mirrored/$stem.js" "$mirrored/$stem.ts" \
                     "$mirrored/$stem.jsx" "$mirrored/$stem.tsx" \
                     "$mirrored/$stem.mjs" "$mirrored/$stem.cjs")
        ;;
    esac
  fi

  # Return the first candidate that exists in the working tree.
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
# Get last-commit unix timestamp for a tracked file
# ---------------------------------------------------------------------------
last_commit_ts() {
  local f="$1"
  if [[ ! -f "$f" ]]; then echo ""; return; fi
  git log -1 --format=%ct -- "$f" 2>/dev/null
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
# Main
# ---------------------------------------------------------------------------
SOURCE_REL=""
if SOURCE_REL=$(infer_source "$TEST_REL"); then
  :
else
  SOURCE_REL=""
fi

TEST_TS=$(last_commit_ts "$TEST_REL")
SOURCE_TS=""
if [[ -n "$SOURCE_REL" ]]; then
  SOURCE_TS=$(last_commit_ts "$SOURCE_REL")
fi

verdict="ambiguous"
delta_str="n/a"
notes=""

if [[ -z "$TEST_TS" ]]; then
  verdict="no_history"
  notes="test file not tracked in git"
elif [[ -z "$SOURCE_REL" ]]; then
  verdict="ambiguous"
  notes="could not infer source-under-test path"
elif [[ -z "$SOURCE_TS" ]]; then
  verdict="ambiguous"
  notes="source file not tracked in git ($SOURCE_REL)"
else
  delta=$((SOURCE_TS - TEST_TS))
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

printf 'test: %s\n' "$TEST_REL"
printf 'source: %s\n' "${SOURCE_REL:-unknown}"
printf 'verdict: %s\n' "$verdict"
printf 'test_last_commit: %s\n' "$(iso_from_ts "$TEST_TS")"
printf 'source_last_commit: %s\n' "$(iso_from_ts "$SOURCE_TS")"
printf 'delta_seconds: %s\n' "$delta_str"
printf 'notes: %s\n' "$notes"
