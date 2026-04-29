#!/usr/bin/env bash
# detect-project.sh — Phase 1 of refresh-tests
# Detect project type, test runner(s), workspace(s), and standard test/coverage commands.
#
# Outputs blocks separated by blank lines, one per detected workspace:
#   workspace: <relative path from repo root>
#   project: node|python|go|rust|ruby|php|java|dotnet|unknown
#   runner: jest|vitest|mocha|jasmine|ava|tap|node-test|pytest|unittest|gotest|cargotest|rspec|phpunit|junit|gradle|xunit|nunit|mstest|unknown
#   test_cmd: <shell command to run unit tests>
#   coverage_cmd: <shell command to run with coverage, or "n/a">
#
# Usage: detect-project.sh <repo-root>
# Stderr is used for diagnostics; stdout is the machine-readable output.

set -euo pipefail

ROOT="${1:-}"
if [[ -z "$ROOT" ]]; then
  echo "usage: detect-project.sh <repo-root>" >&2
  exit 2
fi
if [[ ! -d "$ROOT" ]]; then
  echo "not a directory: $ROOT" >&2
  exit 2
fi

cd "$ROOT"

# Noise prune list — match by directory NAME so nested copies are also skipped
# (e.g. ./frontend/node_modules, not just ./node_modules).
PRUNE_NAMES=(node_modules .git dist build .next vendor .venv venv __pycache__ .pytest_cache coverage tmp .cache target .gradle .mvn .idea .vscode)
PRUNE=""
for n in "${PRUNE_NAMES[@]}"; do
  PRUNE+="${PRUNE:+ -o }-name $n"
done
# PRUNE expands to: -name node_modules -o -name .git -o ...

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Read a JSON value via node if available, else python, else jq, else grep.
json_get() {
  local file="$1" path="$2" # path like .scripts.test or .devDependencies.jest
  if command -v node >/dev/null 2>&1; then
    node -e "
      const fs=require('fs');
      try {
        const d=JSON.parse(fs.readFileSync('$file','utf8'));
        const p='$path'.replace(/^\\./,'').split('.');
        let v=d; for(const k of p){ if(v==null) break; v=v[k]; }
        if(v==null) process.exit(0);
        if(typeof v==='object') console.log(JSON.stringify(v));
        else console.log(v);
      } catch(e){ process.exit(0); }
    " 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "
import json,sys
try:
    d=json.load(open('$file'))
    p='$path'.lstrip('.').split('.')
    v=d
    for k in p:
        if v is None: break
        v=v.get(k) if isinstance(v,dict) else None
    if v is None: sys.exit(0)
    print(json.dumps(v) if isinstance(v,(dict,list)) else v)
except Exception:
    sys.exit(0)
" 2>/dev/null
  elif command -v jq >/dev/null 2>&1; then
    jq -r "$path // empty" "$file" 2>/dev/null
  fi
}

emit_block() {
  local workspace="$1" project="$2" runner="$3" test_cmd="$4" coverage_cmd="$5"
  printf 'workspace: %s\nproject: %s\nrunner: %s\ntest_cmd: %s\ncoverage_cmd: %s\n\n' \
    "$workspace" "$project" "$runner" "$test_cmd" "$coverage_cmd"
}

# ---------------------------------------------------------------------------
# Node.js detection
# ---------------------------------------------------------------------------

