#!/usr/bin/env bash
# Plain-bash test runner for refresh-tests scripts.
# Prints PASS/FAIL per assertion, exits non-zero if any failed.
#
# Usage: ./run-tests.sh
#
# Each test creates a temp git fixture, runs a script, and checks output.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$SCRIPT_DIR/../scripts"

PASS=0
FAIL=0
FAIL_DETAILS=()

ok() { PASS=$((PASS + 1)); printf '  PASS  %s\n' "$1"; }
fail() {
  FAIL=$((FAIL + 1))
  FAIL_DETAILS+=("$1: $2")
  printf '  FAIL  %s — %s\n' "$1" "$2"
}

# Common helper: create a temp dir with a git repo and echo its path.
# Caller must `cd "$d"` themselves — `cd` inside $(...) only affects the
# subshell.
mk_repo() {
  local d
  d=$(mktemp -d -t refresh-tests-test.XXXXXX)
  (cd "$d" && git init -q && git config user.email t@t && git config user.name t)
  echo "$d"
}

# ---------------------------------------------------------------------------
echo
echo "==== detect-project.sh ===="

test_detect_node_jest() {
  local d; d=$(mk_repo); cd "$d"
  cat > package.json <<'EOF'
{"name":"x","devDependencies":{"jest":"^29"}}
EOF
  out=$("$SCRIPTS/detect-project.sh" .)
  if [[ "$out" == *"runner: jest"* ]]; then ok "detects jest"; else fail "detects jest" "got: $out"; fi
  cd /; rm -rf "$d"
}

test_detect_python_pytest() {
  local d; d=$(mk_repo); cd "$d"
  cat > pyproject.toml <<'EOF'
[tool.pytest.ini_options]
testpaths = ["tests"]
EOF
  out=$("$SCRIPTS/detect-project.sh" .)
  if [[ "$out" == *"project: python"* ]] && [[ "$out" == *"runner: pytest"* ]]; then
    ok "detects pytest from pyproject.toml"
  else
    fail "detects pytest" "got: $out"
  fi
  cd /; rm -rf "$d"
}

test_detect_go() {
  local d; d=$(mk_repo); cd "$d"
  cat > go.mod <<'EOF'
module example.com/foo
go 1.21
EOF
  out=$("$SCRIPTS/detect-project.sh" .)
  if [[ "$out" == *"project: go"* ]] && [[ "$out" == *"runner: gotest"* ]]; then
    ok "detects go test"
  else
    fail "detects go test" "got: $out"
  fi
  cd /; rm -rf "$d"
}

test_detect_java_hybrid_dedup() {
  local d; d=$(mk_repo); cd "$d"
  touch pom.xml build.gradle
  out=$("$SCRIPTS/detect-project.sh" . 2>&1)
  blocks=$(printf '%s\n' "$out" | grep -c "^workspace:" || true)
  if [[ "$blocks" -eq 1 ]]; then
    ok "Java hybrid (Maven+Gradle) dedupes to 1 block"
  else
    fail "Java dedup" "got $blocks blocks: $out"
  fi
  cd /; rm -rf "$d"
}

test_detect_skips_node_modules() {
  local d; d=$(mk_repo); cd "$d"
  mkdir -p node_modules/foo
  cat > node_modules/foo/package.json <<'EOF'
{"name":"foo","devDependencies":{"jest":"^29"}}
EOF
  cat > package.json <<'EOF'
{"name":"top","devDependencies":{"vitest":"^1"}}
EOF
  out=$("$SCRIPTS/detect-project.sh" .)
  if [[ "$out" == *"workspace: ."* ]] && [[ "$out" != *"node_modules"* ]]; then
    ok "skips nested node_modules workspaces"
  else
    fail "skips node_modules" "got: $out"
  fi
  cd /; rm -rf "$d"
}

test_detect_node_jest
test_detect_python_pytest
test_detect_go
test_detect_java_hybrid_dedup
test_detect_skips_node_modules

