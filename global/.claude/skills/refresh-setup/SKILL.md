---
name: refresh-setup
description: Audit the current project's Claude configuration for outdated, conflicting, or missing pieces. Scans every CLAUDE.md / CLAUDE.local.md in the repo plus the project's `.claude/` tree (settings.json, agents/, rules/, hooks/, commands/, skills/) for dead references, duplicate or contradicting rules, and coverage gaps. Cross-checks against the latest Claude Code documentation at docs.claude.com to surface new features and deprecated syntax. Reports findings and prompts interactively (AskUserQuestion) for each fix — nothing is changed without explicit confirmation. Use when the user runs /refresh-setup, asks to "audit / refresh / review my Claude setup", asks about stale CLAUDE.md, .claude config drift, outdated rules/agents, or wants to validate the project's Claude Code configuration.
---

# refresh-setup

A guided audit of the current project's Claude configuration. The goal is to keep CLAUDE.md files, `.claude/` rules, agents, hooks, and `settings.json` aligned with current Claude Code best practices and the actual state of the codebase.

## Trigger

This skill activates when the user types `/refresh-setup` or asks to audit / refresh / review their Claude setup, claude config, .claude directory, CLAUDE.md files, or claude-code configuration.

## Scope

Project-level only. The audit covers:

- Every `CLAUDE.md` and `CLAUDE.local.md` anywhere in the current repository (search from the git repo root)
- The project's `.claude/` directory: `settings.json`, `settings.local.json`, `agents/*.md`, `rules/*.md`, `hooks/*`, `commands/*`, `skills/*`

Out of scope: the global `~/.claude/` directory, other projects' configurations, the user's global `~/.claude/CLAUDE.md`. Do not read or modify those — even if a finding seems to point there, surface it as a recommendation only.

## Operating principle

**Interactive, never destructive.** For every finding, the skill stops and asks the user via `AskUserQuestion` whether to apply the fix, skip, or see the details. The skill makes no edit without explicit confirmation. Communication with the user is in Bulgarian (per global preference); file content stays in English.

## Workflow

Execute the phases in order. Use `TaskCreate`/`TaskUpdate` to track progress.

### Phase 1 — Discovery

1. Determine the repository root: `git rev-parse --show-toplevel`. If not in a git repo, abort and tell the user.
2. Run `scripts/discover.sh <repo-root>` (in this skill's directory) to inventory every CLAUDE.md and `.claude/` artifact with size + last-modified time.
3. Read every file produced by discovery. Keep the contents in working memory for the next phases. If the file count is large (>20 files), batch the reads in parallel.

### Phase 2 — Static analysis

Apply every check listed in `references/static-checks.md`. The reference file groups checks into:

- **Dead references** — rules/agents/skills/permissions pointing at files, paths, skill names, or commands that no longer exist
- **Duplicates** — two agents with overlapping descriptions, two rules covering the same topic, the same instruction repeated across CLAUDE.md and a rule file
- **Conflicts** — direct contradictions between two rule files or between a rule file and a CLAUDE.md
- **Coverage gaps** — sub-modules with code but no CLAUDE.md, missing common safety rules, hooks that would meaningfully improve the workflow

For each finding, build a structured entry:

```
- id: F-NNN
  severity: high | medium | low
  category: dead-ref | duplicate | conflict | gap | deprecated
  file: <relative path>
  line: <line number or range, if applicable>
  problem: <one sentence>
  suggested_fix: <one paragraph max>
```

### Phase 3 — Online baseline

Read `references/online-baseline.md` for the URLs and per-URL checks. Use `WebFetch` for these — they are stable doc pages and a single GET is enough.

Look for:
- New `settings.json` keys / hook events the project does not yet use but would benefit from
- Deprecated keys, hook event names, or syntax still present in the project
- Recently introduced skill / agent frontmatter conventions

If `WebFetch` fails (offline / blocked / empty answer), record that the online baseline was skipped and continue. Do not fail the whole audit.

### Phase 4 — Report

Produce a single Markdown report in the conversation (do NOT write it to a file). Group findings by severity, then category. Each entry shows the structured fields from Phase 2. Add a one-paragraph executive summary at the top: total findings, breakdown by severity, what's healthy.

### Phase 5 — Interactive fixes

For each finding (high → low severity), ask the user via `AskUserQuestion` with these options:

- **Apply fix** — make the edit, then verify with a re-read of the changed file
- **Skip** — record as "user-acknowledged, kept as-is" and move on
- **Show details** — read the full surrounding context and re-ask

Rules:
- One question at a time. Never batch unrelated fixes into a single question.
- For changes touching `settings.json` or hooks, hand off to the `update-config` skill — it knows the harness's edit semantics and will validate the JSON. Invoke it via the `Skill` tool.
- After each applied fix, re-run the relevant Phase-2 check on the modified file to ensure the fix didn't introduce a new problem (e.g., cascading dangling references).

### Phase 6 — Wrap-up

Print a short summary: how many findings were applied, skipped, or deferred. List the modified files. Suggest `git diff` so the user can review. Do not commit and do not run any git mutation.

## Constraints (non-negotiable)

- **No destructive git ops.** Do not run `git stash`, `git checkout .`, `git restore`, `git reset --hard`, `git clean -f`, or any branch deletion. Edits go through the `Edit` tool; the user reviews and commits.
- **One question at a time** in the interactive phase. Never batch unrelated fixes into a single `AskUserQuestion`.
- **Settings/hook edits go through `update-config`.** Do not hand-edit JSON when that skill is available.
- **Project scope only.** Never read or write `~/.claude/` files. If a finding seems to require a global change, surface it as a report-only recommendation.
- **Read before edit.** Always `Read` a file before editing it (the `Edit` tool requires it).

## Bundled resources

- `scripts/discover.sh` — inventory script (Phase 1). Outputs an annotated file list to stdout. Takes the repo root as its single argument.
- `references/static-checks.md` — full catalog of static checks for Phase 2. Read this when entering Phase 2.
- `references/online-baseline.md` — URLs and per-URL checks for Phase 3. Read this when entering Phase 3.
