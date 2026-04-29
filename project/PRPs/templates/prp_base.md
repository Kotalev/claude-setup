name: "Base PRP Template v3 — Context-Rich with Validation Loops"
description: |
  Copy this template when creating a new feature PRP. Fill every section;
  mark inapplicable sections `N/A — {reason}` rather than deleting them.

  Kept in sync with `.claude/skills/prp-workflow/assets/prp_base_template.md`.

## Core Principles
1. **Context is King** — include every doc URL, file path, and snippet the executor will need.
2. **Validation Gates** — every PRP ships with executable commands for syntax, unit tests, and integration/manual checks.
3. **Dynamic Specialists** — name agents based on touched paths, not defaults.

---

## Goal

<one paragraph — concrete, measurable end state>

## Why

- Business value / user impact:
- Integration with existing features:
- Problems this solves and for whom:

## What

<user-visible behavior + technical requirements>

### Success Criteria

- [ ] <measurable outcome 1>
- [ ] <measurable outcome 2>

### Non-Goals

- <scope boundaries to prevent drift>

---

## All Needed Context

### Documentation & References

```yaml
# MUST READ — include in the executor's context
- url: <https://example.com/docs#section>
  why: <what the executor needs from this section>

- file: <path/to/file.ext>
  lines: <start>-<end>
  why: <pattern to copy or gotcha to avoid>

- doc: <library docs url>
  section: <specific anchor>
  critical: <one-line insight>
```

### Current Codebase Landmarks

- `<relevant file>:<line>` — <why it matters>
- `<relevant CLAUDE.md or rule file>` — <section that governs this area>

### Domain Terms

<pull from the project's CLAUDE.md if not already known to the executor>

---

## Known Gotchas

Project-specific landmines the executor WILL hit if not warned. Populate from the host project's `CLAUDE.md`, `.claude/rules/*.md`, and any architectural docs:

- <rule or convention #1 — link to the source doc>
- <rule or convention #2 — link to the source doc>
- <library-specific quirk #1>
- <library-specific quirk #2>

---

## Implementation Blueprint

### Pseudocode

```
<high-level flow, before any real code>
```

### Data / Schema Changes (if any)

- <schema / model / data format change>

### Task List (execute in order)

1. **<task 1>** — file: `<path>`, change: `<what>`, validate: `<command>`
2. **<task 2>** — …
3. **<task 3>** — …

### Error-Handling Strategy

- <what to do on failure modes specific to this feature>

---

## Suggested Specialist Agents

Match each touched path to a specialist using the project's agent-delegation scheme (commonly `.claude/rules/agent-delegation.md`). If the project pins a specific model for agent calls, note it here.

| Touched path | Specialist |
|--------------|-----------|
| `<path>` | `<agent>` |
| `<path>` | `<agent>` |

If the project mandates a security review for sensitive changes, add the relevant security agent. If the project mandates a final code review, name the reviewer and the required score threshold.

---

## Validation Loop

### Level 1 — Syntax / Types

```bash
<command — e.g., the project's lint/format/typecheck>
```

### Level 2 — Unit Tests

```bash
<command — e.g., the project's unit-test runner filtered to the touched modules>
```

### Level 3 — Integration / Manual

```bash
<command or manual/browser/MCP steps>
```

Success criteria per level:

- **Level 1**: zero errors, zero warnings introduced.
- **Level 2**: all new tests pass; no regressions in existing tests.
- **Level 3**: <specific behavior visible in browser / API response / log output>.

---

## Final Validation Checklist

- [ ] All validation levels green.
- [ ] Unit tests cover happy path + error paths + boundaries.
- [ ] Any mandated code review passes the project's threshold.
- [ ] No secrets / credentials added.
- [ ] Audit logging added for security-relevant actions (if the project requires it).
- [ ] No forbidden git commands were used.
- [ ] PRP re-read; every "Success Criteria" checkbox is met.

---

## Anti-Patterns to Avoid

- ❌ Creating new patterns when existing ones work.
- ❌ Skipping validation because "it should work".
- ❌ Hardcoding constants observed in a single test fixture.
- ❌ Blanket-invoking a fixed set of default agents when the task doesn't match.
- ❌ Catching all exceptions — be specific.
- ❌ Bypassing security/process rules defined by the host project.

---

## Confidence Score

**N/10** — <one-sentence justification. Score 9–10 only when context is exhaustive and patterns are already proven in-repo.>