detect_node_workspace() {
  local pkg="$1" workspace="$2"
  local script_test deps runner test_cmd coverage_cmd

  script_test=$(json_get "$pkg" .scripts.test)
  deps=$(json_get "$pkg" .devDependencies)
  local pdeps
  pdeps=$(json_get "$pkg" .dependencies)

  runner=unknown
  for r in vitest jest mocha jasmine ava tap; do
    if [[ "$deps" == *"\"$r\""* || "$pdeps" == *"\"$r\""* ]]; then
      runner=$r
      break
    fi
  done

  # node:test is built in (no dependency); detect via test script content
  if [[ "$runner" == unknown && "$script_test" == *"node --test"* ]]; then
    runner=node-test
  fi

  # Default test command preferences (in order):
  #   1. npm script "test" if it doesn't recurse into E2E
  #   2. Direct runner invocation
  if [[ -n "$script_test" && "$script_test" != *playwright* && "$script_test" != *cypress* ]]; then
    test_cmd="(cd $workspace && npm test --silent)"
  else
    case "$runner" in
      jest)      test_cmd="(cd $workspace && npx jest)";;
      vitest)    test_cmd="(cd $workspace && npx vitest run)";;
      mocha)     test_cmd="(cd $workspace && npx mocha)";;
      jasmine)   test_cmd="(cd $workspace && npx jasmine)";;
      ava)       test_cmd="(cd $workspace && npx ava)";;
      tap)       test_cmd="(cd $workspace && npx tap)";;
      node-test) test_cmd="(cd $workspace && node --test)";;
      *)         test_cmd="(cd $workspace && npm test --silent)";;
    esac
  fi

  case "$runner" in
    jest)      coverage_cmd="(cd $workspace && npx jest --coverage --coverageReporters=json-summary --coverageReporters=text)";;
    vitest)    coverage_cmd="(cd $workspace && npx vitest run --coverage --coverage.reporter=json-summary --coverage.reporter=text)";;
    mocha)     coverage_cmd="(cd $workspace && npx c8 --reporter=json-summary --reporter=text npx mocha)";;
    ava)       coverage_cmd="(cd $workspace && npx c8 --reporter=json-summary --reporter=text npx ava)";;
    node-test) coverage_cmd="(cd $workspace && node --test --experimental-test-coverage)";;
    *)         coverage_cmd="n/a";;
  esac

  emit_block "$workspace" node "$runner" "$test_cmd" "$coverage_cmd"
}

# ---------------------------------------------------------------------------
# Python detection
# ---------------------------------------------------------------------------

detect_python_workspace() {
  local workspace="$1"
  local runner=unknown
  local test_cmd coverage_cmd

  if [[ -f "$workspace/pytest.ini" || -f "$workspace/pyproject.toml" ]]; then
    if grep -q -E '^\[tool\.pytest|^\[pytest\]' "$workspace/pyproject.toml" 2>/dev/null \
       || [[ -f "$workspace/pytest.ini" ]]; then
      runner=pytest
    fi
  fi
  if [[ "$runner" == unknown ]] && find "$workspace" -maxdepth 3 -name 'test_*.py' -not -path '*/node_modules/*' -not -path '*/.venv/*' -not -path '*/venv/*' 2>/dev/null | head -1 | grep -q .; then
    runner=pytest
  fi
  if [[ "$runner" == unknown ]] && find "$workspace" -maxdepth 3 -name 'test*.py' 2>/dev/null | head -1 | grep -q .; then
    runner=unittest
  fi

  case "$runner" in
    pytest)
      test_cmd="(cd $workspace && pytest -q)"
      if command -v pytest >/dev/null 2>&1 && pytest --help 2>/dev/null | grep -q -- --cov; then
        coverage_cmd="(cd $workspace && pytest --cov --cov-report=json --cov-report=term -q)"
      else
        coverage_cmd="n/a (install pytest-cov)"
      fi
      ;;
    unittest)
      test_cmd="(cd $workspace && python -m unittest discover -v)"
      coverage_cmd="(cd $workspace && coverage run -m unittest discover && coverage report && coverage json)"
      ;;
    *) test_cmd="(cd $workspace && pytest -q)"; coverage_cmd="n/a";;
  esac

  emit_block "$workspace" python "$runner" "$test_cmd" "$coverage_cmd"
}

# ---------------------------------------------------------------------------
# Go detection
# ---------------------------------------------------------------------------