# ---------------------------------------------------------------------------
echo
echo "==== inventory-tests.sh ===="

test_inventory_node() {
  local d; d=$(mk_repo); cd "$d"
  mkdir -p src/__tests__
  touch src/Foo.js src/__tests__/Foo.test.js src/Bar.js src/Bar.test.js
  out=$("$SCRIPTS/inventory-tests.sh" . node 2>/dev/null)
  if [[ "$out" == *"count: 2"* ]]; then ok "lists 2 node tests"; else fail "lists 2 node tests" "got: $out"; fi
  cd /; rm -rf "$d"
}

test_inventory_excludes_e2e() {
  local d; d=$(mk_repo); cd "$d"
  mkdir -p src e2e cypress
  touch src/Foo.test.js e2e/checkout.test.js cypress/login.test.js
  out=$("$SCRIPTS/inventory-tests.sh" . node 2>/dev/null)
  if [[ "$out" == *"count: 1"* ]] && [[ "$out" == *"src/Foo.test.js"* ]]; then
    ok "excludes /e2e/ and /cypress/ paths"
  else
    fail "excludes E2E" "got: $out"
  fi
  cd /; rm -rf "$d"
}

test_inventory_summary() {
  local d; d=$(mk_repo); cd "$d"
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    touch "f${i}.test.js"
  done
  out=$("$SCRIPTS/inventory-tests.sh" . node --summary 2>/dev/null)
  if [[ "$out" == *"count: 12"* ]] && [[ "$out" == *"... (2 more)"* ]]; then
    ok "--summary truncates to first 10 + count"
  else
    fail "--summary" "got: $out"
  fi
  cd /; rm -rf "$d"
}

test_inventory_python() {
  local d; d=$(mk_repo); cd "$d"
  touch test_foo.py bar_test.py
  out=$("$SCRIPTS/inventory-tests.sh" . python 2>/dev/null)
  if [[ "$out" == *"count: 2"* ]]; then ok "lists 2 python tests"; else fail "lists python" "got: $out"; fi
  cd /; rm -rf "$d"
}

test_inventory_node
test_inventory_excludes_e2e
test_inventory_summary
test_inventory_python

# ---------------------------------------------------------------------------
echo
echo "==== classify-failure.sh ===="

test_classify_likely_stale() {
  local d; d=$(mk_repo); cd "$d"
  echo "old" > Foo.test.js
  echo "old" > Foo.js
  git add -A
  GIT_COMMITTER_DATE="2024-01-01T12:00:00" \
    git commit -q -m "init" --date="2024-01-01T12:00:00"
  echo "new" > Foo.js
  git add -A
  GIT_COMMITTER_DATE="2024-01-11T12:00:00" \
    git commit -q -m "update source" --date="2024-01-11T12:00:00"
  out=$("$SCRIPTS/classify-failure.sh" Foo.test.js .)
  if [[ "$out" == *"verdict: likely_stale"* ]]; then
    ok "stale: source modified after test"
  else
    fail "stale verdict" "got: $out"
  fi
  cd /; rm -rf "$d"
}

test_classify_likely_bug() {
  local d; d=$(mk_repo); cd "$d"
  echo "old" > Foo.js
  echo "old" > Foo.test.js
  git add -A
  GIT_COMMITTER_DATE="2024-01-01T12:00:00" \
    git commit -q -m "init" --date="2024-01-01T12:00:00"
  echo "new" > Foo.test.js
  git add -A
  GIT_COMMITTER_DATE="2024-01-15T12:00:00" \
    git commit -q -m "update test" --date="2024-01-15T12:00:00"
  out=$("$SCRIPTS/classify-failure.sh" Foo.test.js .)
  if [[ "$out" == *"verdict: likely_bug"* ]]; then
    ok "bug: test modified after source"
  else
    fail "bug verdict" "got: $out"
  fi
  cd /; rm -rf "$d"
}

