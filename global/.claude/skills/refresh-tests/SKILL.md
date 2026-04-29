---
name: refresh-tests
description: Audit a project's unit and integration test suite. Detects the test runner per workspace, inventories existing tests (excluding E2E/load/Cypress/Playwright), runs the suite, classifies failures as stale-test vs likely-bug using a git-history heuristic, checks coverage, and recommends improvements interactively. Multi-language: Node.js (Jest/Vitest/Mocha/Ava/Tap/node:test), Python (pytest/unittest), Go, Rust, Ruby (RSpec/Minitest), PHP (PHPUnit), Java/Kotlin (JUnit), .NET (xUnit). Use when the user runs /refresh-tests or asks to "review tests", "audit test coverage", "find stale tests", "find broken tests", "check the test suite", or "what tests are missing".
---

# refresh-tests

A guided audit of the current project's unit and integration test suite. Detects test runners across all workspaces, runs the suite, classifies failures (stale test vs real bug via git heuristic), checks coverage, and recommends improvements — all interactively.

## Trigger

`/refresh-tests` or any request to audit / refresh / review the project's tests, test coverage, broken tests, or stale tests.

## Scope

- **In scope**: unit tests, integration tests, the project's primary test runner per workspace.
- **Out of scope**: E2E tests (Playwright, Cypress, Selenium, WebDriver), load tests (k6, Artillery), performance benchmarks, Storybook stories, manual test scripts. See `references/e2e-exclusions.md` for the complete exclusion catalog.

## Operating principle

**Interactive, never destructive.** Every fix goes through `AskUserQuestion`. Communication with the user is in Bulgarian (per global preference); code/test content stays in English.

Constraints:
- No destructive git ops (no `stash`, `checkout .`, `restore`, `reset --hard`, `clean -f`, branch deletion).
- One question at a time during interactive phases.
- Read before edit.
- **Ask before edit** — never modify any file (test, source, config, package manifest) without first showing the proposed diff via `AskUserQuestion` and getting explicit confirmation. The user reviews and commits all changes.
- Project scope only — never modify `~/.claude/`.
- Never install npm/pip/etc. packages without explicit confirmation showing the package list and config diff first.

## Workflow

Use `TaskCreate` / `TaskUpdate` to track progress through these phases.

### Phase 0 (optional) — Dry-run / fast audit

Skip Phase 0 unless the user asks for "fast", "dry-run", "quick check", or refuses to wait for full test execution. Otherwise go straight to Phase 1.

In dry-run mode:
1. Run `scripts/detect-project.sh` (Phase 1) and `scripts/inventory-tests.sh --summary` (Phase 2 with summary flag).
2. Pipe the test list directly into `scripts/classify-failures-batch.sh <repo-root>` — this gives one git-history verdict per test file without running the suite.
3. Surface tests where `verdict: likely_stale` (source modified > 1 day after test) as the audit output. Skip Phases 3-5 entirely.
4. Report: "Fast mode used — N stale candidates found via git history. Run `/refresh-tests` (full mode) to also run the suite and check coverage."

Dry-run is fast (seconds) but only catches the stale-test signal; it cannot find real bugs or coverage gaps.

### Phase 1 — Detect project type and test runners

1. Determine repo root: `git rev-parse --show-toplevel`. If not in a git repo, abort and tell the user (the stale-vs-bug heuristic needs git history).
2. Run `scripts/detect-project.sh <repo-root>`. Each detected workspace produces a block:
   ```
   workspace: <relative path>
   project: node|python|go|rust|ruby|php|java|dotnet|unknown
   runner: jest|vitest|mocha|...|unknown
   test_cmd: <shell command>
   coverage_cmd: <shell command or "n/a">
   ```
3. If multiple workspaces are detected (monorepo), present them via `AskUserQuestion`:
   - Single-select: "Audit which workspace?" with one option per workspace plus "All workspaces (sequential)"
   - For very large repos (>5 workspaces), default to asking — running everything is slow.
4. If `runner: unknown` for a workspace, ask the user for the test command before continuing.
5. Read `references/runners-matrix.md` to interpret the runner names and look up coverage flags / failure parsing rules for each.

### Phase 2 — Inventory existing tests (excluding E2E)

