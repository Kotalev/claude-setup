# Doc templates

Markdown templates for every category produced by `refresh-docs`. All templates are **starting points** — fill them with facts derived from the actual repo. Never leave placeholder text (`<…>`) in the final output.

## Conventions

- **Tone**: factual, present tense, second person ("you") for guides, third person for reference.
- **Length**: per-file budget ≤ 500 lines. Split into a sub-file under the same folder if exceeded.
- **Heading depth**: `#` (title) only once at the top; sections start at `##`.
- **Code blocks**: always tag the language (` ```bash`, ` ```ts`, ` ```json`).
- **Links**: relative within `documentation/`; absolute (`/services/api/src/...`) when pointing at source code.
- **Tables of contents**: only for files >150 lines. Auto-generate from `##` headings.
- **No invented facts**: if the answer is not in the code or manifests, write `_TBD — verify with the team._` rather than guessing.

## Manual-keep markers

Wrap any section the skill must never overwrite:

```markdown
<!-- manual:keep -->
This section is hand-written and should not be regenerated.
<!-- /manual:keep -->
```

`refresh-docs` preserves everything between these markers verbatim across runs.

---

## Template — `documentation/README.md` (index)

```markdown
# <Project Name> documentation

_Generated and maintained by the `refresh-docs` skill. Last sync: <ISO timestamp>._

## Quick start

- **Setup**: [guides/setup.md](guides/setup.md)
- **Architecture overview**: [architecture/overview.md](architecture/overview.md)
- **Glossary**: [reference/glossary.md](reference/glossary.md)

## Contents

### Architecture
- [Overview](architecture/overview.md) — components, responsibilities, boundaries.
- [Data flow](architecture/data-flow.md) — request lifecycle and data path.

### Modules
- [<module-1>](modules/<module-1>.md) — <one-line purpose>.
- [<module-2>](modules/<module-2>.md) — <one-line purpose>.

### Guides
- [Setup](guides/setup.md) — local development environment.
- [Development](guides/development.md) — day-to-day workflow.
- [Deployment](guides/deployment.md) — release pipeline. _(if applicable)_
- [Testing](guides/testing.md) — running and writing tests. _(if applicable)_

### Reference
- [API](reference/api.md) — HTTP/RPC surface. _(if applicable)_
- [Configuration](reference/configuration.md) — env vars and config files.
- [Database](reference/database.md) — schema and migrations. _(if applicable)_
- [Glossary](reference/glossary.md) — domain terms.

## Related root-level docs

- [README.md](../README.md) — project overview and install.
- [CLAUDE.md](../CLAUDE.md) — agent instructions. _(if present)_
- [CONTRIBUTING.md](../CONTRIBUTING.md) — contribution guidelines. _(if present)_
- [CHANGELOG.md](../CHANGELOG.md) — release history. _(if present)_
```

Trim sections whose target files do not exist. Never link to a missing file.

---

## Template — `architecture/overview.md`

```markdown
# Architecture overview

## What this project is

<2–4 sentences: what it does, who uses it, the primary value proposition. Derive from root README/package.json description; ask if missing.>

## Components

| Component | Responsibility | Tech | Source |
|-----------|----------------|------|--------|
| <name> | <one-line purpose> | <language/framework> | [`<path>/`](/path/) |

## Boundaries

Describe the major boundaries between components: process boundaries, network boundaries, persistence boundaries, trust boundaries.

## High-level diagram

<!-- See references/mermaid-patterns.md for the architecture-overview recipe. Include only if Mermaid was opted-in during this run. -->

```mermaid
flowchart LR
  …
```

## Cross-cutting concerns

- **Auth**: <where it lives, who enforces it>
- **Logging / observability**: <library, sinks>
- **Configuration**: see [reference/configuration.md](../reference/configuration.md).
- **Security boundaries**: <input validation, output sanitization, audit logging — pull from CLAUDE.md / security rules>

## Decisions worth knowing

Short list of non-obvious architectural choices and the reason. One bullet per decision. Cite source (commit, doc, ADR) when possible.
```

---

## Template — `architecture/data-flow.md`

```markdown
# Data flow

## Primary request lifecycle

<Describe the happy-path request from entry to response. List each hop. Include error paths only if non-obvious.>

## Sequence diagram

```mermaid
sequenceDiagram
  …
```

## Persistence

| Store | Used for | Schema location |
|-------|----------|-----------------|
| <name> | <purpose> | <link> |

## Background work

List async/queued work (jobs, cron, workers). For each: trigger, queue, handler, retry policy.

## Failure modes

For each major failure mode: what triggers it, how it's surfaced, recovery steps.
```

---

## Template — `modules/<name>.md`

```markdown
# <Module Name>

## Purpose

<1–2 sentences. Why does this module exist? What problem does it solve?>

## Public API

What the rest of the codebase imports from this module. Tables work well:

| Symbol | Kind | Description |
|--------|------|-------------|
| `doFoo` | function | … |
| `BarService` | class | … |

## Internal layout

```
<path>/
├── <entry>.ts
├── …
```

Brief one-line per top-level file or sub-folder.

## Dependencies

- **Upstream** (this module imports): <list>
- **Downstream** (importers of this module): <list> _(may be incomplete; run a grep to verify)_

## Notable behaviors

Edge cases, performance characteristics, threading/concurrency notes, side effects.

## Tests

- **Location**: <path>
- **Run**: `<command>`
- **Coverage gaps**: <if relevant>
```

---

## Template — `guides/setup.md`

```markdown
# Setup

## Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| <tool> | <version> | <reason> |

Pull versions from `engines` (Node), `python_requires`, `rust-version`, `go.mod`, etc. If unspecified, write `_TBD_` and ask.

## Install

```bash
<install commands derived from package manager>
```

## Environment variables

See [reference/configuration.md](../reference/configuration.md). Minimum required to boot:

| Variable | Example | Notes |
|----------|---------|-------|
| `<NAME>` | `<example>` | <required/optional> |

## Run locally

```bash
<dev command from package.json scripts / Makefile / justfile>
```

Default URLs / ports if applicable.

## Verify

```bash
<a quick smoke command — health check, version flag, sample request>
```

## Common setup issues

Only include if the repo already documents them somewhere (root README, CONTRIBUTING, troubleshooting). Do not invent.
```

---

## Template — `guides/development.md`

```markdown
# Development workflow

## Daily commands

| Task | Command |
|------|---------|
| Run dev server | `<cmd>` |
| Run tests | `<cmd>` |
| Lint | `<cmd>` |
| Format | `<cmd>` |
| Type check | `<cmd>` |
| Build | `<cmd>` |

Pull from `package.json scripts`, `Makefile`, `justfile`, `Taskfile.yml`. Skip rows where no command is defined.

## Branching and commits

<Pull from CONTRIBUTING.md, CLAUDE.md rules, or git history if there's an obvious convention; otherwise omit this section.>

## Code style

- Linter: <tool + config file>
- Formatter: <tool + config file>
- Style guide: <link if any>

## Editor setup

Mention only if the repo ships `.vscode/`, `.idea/`, or `.editorconfig`. Reference those, do not duplicate.
```

---

## Template — `guides/deployment.md`

```markdown
# Deployment

## Environments

| Environment | URL | Branch | Notes |
|-------------|-----|--------|-------|
| dev | … | … | … |
| staging | … | … | … |
| production | … | … | … |

Only include rows you can verify from CI config / infra files / repo docs.

## Build

```bash
<release build command>
```

Output artifacts: <list paths/sizes if known>.

## Release pipeline

<Pull from .github/workflows, .gitlab-ci.yml, Jenkinsfile, etc. Describe the trigger → stages → deploy chain.>

## Rollback

<If documented anywhere in the repo, surface it. Otherwise: `_TBD — verify rollback procedure with the team._`>

## Infrastructure

| Layer | Tool | Source |
|-------|------|--------|
| Containers | Dockerfile | <path> |
| Orchestration | Kubernetes / Compose / … | <path> |
| IaC | Terraform / Pulumi / Helm | <path> |
| CDN / hosting | <platform> | <if known> |
```

---

## Template — `guides/testing.md`

```markdown
# Testing

## Test layout

| Suite | Runner | Location | Run command |
|-------|--------|----------|-------------|
| Unit | <runner> | <path> | <cmd> |
| Integration | <runner> | <path> | <cmd> |
| E2E | <runner> | <path> | <cmd> |

## Conventions

- Naming: <pattern, e.g. `*.test.ts`, `test_*.py`>
- Fixtures/mocks: <location, conventions>
- Coverage target: <if defined in config>

## Writing a new test

Minimal example for the most common test type in this project. One example only — link to existing tests for variations.

## CI

The test suite runs in <CI tool> on <events>. See `<workflow file>`.
```

---

## Template — `reference/api.md`

```markdown
# API reference

<Source: OpenAPI spec / route discovery. Cite the source.>

## Conventions

- Base URL: `<>`
- Auth: `<bearer / cookie / none>`
- Content type: `<application/json>`
- Error format: `<schema>`

## Endpoints

For each endpoint:

### `<METHOD> /<path>`

- **Purpose**: <one line>
- **Auth**: <required / optional>
- **Path params**: <table or "none">
- **Query**: <table or "none">
- **Body**: <schema / "none">
- **Response 2xx**: <schema>
- **Errors**: <list>
- **Source**: [`<path>:<line>`](<link>)

If the project has an OpenAPI spec, prefer linking to it and only document non-obvious behavior here.
```

---

## Template — `reference/configuration.md`

```markdown
# Configuration

## Environment variables

Source: `.env.example` (and any other env-var documentation in the repo).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `<NAME>` | yes/no | <default or "—"> | <purpose> |

## Config files

| File | Purpose | Format | Notes |
|------|---------|--------|-------|
| `<path>` | <purpose> | <yaml/json/toml> | <notes> |

## Runtime overrides

CLI flags, query strings, headers that override config. Document only if such mechanisms exist.
```

---

## Template — `reference/database.md`

```markdown
# Database

## Engine

<MySQL 8 / Postgres 15 / SQLite / …> — pulled from compose file or migration tool config.

## Schema

Either embed an ER diagram (Mermaid `erDiagram`) or link to the schema source:

```mermaid
erDiagram
  …
```

## Migrations

- **Tool**: <Prisma / Alembic / Flyway / sqitch / …>
- **Location**: `<path>`
- **Run**: `<cmd>`
- **Rollback**: `<cmd or "—">`

## Conventions

Naming, indexing, soft-delete behavior, timestamps — only if there's an obvious pattern.
```

---

## Template — `reference/glossary.md`

```markdown
# Glossary

Domain terms used across the codebase. Seed from `CLAUDE.md` if a "Domain Terms" section exists; otherwise extract from naming patterns.

| Term | Meaning |
|------|---------|
| <term> | <one-line definition> |

Keep entries short. Link to deeper docs from a definition when one exists.
```

---

## Template — `guides/troubleshooting.md` (opt-in)

```markdown
# Troubleshooting

## Common issues

For each issue: symptom, likely cause, resolution. Group by area (setup, runtime, deployment).

## Logs and diagnostics

Where to find logs, how to enable verbose output, key log lines to look for.

## Getting help

Where to escalate (channel, person, on-call rotation) — only if documented somewhere in the repo.
```

---

## Template — `documentation/.meta/README.md`

```markdown
# .meta — refresh-docs internal state

Files in this folder are managed by the `refresh-docs` skill. Do not edit by hand.

- `last-sync.json` — git commit hash and per-file last-updated timestamps. Used to detect drift on the next run.

If you delete this folder, the next `refresh-docs` run will treat the repository as freshly documented and may re-generate every file.
```