detect_go_workspace() {
  local workspace="$1"
  emit_block "$workspace" go gotest \
    "(cd $workspace && go test ./...)" \
    "(cd $workspace && go test ./... -coverprofile=/tmp/refresh-tests.cover && go tool cover -func=/tmp/refresh-tests.cover)"
}

# ---------------------------------------------------------------------------
# Rust detection
# ---------------------------------------------------------------------------

detect_rust_workspace() {
  local workspace="$1"
  local coverage_cmd="n/a (install cargo-tarpaulin or cargo-llvm-cov)"
  if command -v cargo-tarpaulin >/dev/null 2>&1; then
    coverage_cmd="(cd $workspace && cargo tarpaulin --out Json --output-dir /tmp)"
  elif command -v cargo-llvm-cov >/dev/null 2>&1; then
    coverage_cmd="(cd $workspace && cargo llvm-cov --json --output-path /tmp/refresh-tests-cov.json)"
  fi
  emit_block "$workspace" rust cargotest \
    "(cd $workspace && cargo test --quiet)" \
    "$coverage_cmd"
}

# ---------------------------------------------------------------------------
# Ruby detection
# ---------------------------------------------------------------------------

detect_ruby_workspace() {
  local workspace="$1"
  local runner=unknown test_cmd coverage_cmd
  if [[ -d "$workspace/spec" ]] || grep -q "rspec" "$workspace/Gemfile" 2>/dev/null; then
    runner=rspec
    test_cmd="(cd $workspace && bundle exec rspec)"
    coverage_cmd="(cd $workspace && COVERAGE=true bundle exec rspec) # requires simplecov in spec_helper"
  else
    runner=minitest
    test_cmd="(cd $workspace && bundle exec rake test)"
    coverage_cmd="n/a (configure simplecov in test_helper)"
  fi
  emit_block "$workspace" ruby "$runner" "$test_cmd" "$coverage_cmd"
}

# ---------------------------------------------------------------------------
# PHP detection
# ---------------------------------------------------------------------------

detect_php_workspace() {
  local workspace="$1"
  emit_block "$workspace" php phpunit \
    "(cd $workspace && vendor/bin/phpunit)" \
    "(cd $workspace && vendor/bin/phpunit --coverage-text --coverage-clover=/tmp/clover.xml)"
}

# ---------------------------------------------------------------------------
# Java / Kotlin detection
# ---------------------------------------------------------------------------

detect_java_workspace() {
  local workspace="$1"
  if [[ -f "$workspace/pom.xml" ]]; then
    emit_block "$workspace" java junit \
      "(cd $workspace && mvn -q test)" \
      "(cd $workspace && mvn -q test jacoco:report)"
  else
    emit_block "$workspace" java gradle \
      "(cd $workspace && ./gradlew test)" \
      "(cd $workspace && ./gradlew test jacocoTestReport)"
  fi
}

# ---------------------------------------------------------------------------
# .NET detection
# ---------------------------------------------------------------------------

detect_dotnet_workspace() {
  local workspace="$1"
  emit_block "$workspace" dotnet xunit \
    "(cd $workspace && dotnet test --nologo)" \
    "(cd $workspace && dotnet test --nologo --collect:'XPlat Code Coverage')"
}

# ---------------------------------------------------------------------------
# Discovery loop
# ---------------------------------------------------------------------------

# Find every package.json (Node), pyproject.toml/setup.py (Python), go.mod (Go),
# Cargo.toml with [package] (Rust), Gemfile (Ruby), composer.json (PHP),
# pom.xml/build.gradle (Java), *.csproj (.NET).
#
# Skip nested workspaces inside a parent that we already processed (e.g., monorepo
# packages already represented by a top-level workspace declaration). For
# simplicity we report ALL detectable workspaces; the caller picks which to audit.

found_any=0

