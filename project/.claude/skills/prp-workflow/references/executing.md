# Executing a PRP

Implement the feature described in a PRP file, validate it, and leave the working tree in a shippable state.

## Inputs

- A path to a PRP file (usually under `PRPs/generated/`). If the user didn't pass one, ask.
- The repo in its current branch state. Respect any project-level restrictions on destructive git commands.

## Process

### 1. Load

- Read the PRP end-to-end before doing anything.
- Read every file the PRP references under *All Needed Context*.
- Fetch any referenced external docs you don't already have (MCP docs server first, then WebFetch).
- If the PRP self-score is < 6, stop and report back — the PRP is not ready for execution.

### 2. Learn the host project

Before picking agents or writing code:

- Read the root `CLAUDE.md` and any relevant service-level `CLAUDE.md`.
- Read `.claude/rules/*.md` (if present) for security posture, testing style, git restrictions, naming conventions.
- If the project defines an agent-delegation rule file (commonly `.claude/rules/agent-delegation.md`), treat it as the source of truth for specialist selection.

### 3. Pick specialist agents (dynamic)

Do **not** blanket-invoke a fixed set of agents. Instead:

1. List every path the PRP will touch.
2. For each path, look up the matching specialist in the project's delegation rules (if any). If no delegation scheme exists, prefer domain experts the project has already defined; otherwise fall back to a general-purpose agent.
3. The PRP's own "Suggested Specialist Agents" list is advisory — cross-check it against actual touched paths.
4. Follow the host project's model policy (if the project pins a specific model for agent calls, use that).

### 4. Plan

- Break the blueprint into tracked tasks (one per PRP task).
- For multi-agent work, consider a parallel-agents workflow when tasks are genuinely independent.
- Apply TDD (or the project's preferred testing discipline) for any new function or behavioral change.

### 5. Execute

- Mark each task in-progress before starting and completed only after verification — never batch.
- Prefer editing existing files over creating new ones.
- Follow the host project's conventions (forbidden operations, naming rules, shared utilities).
- Write unit tests alongside code changes per the project's testing rules.

### 6. Validate — run every level from the PRP

- **Level 1** — lint/typecheck commands from the PRP (or the project's standard commands).
- **Level 2** — unit tests for all touched modules.
- **Level 3** — integration / manual verification. For UI changes, drive a real browser (Playwright, Chrome DevTools MCP, or the project's preferred tool) and capture evidence.
- Fix failures, do not suppress them. Re-run until every command is green.
- Verify before claiming completion — evidence first, assertions second.

### 7. Review

If the host project mandates a code-review step (often via an `elite-code-reviewer` or similar specialist), run it and remediate until the score meets the project's threshold. Do not mark the task done below that threshold.

### 8. Close out

- Confirm every checklist item in the PRP is ticked.
- Re-read the PRP one final time to catch missed requirements.
- Report the validation commands you ran with their exit status.
- Do not create commits unless the user explicitly asks.
- Update `PRPs/INDEX.md` via the indexing workflow if the PRP's status changed.

## Common pitfalls

- ❌ Reading the PRP once and starting to code — load referenced files first.
- ❌ Calling a fixed set of default agents regardless of the task.
- ❌ Skipping integration/manual validation because "unit tests passed".
- ❌ Claiming done before the project's mandatory review step.
- ❌ Running forbidden git commands to "clean up" mid-execution.
- ❌ Merging assumptions into implementation — when unsure, ask.
