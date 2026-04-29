# Test Runners Matrix

Per-language reference for test commands, coverage flags, file conventions, and common pitfalls. Used by `refresh-tests` to interpret `detect-project.sh` output.

## Table of Contents

- [Node.js (Jest, Vitest, Mocha, Jasmine, Ava, Tap, node:test)](#nodejs)
- [Python (pytest, unittest)](#python)
- [Go (go test)](#go)
- [Rust (cargo test)](#rust)
- [Ruby (RSpec, Minitest)](#ruby)
- [PHP (PHPUnit)](#php)
- [Java/Kotlin (JUnit, Gradle)](#javakotlin)
- [.NET (xUnit, NUnit)](#net)

---

## Node.js

| Runner | Test cmd | Coverage cmd | File convention |
|--------|----------|--------------|-----------------|
| Jest | `npx jest` | `npx jest --coverage --coverageReporters=json-summary --coverageReporters=text` | `*.test.{js,ts,jsx,tsx}`, `*.spec.*`, `__tests__/*.{js,ts}` |
| Vitest | `npx vitest run` | `npx vitest run --coverage --coverage.reporter=json-summary --coverage.reporter=text` | `*.test.{js,ts}`, `*.spec.*` |
| Mocha | `npx mocha` | `npx c8 --reporter=json-summary --reporter=text npx mocha` | `test/**/*.{js,ts}` (configurable) |
| Jasmine | `npx jasmine` | `npx c8 --reporter=json-summary npx jasmine` | `spec/**/*.spec.{js,ts}` |
| Ava | `npx ava` | `npx c8 --reporter=json-summary npx ava` | `test/**/*.js`, `test.js` |
| Tap | `npx tap` | `npx tap --coverage-report=json-summary` | `test/**/*.{js,ts}` |
| node:test | `node --test` | `node --test --experimental-test-coverage` | `**/*.test.{mjs,js}` |

### Coverage report location
- Jest/Vitest with `json-summary`: `coverage/coverage-summary.json`
- c8: `coverage/coverage-summary.json`
- node --test coverage: stdout (no JSON by default)

### Common pitfalls
- **Vitest** requires `@vitest/coverage-v8` or `@vitest/coverage-istanbul` package installed
- **Jest** in monorepos may need `--config` flag pointing to the workspace's jest.config
- **Mocha** has no built-in coverage — wrap with c8 or nyc
- **node:test** coverage is experimental and output format differs by Node version

### Failure parsing
- Jest: failures appear as `FAIL <path>` followed by `● <describe> > <it>` blocks
- Vitest: failures appear as `❯ <path> > <describe> > <it>`
- Mocha: failures listed at end with `1) <describe> <it>: \n <error>`

---

## Python

| Runner | Test cmd | Coverage cmd | File convention |
|--------|----------|--------------|-----------------|
| pytest | `pytest -q` | `pytest --cov --cov-report=json --cov-report=term -q` | `test_*.py`, `*_test.py`, `tests.py` |
| unittest | `python -m unittest discover -v` | `coverage run -m unittest discover && coverage report && coverage json` | `test*.py` |

### Coverage report location
- pytest-cov with `--cov-report=json`: `coverage.json` in CWD
- coverage.py with `coverage json`: `coverage.json`

### Failure parsing
- pytest: `FAILED <path>::<class>::<method> - <reason>`
- unittest: `FAIL: <method> (<class>)` followed by traceback

### Pitfalls
- pytest needs `pytest-cov` package — fall back to `coverage` cli if missing
- unittest is built-in but discovery requires `__init__.py` files in some setups

---

## Go

| Runner | Test cmd | Coverage cmd | File convention |
|--------|----------|--------------|-----------------|
| go test | `go test ./...` | `go test ./... -coverprofile=/tmp/cover.out && go tool cover -func=/tmp/cover.out` | `*_test.go` |

### Coverage report location
- coverprofile: text format. Parse with `go tool cover -func=` for per-function summary.

### Failure parsing
- `--- FAIL: <TestName> (<duration>)` followed by indented error message
- Use `-json` flag for machine-readable output: `go test -json ./...`

### Pitfalls
- Coverage with `-coverpkg=./...` includes all packages; default only covers tested package
- Test files must be in same package as source (or `<pkg>_test` for black-box)

---

## Rust

| Runner | Test cmd | Coverage cmd | File convention |
|--------|----------|--------------|-----------------|
| cargo test | `cargo test --quiet` | `cargo tarpaulin --out Json` OR `cargo llvm-cov --json` | `tests/*.rs` (integration), `#[cfg(test)]` mod (unit) |

### Coverage tools
- `cargo-tarpaulin` (Linux only by default; works on macOS with `--engine llvm`)
- `cargo-llvm-cov` (cross-platform, recommended)
- Neither is built-in — both require `cargo install`

### Failure parsing
- `test <name> ... FAILED`
- Failure details listed at end under `failures:` section

### Pitfalls
- Inline unit tests (`#[cfg(test)] mod tests`) only run for the package they're in
- Doctests run with `cargo test --doc`; not always counted in coverage
- Integration tests in `tests/` directory each compile as separate binary

---

## Ruby

| Runner | Test cmd | Coverage cmd | File convention |
|--------|----------|--------------|-----------------|
| RSpec | `bundle exec rspec` | `COVERAGE=true bundle exec rspec` (requires SimpleCov in `spec_helper.rb`) | `*_spec.rb` |
| Minitest | `bundle exec rake test` | similar SimpleCov setup in `test_helper.rb` | `*_test.rb` |

### Coverage report location
- SimpleCov: `coverage/.last_run.json`, `coverage/index.html`

### Failure parsing
- RSpec: `Failures:` section listing each `1) <describe> <it>` with backtrace
- Minitest: `<test_name>#test_<n> = <duration> = F` + assertion failure

---

## PHP

| Runner | Test cmd | Coverage cmd | File convention |
|--------|----------|--------------|-----------------|
| PHPUnit | `vendor/bin/phpunit` | `vendor/bin/phpunit --coverage-text --coverage-clover=clover.xml` | `*Test.php` |

### Pitfalls
- Coverage requires Xdebug or PCOV PHP extension installed
- PHPUnit 10+ changed config file format

---

## Java/Kotlin

| Build tool | Test cmd | Coverage cmd | File convention |
|------------|----------|--------------|-----------------|
| Maven | `mvn -q test` | `mvn -q test jacoco:report` (requires jacoco-maven-plugin) | `*Test.java`, `*Tests.java`, `*IT.java` |
| Gradle | `./gradlew test` | `./gradlew test jacocoTestReport` | same; Kotlin: `*Test.kt` |

### Coverage report location
- JaCoCo: `target/site/jacoco/index.html` (Maven), `build/reports/jacoco/test/html/index.html` (Gradle)
- XML report: `target/site/jacoco/jacoco.xml` or `build/reports/jacoco/test/jacocoTestReport.xml`

### Failure parsing
- Surefire/Failsafe: failures in `target/surefire-reports/*.txt`
- Test name format: `<package>.<Class>.<method>`

---

## .NET

| Runner | Test cmd | Coverage cmd | File convention |
|--------|----------|--------------|-----------------|
| dotnet test | `dotnet test --nologo` | `dotnet test --collect:'XPlat Code Coverage'` | `*Tests.cs`, `*Test.cs`, `*.Tests.cs` |

### Coverage tools
- Built-in collector via `coverlet.collector` package (default in `dotnet new xunit`)
- Outputs Cobertura XML to `TestResults/<guid>/coverage.cobertura.xml`

### Failure parsing
- `Failed <test name>` with stack trace
- Use `--logger "console;verbosity=detailed"` for full output

---

## Cross-runner notes

### Coverage thresholds
- **Statements**: % of source lines executed. Most common metric.
- **Branches**: % of conditional branches taken. Catches missed `else` paths.
- **Functions**: % of functions called at least once.
- **Lines**: similar to statements but counts physical lines.

Recommended minimum thresholds for the `refresh-tests` audit:
- New/critical code: 80% statements, 70% branches
- General code: 60% statements, 50% branches
- Below 40%: flag as critical gap

### Why json-summary?
The `json-summary` reporter produces a single small JSON file with per-file totals — easy to parse without HTML scraping. Always prefer it over HTML for automated audits.
