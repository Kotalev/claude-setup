# Writing a PRP

Produce a new PRP in `PRPs/generated/{kebab-case-name}.md` that a downstream agent can execute in one pass.

## Inputs

- A feature brief from the user (free text or a file path). If the user provides a file, treat its content as authoritative.
- The canonical template at [../assets/prp_base_template.md](../assets/prp_base_template.md) (or `PRPs/templates/prp_base.md` if the host project customized it). Copy its structure — do not invent a new one.
- The task-scoped variant at `PRPs/templates/prp_task.md` when the change fits the ACTION/VALIDATE/IF_FAIL/ROLLBACK pattern (single-file edits, surgical fixes).

## Decision: Feature PRP vs. Task PRP

| Signal | Pick |
|--------|------|
| Multi-file feature, new subsystem, 3+ hours of work | Feature PRP (`prp_base` template) |
| Single-file fix, config change, rename, surgical refactor | Task PRP (`prp_task` template) |
| Research/discovery only, no implementation yet | Write to `PRPs/tasks/` instead of `generated/` |

When unsure, ask the user.

## Process

### 1. Load the brief

Read the feature file or prompt carefully. Note: referenced files, domain terms (from the project's `CLAUDE.md`), explicit success criteria, explicit non-goals.

### 2. Learn the host project

- Read the root `CLAUDE.md` and any service-level `CLAUDE.md` files that cover the touched areas.
- Read any rule files under `.claude/rules/` — they define security posture, testing style, forbidden operations, naming conventions, and agent delegation.
- Note the project's validation tooling (test runner, linter, type checker) so the PRP's validation gates use the real commands.

### 3. Research — codebase

- Grep/glob for similar patterns already in the repo.
- Identify the touched paths and map each to the correct specialist (if the project defines specialists).
- Note existing conventions (naming, error handling, tests) to mirror.

### 4. Research — external

- Fetch library docs from an MCP docs server or via WebFetch when the PRP touches third-party APIs.
- Collect URLs with **specific section anchors**, not just root pages.
- Record version numbers where compat matters.

### 5. Clarify with the user (only if blocking)

Ask at most one question per round. Skip anything you can derive from the code, git history, or project docs.

### 6. Draft the PRP

Follow the structure of [../assets/prp_base_template.md](../assets/prp_base_template.md). Every section is required; if a section truly doesn't apply, write `N/A — {reason}` rather than deleting it. Key expectations:

- **Goal / Why / What** — concrete, measurable, no hand-waving.
- **All Needed Context** — URLs, file paths, snippets, version pins.
- **Known Gotchas** — library quirks and project-specific landmines (populate from `.claude/rules/` and `CLAUDE.md`).
- **Implementation Blueprint** — pseudocode + explicit task list in execution order.
- **Validation Loop** — three levels (syntax/types, unit tests, integration/manual). Every command must be copy-pasteable in the host project.
- **Anti-Patterns** — enumerate the traps specific to this change.
- **Suggested Specialist Agents** — list specialists derived from the touched paths, using whatever delegation scheme the host project defines.

### 7. Self-score

Close the PRP with a confidence score 1–10 for one-pass execution. Calibrate honestly: score 9–10 only when the context is exhaustive and patterns are already proven in-repo. Anything below 6 means the PRP is not ready — gather more context and iterate.

### 8. Write and register

- Save as `PRPs/generated/{kebab-case-name}.md` (or `PRPs/tasks/{name}.md` for research).
- Trigger the indexing workflow (see [indexing.md](indexing.md)) — or tell the user to run it — so `PRPs/INDEX.md` stays current.

## Quality Checklist (must all be true)

- [ ] All sections from the template are present.
- [ ] Every external reference has a specific URL + section anchor + one-line "why".
- [ ] Every code reference uses `file_path:line_number`.
- [ ] Validation commands are executable as-is in the host project (no placeholders).
- [ ] Gotchas section names the specific landmines from the project's rules/conventions.
- [ ] Specialist agents listed are justified by file paths, not guessed.
- [ ] Self-score ≥ 6 with honest reasoning.

## Anti-patterns

- ❌ Copy-pasting the brief into the PRP without adding codebase context.
- ❌ Linking to root docs pages instead of specific sections.
- ❌ Hardcoding a fixed set of default agents regardless of what the task touches.
- ❌ Leaving validation commands as "run the tests".
- ❌ Skipping the Gotchas section because "everything will probably work".
- ❌ Scoring 9/10 without justifying why the context is exhaustive.