For each chosen workspace, run `scripts/inventory-tests.sh <workspace> <project-type>`:
- Stdout starts with `count: N` followed by N test file paths.
- Stderr lists every excluded file as `excluded:e2e <path>` for visibility — share counts with the user but don't dump all paths unless asked.

Branching:
- **`count: 0`** → No tests. Read `references/recommendations.md` for the project type. Skip Phases 3-5; jump to Phase 6 with "no tests; recommend setup".
- **`count > 0`** → Continue to Phase 3.

### Phase 3 — Run the test suite

Execute the workspace's `test_cmd` from Phase 1. Capture:
- Exit code
- Total / passed / failed / skipped counts
- Per-test failure messages

Use `references/runners-matrix.md` to parse failure output for each runner (Jest, Vitest, etc. all format failures differently).

If the test command times out (default Bash timeout is 2 min), re-run with a longer timeout (use the `timeout` parameter on `Bash` — up to 600000ms). Tell the user the suite is slow as you do this.

If exit code is 0 (all passed): record this and skip Phase 4.

### Phase 4 — Classify each failure (stale test vs real bug)

For each failing test file (deduplicate — one classification per test file even if multiple tests in it failed), use the **batch script** for performance:
```
echo -e "test1.js\ntest2.js" | scripts/classify-failures-batch.sh <repo-root>
```
This makes a single `git log` call instead of one per test — much faster for >10 failures. The single-test variant `scripts/classify-failure.sh <test-file> <repo-root>` is still available for one-off investigations.

Optionally pipe the test runner's stdout through `scripts/parse-failures.sh <runner>` first to extract a unified failure list (file/test/kind/message) before classification.

Output:
```
test: <path>
source: <inferred source path or "unknown">
verdict: likely_stale | likely_bug | ambiguous | no_history
test_last_commit: <ISO-8601>
source_last_commit: <ISO-8601>
delta_seconds: <int>
notes: <one-liner>
```

Aggregate failures into three groups by verdict.

The git heuristic alone is not enough — also inspect failure messages from Phase 3 for stronger signals:
- `TypeError: ... is not a function` → API change → bias toward `likely_stale`
- `Cannot find module '...'` → import path moved → bias toward `likely_stale`
- Snapshot mismatch (`toMatchSnapshot` failure) → snapshot drift → `likely_stale` (rerun with `-u` after confirmation)
- Assertion mismatch on simple primitives (`expected 5 to equal 6`) → could be either; rely on git verdict
- New test file added but production code unchanged → `likely_bug` (test was written to pin newly-discovered behaviour)

### Phase 5 — Coverage analysis

If Phase 3 succeeded (or partially succeeded) AND `coverage_cmd != "n/a"`, run the coverage command, then pipe the report through `scripts/parse-coverage.sh <runner> <report-path>` for a unified per-file breakdown:
- **json-summary** (Jest/Vitest/c8): `scripts/parse-coverage.sh jest coverage/coverage-summary.json`
- **pytest-cov json**: `scripts/parse-coverage.sh pytest coverage.json`
- **Go**: `go tool cover -func=cover.out > /tmp/cov.txt && scripts/parse-coverage.sh go /tmp/cov.txt`
- **JaCoCo XML**: `scripts/parse-coverage.sh jacoco target/site/jacoco/jacoco.xml`
- **Cobertura (.NET)**: `scripts/parse-coverage.sh dotnet TestResults/*/coverage.cobertura.xml`

The script outputs `<file> <stmt_pct> <branch_pct> <line_pct>` lines plus a `TOTAL` line.

