# Per-Project-Type Test Setup Recommendations

When `inventory-tests.sh` returns `count: 0`, the project has no unit tests. Use this reference to recommend a sensible starter setup that matches the project's stack.

## Recommendation philosophy

1. **Default to the most popular runner** for the language/framework — minimises configuration friction and developer onboarding
2. **One runner per workspace**, not multiple competing ones
3. **Tests live next to source** when the language convention allows (`__tests__/`, `test_*.py`, `*_test.go`); otherwise a top-level `tests/` directory
4. **Coverage tooling included from day one**, even if the threshold starts at 0% — adding it later is friction
5. **CI hook suggested but not enforced** — the user's CI choice is theirs

## Node.js

| Project subtype | Recommended runner | Why |
|-----------------|-------------------|-----|
| Vite-based frontend (React/Vue/Svelte) | **Vitest** | Native Vite integration, fast, ESM-friendly |
| Webpack/CRA frontend | **Jest** | First-class React support, many examples |
| Node.js backend (Express, Fastify, NestJS) | **Jest** | Mature mocking, snapshot testing, wide community |
| Pure ESM library | **Vitest** OR **node:test** | Both ESM-native; pick node:test for zero deps |
| TypeScript library | **Vitest** | Built-in TS support, no babel/ts-jest config needed |
| Plain CommonJS package | **node:test** (built-in) OR **tap** | Minimal dependencies |

### Starter package.json scripts (Jest example)
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  },
  "jest": {
    "testEnvironment": "node",
    "coverageDirectory": "coverage",
    "coverageReporters": ["text", "json-summary", "html"]
  }
}
```

### Starter package.json scripts (Vitest example)
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0"
  }
}
```

### First test (smoke check)
Create `src/__tests__/smoke.test.js`:
```js
describe('project setup', () => {
  it('environment is wired up', () => {
    expect(1 + 1).toBe(2);
  });
});
```

## Python

| Project subtype | Recommended runner | Why |
|-----------------|-------------------|-----|
| New project | **pytest** | De facto standard, simpler syntax, fixtures |
| Strict stdlib-only | **unittest** | Built-in, no extra dependency |
| Django app | **pytest** with **pytest-django** | Better than `manage.py test` for most workflows |
| FastAPI/Flask app | **pytest** with **httpx** test client | Native async support |

### pyproject.toml additions
```toml
[tool.pytest.ini_options]
testpaths = ["tests", "src"]
python_files = ["test_*.py", "*_test.py"]

[tool.coverage.run]
source = ["src"]
omit = ["*/tests/*"]

[tool.coverage.report]
fail_under = 0  # raise as coverage grows
```

```bash
pip install pytest pytest-cov
```

## Go

Built-in `go test` is the standard. No third-party runner recommended for unit tests.

```go
// In foo_test.go (same package as foo.go)
package foo

import "testing"

func TestSmoke(t *testing.T) {
    if 1+1 != 2 {
        t.Fatal("math broken")
    }
}
```

```bash
go test ./...
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out -o coverage.html
```

For richer assertions consider `testify` (`github.com/stretchr/testify`).

## Rust

Cargo's built-in `cargo test` is the standard.

- **Unit tests**: inside `src/` files via `#[cfg(test)] mod tests { ... }`
- **Integration tests**: separate files in `tests/` directory

For coverage, install `cargo-llvm-cov`:
```bash
cargo install cargo-llvm-cov
cargo llvm-cov --html
```

## Ruby

| Style | Runner |
|-------|--------|
| Rails default | **Minitest** (built into Rails) |
| Custom Ruby app | **RSpec** (most popular) |

### RSpec setup
```bash
bundle add rspec --group development,test
bundle exec rspec --init
```

Add SimpleCov to `spec/spec_helper.rb`:
```ruby
require 'simplecov'
SimpleCov.start
```

## PHP

PHPUnit is the de facto standard.

```bash
composer require --dev phpunit/phpunit
```

`phpunit.xml`:
```xml
<phpunit>
  <testsuites>
    <testsuite name="unit">
      <directory>tests</directory>
    </testsuite>
  </testsuites>
  <coverage>
    <include>
      <directory suffix=".php">src</directory>
    </include>
  </coverage>
</phpunit>
```

## Java/Kotlin

| Build tool | Recommendation |
|------------|----------------|
| Maven | **JUnit 5** + Surefire + JaCoCo |
| Gradle | **JUnit 5** + JaCoCo plugin |

### Gradle starter (build.gradle.kts)
```kotlin
plugins {
    java
    jacoco
}

dependencies {
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.0")
}

tasks.test {
    useJUnitPlatform()
    finalizedBy(tasks.jacocoTestReport)
}
```

## .NET

xUnit is the most popular for new projects; NUnit and MSTest are also widely used.

```bash
dotnet new xunit -n MyProject.Tests
dotnet add MyProject.Tests/MyProject.Tests.csproj reference MyProject/MyProject.csproj
dotnet test --collect:"XPlat Code Coverage"
```

## What "first tests" should look like

For any language, the initial recommendation should include **three** starter tests demonstrating the patterns the project will need most:

1. **Smoke test** — proves the runner is wired up. Trivial assertion.
2. **Happy-path test** — exercises the main public function/endpoint with valid input.
3. **Error-path test** — exercises rejection of invalid input or a known failure mode.

Three tests is enough to demonstrate the pattern without overwhelming the user. Once they accept the recommendation, surface higher-priority modules (most-recently-modified untested files) as next candidates.

## When NOT to recommend

If the project type is `unknown` (no recognised manifest) or `script collection` (loose .sh files), do NOT recommend a test setup. Instead, ask the user what the deliverable is — testing strategies for arbitrary scripts vary too much for a generic recommendation.

## What to include in the AskUserQuestion prompt

When proposing a setup, present **one** of:
- "Scaffold the recommended setup (will add devDependencies + 3 starter tests)"
- "Show me what would be added (dry-run, no changes)"
- "Skip — I'll set up testing manually later"

Do NOT install packages without explicit confirmation. Show the package list and config diff before running `npm install` / `pip install` / equivalent.