# Node.js — every package.json that has a "test" script or a known test runner devDep.
while IFS= read -r pkg; do
  ws=$(dirname "$pkg")
  ws="${ws#./}"
  [[ "$ws" == "." ]] && ws="."
  has_test=$(json_get "$pkg" .scripts.test)
  dev=$(json_get "$pkg" .devDependencies)
  prod=$(json_get "$pkg" .dependencies)
  if [[ -n "$has_test" \
     || "$dev" == *"\"jest\""* || "$dev" == *"\"vitest\""* || "$dev" == *"\"mocha\""* \
     || "$dev" == *"\"jasmine\""* || "$dev" == *"\"ava\""* || "$dev" == *"\"tap\""* \
     || "$prod" == *"\"jest\""*  || "$prod" == *"\"vitest\""* ]]; then
    detect_node_workspace "$pkg" "$ws"
    found_any=1
  fi
done < <(eval "find . -type d \\( $PRUNE \\) -prune -o -type f -name 'package.json' -print")

# Python
while IFS= read -r marker; do
  ws=$(dirname "$marker"); ws="${ws#./}"; [[ "$ws" == "." ]] && ws="."
  detect_python_workspace "$ws"
  found_any=1
done < <(eval "find . -type d \\( $PRUNE \\) -prune -o -type f \\( -name 'pyproject.toml' -o -name 'pytest.ini' -o -name 'setup.py' \\) -print" | sort -u)

# Go
while IFS= read -r marker; do
  ws=$(dirname "$marker"); ws="${ws#./}"; [[ "$ws" == "." ]] && ws="."
  detect_go_workspace "$ws"
  found_any=1
done < <(eval "find . -type d \\( $PRUNE \\) -prune -o -type f -name 'go.mod' -print")

# Rust
while IFS= read -r marker; do
  # Skip workspace member Cargo.toml that lacks [package] (workspace-only)
  if grep -q '^\[package\]' "$marker" 2>/dev/null; then
    ws=$(dirname "$marker"); ws="${ws#./}"; [[ "$ws" == "." ]] && ws="."
    detect_rust_workspace "$ws"
    found_any=1
  fi
done < <(eval "find . -type d \\( $PRUNE \\) -prune -o -type f -name 'Cargo.toml' -print")

# Ruby
while IFS= read -r marker; do
  ws=$(dirname "$marker"); ws="${ws#./}"; [[ "$ws" == "." ]] && ws="."
  detect_ruby_workspace "$ws"
  found_any=1
done < <(eval "find . -type d \\( $PRUNE \\) -prune -o -type f -name 'Gemfile' -print")

# PHP
while IFS= read -r marker; do
  ws=$(dirname "$marker"); ws="${ws#./}"; [[ "$ws" == "." ]] && ws="."
  detect_php_workspace "$ws"
  found_any=1
done < <(eval "find . -type d \\( $PRUNE \\) -prune -o -type f -name 'composer.json' -print")

# Java — dedupe per workspace dir. A dir with both pom.xml and build.gradle
# (hybrid build) emits only one block; detect_java_workspace prefers Maven.
# (Use sort -u on dirs instead of associative array — bash 3.2 compat.)
while IFS= read -r ws; do
  detect_java_workspace "$ws"
  found_any=1
done < <(eval "find . -type d \\( $PRUNE \\) -prune -o -type f \\( -name 'pom.xml' -o -name 'build.gradle' -o -name 'build.gradle.kts' \\) -print" \
  | while IFS= read -r m; do d=$(dirname "$m"); echo "${d#./}"; done \
  | sort -u)

# .NET
while IFS= read -r marker; do
  ws=$(dirname "$marker"); ws="${ws#./}"; [[ "$ws" == "." ]] && ws="."
  detect_dotnet_workspace "$ws"
  found_any=1
done < <(eval "find . -type d \\( $PRUNE \\) -prune -o -type f -name '*.csproj' -print")

if [[ "$found_any" == 0 ]]; then
  emit_block "." unknown unknown "n/a" "n/a"
  echo "no recognised project manifest found in $ROOT" >&2
fi