Flag:
- Files with **0% coverage** that were modified in the last 30 days (`git log --since='30 days ago' --name-only`)
- Files with **<60% statement coverage** (configurable; tell the user the threshold)
- Source files with no detectable test pair (use the inverse of `classify-failure.sh`'s source-inference rules)

If the coverage tool is not installed (e.g. Vitest needs `@vitest/coverage-v8`), do NOT auto-install — surface as a finding and ask whether to add it.

### Phase 6 — Report

Print one Markdown report to the conversation (do NOT write to file unless the user asks). Sections:

```
## Test audit — <repo name>

### Summary
- Workspaces audited: N
- Total tests: N (passed: N, failed: N, skipped: N)
- Coverage: X% statements, Y% branches (if available)
- Stale candidates: N
- Likely bugs: N
- Coverage gaps: N files

### Failures
#### Likely stale (test wasn't updated when source changed)
- <test path> — source `<src>` modified <N> day(s) after test
  Failure: <truncated message>

#### Likely bug (production regression)
- <test path> — test modified <N> day(s) after source
  Failure: <truncated message>

#### Ambiguous
- <test path>
  Failure: <truncated message>

### Coverage gaps
- <file> — 0% coverage, modified <date>
- <file> — 12% coverage, modified <date>

### Recommendations (only when no tests / critical gaps)
1. ...
```

Keep messages truncated to ~200 chars per line. The full output stays in the Bash tool result; the user can ask for details.

### Phase 7 — Interactive fixes

Process findings in priority order: stale tests → coverage gaps → setup recommendations (if no tests). For each finding ask via `AskUserQuestion` with options:

**For likely_stale tests:**
- "Update test to match current source" — read both files, propose minimal diff, show, edit on confirm
- "Run with snapshot update" (only if snapshot failure) — re-run with `-u` flag, show diff
- "Investigate as a real bug instead" — re-classify, present source+test for user review
- "Skip"

**For likely_bug tests:**
- "Show test + source for investigation" — present both files and the failure message; the user decides on a fix (do NOT silently change test or source)
- "Skip"

**For coverage gaps:**
- "Scaffold a starter test for this file" — write a happy-path + error-path + edge-case test using the runner's idioms
  - **Before scaffolding**, read `references/test-patterns/<runner>.md` for the runner's idiomatic mock conventions, fixture patterns, and 3-test starter template. One file per runner: `jest.md`, `vitest.md`, `pytest.md`, `go.md`, `rust.md`, `rspec.md`, `phpunit.md`, `junit.md`, `xunit.md` (last one also covers NUnit).
  - For runners not listed (Mocha, Ava, Tap, node:test, Minitest), use the closest equivalent (e.g., Mocha → `jest.md` patterns adapted; Minitest → `rspec.md` bottom section).
- "Skip"

**For no-tests projects:**
- Read `references/recommendations.md` per project type
- Present the recommended setup (devDependencies + 3 starter tests) via `AskUserQuestion`:
  - "Scaffold the recommended setup"
  - "Show me what would be added (dry-run)"
  - "Skip"

Rules:
- One question at a time. Never batch unrelated fixes.
- After each applied fix, re-run only the affected test file (`npx jest <path>`, `npx vitest run <path>`, `pytest <path>`, etc.) to verify before moving on.
- Never delete a failing test without explicit confirmation; an unused/skipped test is "user-acknowledged kept" by default.
- Never `git add` / `git commit` — the user reviews and commits.

### Phase 8 — Wrap-up

Print a short summary:
- Fixes applied: N
- Findings skipped: N
- Recommendations deferred: N
- Files modified: <list>

Suggest `git diff` so the user can review. Do NOT commit, push, or run any git mutation.

## Bundled resources

- `scripts/detect-project.sh` — Phase 1 multi-language workspace and runner detection
- `scripts/inventory-tests.sh [--summary]` — Phase 2 test file inventory with E2E exclusion (--summary for first 10 only)
- `scripts/classify-failure.sh` — Phase 4 git-history heuristic for a single failing test
- `scripts/classify-failures-batch.sh` — Phase 4 batch version (single git log call for many tests; use when >10 failures)
- `scripts/parse-failures.sh` — Parse Jest/Vitest/Mocha/pytest/go/rspec/cargo stdout into a unified failure list
- `scripts/parse-coverage.sh` — Parse coverage reports (json-summary/pytest-cov/go cover/JaCoCo/Cobertura) into per-file pct lines
- `references/runners-matrix.md` — per-language test runner commands, coverage flags, failure parsing
- `references/e2e-exclusions.md` — full catalog of E2E/load test patterns to exclude
- `references/recommendations.md` — per-project-type starter test setup recommendations
- `references/test-patterns/<runner>.md` — idiomatic scaffolding patterns per runner (Jest/Vitest/pytest/Go/Rust/RSpec/PHPUnit/JUnit/xUnit). Lazy-loaded only when Phase 7 scaffolds new tests.