test_classify_ts_to_js_fallback() {
  local d; d=$(mk_repo); cd "$d"
  echo "x" > Foo.js
  echo "x" > Foo.test.ts
  git add -A && git commit -q -m "init"
  out=$("$SCRIPTS/classify-failure.sh" Foo.test.ts .)
  if [[ "$out" == *"source: Foo.js"* ]]; then
    ok "TS→JS fallback finds Foo.js for Foo.test.ts"
  else
    fail "TS→JS fallback" "got: $out"
  fi
  cd /; rm -rf "$d"
}

test_classify_likely_stale
test_classify_likely_bug
test_classify_ts_to_js_fallback

# ---------------------------------------------------------------------------
echo
echo "==== classify-failures-batch.sh ===="

test_batch_basic() {
  local d; d=$(mk_repo); cd "$d"
  echo "x" > Foo.js && echo "x" > Bar.js
  echo "y" > Foo.test.js && echo "y" > Bar.test.js
  git add -A && git commit -q -m "init"
  out=$(printf 'Foo.test.js\nBar.test.js\n' | "$SCRIPTS/classify-failures-batch.sh" .)
  blocks=$(printf '%s\n' "$out" | grep -c "^test:")
  if [[ "$blocks" -eq 2 ]]; then
    ok "batch emits 2 blocks for 2 inputs"
  else
    fail "batch block count" "got $blocks: $out"
  fi
  cd /; rm -rf "$d"
}

test_batch_basic

# ---------------------------------------------------------------------------
echo
echo "==== parse-failures.sh ===="

test_parse_jest() {
  out=$(cat <<'EOF' | "$SCRIPTS/parse-failures.sh" jest
FAIL src/utils.test.js
  ● utils > add > handles negatives
    expect(received).toBe(expected)
    Expected: -3
    Received: 3
      at Object.<anonymous> (src/utils.test.js:5:21)
EOF
)
  if [[ "$out" == *"file: src/utils.test.js"* ]] && [[ "$out" == *"kind: assertion"* ]]; then
    ok "parses jest FAIL block"
  else
    fail "parse jest" "got: $out"
  fi
}

test_parse_pytest() {
  out=$(cat <<'EOF' | "$SCRIPTS/parse-failures.sh" pytest
=================================== FAILURES ===================================
___________________________________ test_foo ___________________________________
FAILED tests/test_module.py::TestClass::test_foo - AssertionError: assert 1 == 2
EOF
)
  if [[ "$out" == *"file: tests/test_module.py"* ]] && [[ "$out" == *"AssertionError"* ]]; then
    ok "parses pytest FAILED line"
  else
    fail "parse pytest" "got: $out"
  fi
}

test_parse_jest
test_parse_pytest

# ---------------------------------------------------------------------------
echo
echo "==== parse-coverage.sh ===="

test_parse_coverage_jest() {
  local f
  f=$(mktemp -t cov.XXXXXX)
  cat > "$f" <<'EOF'
{"total":{"statements":{"pct":78.5},"branches":{"pct":62.1},"lines":{"pct":80}},"src/foo.js":{"statements":{"pct":100},"branches":{"pct":100},"lines":{"pct":100}}}
EOF
  out=$("$SCRIPTS/parse-coverage.sh" jest "$f")
  if [[ "$out" == *"TOTAL 78.5 62.1 80"* ]] && [[ "$out" == *"src/foo.js 100 100 100"* ]]; then
    ok "parses jest json-summary"
  else
    fail "parse coverage" "got: $out"
  fi
  rm -f "$f"
}

test_parse_coverage_jest

# ---------------------------------------------------------------------------
echo
echo "==== Summary ===="
echo "  $PASS passed, $FAIL failed"
if [[ $FAIL -gt 0 ]]; then
  echo
  echo "Failures:"
  for d in "${FAIL_DETAILS[@]}"; do
    echo "  - $d"
  done
  exit 1
fi
exit 0
