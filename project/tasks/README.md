# Auto Task Queue

Drop problems here, approve them, let Claude Code work on them in isolated worktrees on an hourly cron. Each task is a markdown file with YAML frontmatter.

## Directories

| Directory | Contents |
|---|---|
| `inbox/` | Tasks with status `new`, `for_dev`, or `failed`. Committed. |
| `processing/` | Tasks currently being worked on (status `processing`, `awaiting_verification`, `verifying`, or `not_verified`). Committed. A task's presence here is the atomic lock. |
| `archive/` | Tasks with status `verified`. Committed. |

`.run-log.jsonl` and `.cron-id` are gitignored runtime artifacts.

## Status lifecycle

```
new ── (user edits test_url, /auto-tasks approve) ──▶ for_dev
for_dev ── (cron / /auto-tasks run) ──▶ processing (moved to processing/)
processing ── (review ≥ 7, test_url populated) ──▶ awaiting_verification (stays in processing/)
processing ── (review ≥ 7, test_url missing) ──▶ not_verified (stays in processing/, no auto-verify)
processing ── (error / review stuck) ──▶ failed (stays in processing/)
awaiting_verification ── (verify cron / /auto-tasks verify) ──▶ verifying
verifying ── (all ACs pass) ──▶ verified (moved to archive/)
verifying ── (any AC fails / error) ──▶ not_verified (stays in processing/, awaits human)
not_verified ── (user fixes test_url + /auto-tasks retry) ──▶ for_dev (moved back to inbox/)
failed ── (/auto-tasks retry) ──▶ for_dev (moved back to inbox/)
```

## Creating tasks

- `/auto-tasks new` — interactive stub
- `/auto-tasks new "Short problem description"` — parses description, greps files, checks for related open tasks
- `/auto-tasks new --from docs/PDF-REVIEW.md` — extracts and groups multiple candidate tasks from a document

All three paths create tasks with `status: new`. Review them, then run `/auto-tasks approve <id>` to flip them to `for_dev`.

## Executing tasks

- `/auto-tasks run` — claim and work on all `for_dev` tasks right now (manual)
- `/auto-tasks install-cron` — register the hourly cron (runs `/auto-tasks run` every hour)

Worktrees live under `.claude/worktrees/<slug>/`. Each finished task commits a `TASK-REPORT.md` in its worktree. You review and merge manually.

### Verification

- `/auto-tasks verify` — claim one `awaiting_verification` task, run it against Chrome DevTools MCP in an isolated Vite server started from its worktree, decide `verified` (→ archive) or `not_verified` (stays).
- Populate `test_url` in the task frontmatter *before* running approve to opt in to verification. Missing `test_url` → task skips verify and lands in `not_verified` directly.
- Install the verify cron alongside the dev cron via `/auto-tasks install-cron` (10-min schedule).

## Task file format

```yaml
---
id: 2026-04-17-001
title: Fix pagination break in mixed-orientation docs
status: new              # new | for_dev | processing | done | failed
priority: normal         # low | normal | high
agent: null              # optional subagent_type override (e.g. docx-pipeline-specialist)
created_at: 2026-04-17T14:30:00Z
updated_at: 2026-04-17T14:30:00Z
worktree: null
branch: null
review_score: null
attempts: 0
last_error: null
source: null             # path to source doc if created via --from
merged_from: []          # ids folded into this task during grouping
test_url: null           # e.g. "/editor/token" — fill before approve to enable verify
verified_at: null        # set by verify cron
verify_notes: null       # verify summary
---

## Context
<Why this matters, references to code.>

## Acceptance Criteria
- [ ] Observable behavior 1
- [ ] Observable behavior 2

## References
- Files: services/api/src/foo.js:42
```

## Safety

- Main branch is never touched automatically.
- Failed tasks keep their worktree for debugging.
- `/auto-tasks run` is idempotent — a task already in `processing/` is skipped even if cron and manual runs overlap.
