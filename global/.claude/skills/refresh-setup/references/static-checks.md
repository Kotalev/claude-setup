# Static checks (Phase 2)

Apply every check below to the discovered set of files. Each check produces zero or more findings of the form documented in `SKILL.md`. Severities are guidance — adjust if the situation warrants.

## Table of contents

- [1. Dead references](#1-dead-references)
- [2. Duplicates](#2-duplicates)
- [3. Conflicts](#3-conflicts)
- [4. Coverage gaps](#4-coverage-gaps)
- [5. Deprecated patterns](#5-deprecated-patterns)
- [6. Frontmatter / structural integrity](#6-frontmatter--structural-integrity)

---

## 1. Dead references

For each finding, severity defaults to **high** if the dangling reference is in a behavioral rule (CLAUDE.md, rule file, agent description) and **medium** if it's in metadata (permissions, comments).

### 1.1 File-path references

In every CLAUDE.md, rule file, and agent file: extract every relative or absolute path that looks like a real file (`services/api/src/...`, `frontend/src/...`, `parsers/docx/...`, `.claude/...`). Verify each path exists in the repo (relative to repo root). Report each missing path.

Search patterns (regex, run via `Grep`):
- `[a-zA-Z][a-zA-Z0-9_./-]*\.(js|ts|tsx|jsx|md|json|sh|yml|yaml|css|py)\b`
- `(parsers|exporters|services|frontend|hooks|scripts)/[a-zA-Z0-9_./-]+`

False-positive guard: code samples inside fenced ``` ``` ``` blocks may reference paths that intentionally don't exist (illustrative). Treat fenced blocks as opt-in: only flag a path inside a fence if the surrounding prose claims the file exists.

### 1.2 Skill references

Find every `Skill(name)` permission in `.claude/settings.json` and every `Skill(name)` mention in CLAUDE.md / rule files. Compare against the live skill list (the system reminder lists currently available skills). Flag any skill name that is not in the available list — it has been uninstalled or renamed.

Common renames to watch for: `playwright-reset` → no replacement; superpowers shorthand names vs `superpowers:foo` namespaced names.

### 1.3 Agent references

In CLAUDE.md and `.claude/rules/*.md`: find every `subagent_type: "name"` and any "use the X agent" / "delegate to X" prose. Verify the agent file exists at `.claude/agents/<name>.md`. Flag misses.

### 1.4 Tool / command references

In CLAUDE.md, rule files, and hook scripts: every reference to a CLI tool, npm script, or docker compose service. Spot-check the most-mentioned ones with `which <tool>` or `grep -l "<script>" package.json`. Don't try to verify every single tool — focus on internal scripts (`./validate.sh`, `./scripts/*`, `npm run <custom-script>`).

### 1.5 URL references

Internal URLs in CLAUDE.md (e.g. `localhost:5173/editor/123`) are usually examples — do not flag. Only flag external URLs that 404 if you happen to fetch them in Phase 3 anyway.

---

## 2. Duplicates

Severity defaults to **medium** for duplicates — they're not broken, just noisy.

### 2.1 Repeated rules

Compare every pair of rule files in `.claude/rules/` for substantial paragraph-level overlap (≥3 sentences nearly identical). Likewise compare each rule file against the CLAUDE.md sections.

If found: the canonical location should be the rule file (more focused). The CLAUDE.md should reference the rule file by name, not duplicate its content. Suggest the trim.

### 2.2 Duplicate agent descriptions

Two agents whose `description:` frontmatter overlaps to the point that the harness might pick the wrong one. Read each `description` and look for:
- Same trigger keywords (e.g. two agents both saying "use when working on DOCX parsing")
- Overlapping tool affinities

If found, propose making the descriptions more specific so each one names a distinct trigger. Do not propose deleting an agent — that is a user decision.

### 2.3 Permission duplicates

In `settings.json`: literal duplicates (`Bash(npm run lint)` and `Bash(npm run:*)` overlap). Suggest collapsing to the broader pattern. Defer to the `update-config` skill for the actual edit.

### 2.4 Memory ↔ rule duplicates

If the project ships memory files (rare for project-level — memory typically lives globally), check for fact duplication between `memory/*.md` and a rule file. Flag with severity **low** — the memory file is usually the better location for time-bound facts; rules should be evergreen.

---

## 3. Conflicts

Severity defaults to **high** — conflicts cause the harness to silently pick one branch and ignore the other.

### 3.1 Direct contradictions

Pairs where one says "always X" and another says "never X" for the same X. Examples to look for:
- Test framework choice (Jest vs Vitest)
- Commit policy (auto-commit vs never-commit)
- Branch policy (push allowed vs forbidden)
- Mock policy (mock DB allowed vs forbidden)

Read every rule file and CLAUDE.md, build a list of "always/never" / "must/must not" / "allowed/forbidden" statements, then compare.

### 3.2 Drifted nominal facts

CLAUDE.md says project uses MySQL but a rule file or sub-CLAUDE.md still references PostgreSQL (or vice versa). Same for Redis vs Memcached, Docker vs PM2, etc.

Read every CLAUDE.md and grep for "MySQL", "PostgreSQL", "Redis", "Docker", "PM2", "pCloud", "S3" — compare what each file claims is the canonical choice.

### 3.3 Rule-of-rules conflicts

The most insidious: a global rule (CLAUDE.md) says "always use X" but a project rule file says "never use X" because of a project-specific reason. The conflict may be intentional — the project overrides the global. In that case, the project rule should explicitly note "this overrides the global rule on X". If not noted, flag it as **medium** with a suggestion to add the explicit override note.

---

## 4. Coverage gaps

Severity defaults to **low** — gaps are improvements, not bugs.

### 4.1 Sub-modules without CLAUDE.md

For each top-level source directory (e.g. `frontend/`, `services/api/`, `services/worker/`, `services/collaboration/`, `parsers/`, `exporters/`): if it has substantial code (≥10 source files) but no `CLAUDE.md`, suggest adding one. The CLAUDE.md template is small — point at the `init` skill (`/init`) if available.

### 4.2 Missing common safety rules

A project without any of the following patterns in its rule files probably wants them. Flag missing ones with severity **low** + suggestion to add (do not auto-create — let the user decide):
- Git command restrictions (no force-push, no stash, no reset --hard) — especially for parallel-instance setups
- Security rules (no exec, sanitize inputs)
- Test rules (mandatory unit tests for new code)
- A `redis-key-prefix` (or similar namespacing) rule if the project uses Redis
- Code-review rule (e.g. mandatory `elite-code-reviewer` after implementation)

### 4.3 Empty deny list in settings.json permissions

If `permissions.deny` is an empty array, suggest adding entries for clearly-dangerous commands the project never wants to run (e.g. `Bash(rm -rf /*)`, `Bash(git push --force origin main)`, `Bash(git push --force origin master)`).

### 4.4 Missing hooks

Common useful hooks the project might not have set up:
- `SessionStart` hook to inject project state (current branch, dirty files) into the conversation
- `PreToolUse` hook to log Bash invocations for audit trail
- `PostToolUse` hook for type-checking after Edit operations on TS/JS files

Suggest only if the project has a use case (e.g. it has a TypeScript build → suggest postedit type-check). Don't suggest hooks for the sake of having them.

### 4.5 Missing `agents/` README or index

When `.claude/agents/` has more than ~5 agents, an index in the rules directory listing all agents and when to use each is useful. The collaboration-tool repo already has `agent-delegation.md` — that is the pattern. Flag if the agent count is high but no such index exists.

---

## 5. Deprecated patterns

Severity defaults to **medium**.

### 5.1 Old hook event names

The Claude Code hook event vocabulary has evolved. Flag any hook in `.claude/hooks/` (or referenced from `settings.json`) using event names not in the current docs. Cross-check via the URL list in `online-baseline.md`. Common renames have included camelCase ↔ PascalCase variants — verify against the live docs before flagging.

### 5.2 Deprecated frontmatter keys

Skill / agent frontmatter has gained / lost fields. Run the live docs check from `online-baseline.md` and report any frontmatter key in the project's agents/skills that the docs no longer mention. Do not auto-remove — surface it for the user to confirm.

### 5.3 String permissions vs new patterns

Older settings used freeform `Bash(...)` strings; newer Claude Code documentation may show structured permission objects. If the docs describe a newer form, suggest migrating gradually (defer the actual edit to `update-config`).

### 5.4 Marker conventions

`@-references` to other CLAUDE.md files (`@frontend/CLAUDE.md`) — verify each file exists. The `@` syntax may also have evolved; verify against docs.

---

## 6. Frontmatter / structural integrity

Severity defaults to **medium** for malformed frontmatter, **low** for stylistic issues.

### 6.1 Missing or malformed YAML

Every agent file (`.claude/agents/*.md`) and skill file must start with `---\n...\n---`. Verify:
- The block opens and closes
- Required fields present: `name`, `description`
- `name` matches the filename (without `.md`)
- `description` is non-empty and longer than ~30 chars

### 6.2 Massive description blocks

A `description` longer than ~600 words is a smell — descriptions are loaded as part of the always-on metadata. Suggest moving long content into the body and trimming the description to the trigger summary.

### 6.3 Body-only "When to use" sections

If an agent or skill has a "When to use this skill" section in the body but the same info is missing from the description, flag it. Triggers must be in the description (only the description is read for matching).

### 6.4 Heading hierarchy

CLAUDE.md files should use `#` once (H1 for the title). Multiple H1s confuse some viewers. Stylistic — severity **low**.

---

## How to apply

1. Build the candidate finding list by running every check above.
2. Deduplicate findings that point at the same root cause (e.g. one missing file referenced from three rules → one finding with three locations).
3. Sort by severity descending, then by file path.
4. Move on to Phase 3 (online baseline) before reporting.
