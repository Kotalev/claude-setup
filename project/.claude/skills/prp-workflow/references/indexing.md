# PRP Index / Registry

Maintain `PRPs/INDEX.md` — the single source of truth for which PRPs exist, their status, and their owner.

`PRPs/INDEX.md` does not currently exist. Create it the first time this workflow runs.

## Status vocabulary

| Status | Definition |
|--------|------------|
| `active` | PRP has an open task list, implementation underway |
| `ready` | Written, scored ≥ 6, not yet started |
| `done` | Implementation complete and merged (verify via `git log`) |
| `abandoned` | Superseded or explicitly dropped — keep the file for history |
| `research` | Note/analysis only (lives in `PRPs/tasks/`, not `generated/`) |

## Process

### 1. Scan the directories

- `Glob` `PRPs/generated/*.md` and `PRPs/tasks/*.md`.
- For each file, `Read` only the first ~60 lines (title, status hints, self-score, dates).

### 2. Classify each PRP

Heuristics (in order):

1. If the file contains `Status: done` / a completion stamp → `done`.
2. If the file ends with a confidence score and no status marker → `ready`.
3. If referenced by a commit message in the last 14 days (`git log --grep`) → `active` or `done` based on completion notes.
4. If explicitly marked superseded by another PRP → `abandoned`.
5. If it lives in `PRPs/tasks/` → `research`.
6. Otherwise ask the user (one at a time) to classify ambiguous ones.

Do not guess status silently — surface uncertainty.

### 3. Regenerate `PRPs/INDEX.md`

Replace the whole file. Structure:

```markdown
# PRP Index

_Last updated: YYYY-MM-DD_

## Active (N)
- [title](generated/file.md) — one-line summary. Owner: name. Score: X/10.

## Ready (N)
- …

## Done (N)
- …

## Abandoned (N)
- …

## Research notes (N)
- [title](tasks/file.md) — one-line summary.

## Conventions
- Active PRPs have a tracked task list.
- Scores reflect one-pass execution confidence, 1–10.
- Status changes are recorded at the bottom of the PRP file.
```

Keep titles and summaries short. Alphabetise within each section.

### 4. Report

Tell the user:
- counts per status,
- any PRPs that needed classification help,
- any duplicates or overlaps detected (e.g. the `pages-parser-*` files that currently live in both `generated/` and `tasks/`).

### 5. Do not

- ❌ Delete PRP files — even `abandoned` ones stay for history.
- ❌ Modify PRP file content to fix status; status belongs in `INDEX.md` or a single "Status:" line at the top of the PRP.
- ❌ Create sub-indexes per folder — one `INDEX.md` at `PRPs/INDEX.md`.
- ❌ Run this workflow in parallel with itself (it rewrites a shared file).

## Optional: lightweight freshness flag

If a PRP in `ready` hasn't been touched in > 90 days, append `(stale)` to its line in the index. Don't move it — the user decides whether to revive or abandon.
