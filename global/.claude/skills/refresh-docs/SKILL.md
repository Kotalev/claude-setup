---
name: refresh-docs
description: Create or refresh a project's `documentation/` folder with structured Markdown docs auto-detected from the codebase. Scans the repo (manifests, top-level dirs, language) to propose category-driven MD files (overview, architecture, modules, guides, reference), generates them with optional Mermaid diagrams, and keeps them in sync via a git-diff baseline stored in `documentation/.meta/last-sync.json`. Always interactive — every group of file writes is confirmed via AskUserQuestion. Use when the user runs `/refresh-docs`, asks to "create project documentation", "update the docs", "refresh docs", "generate README structure", "обнови документацията", "създай документация на проекта", or whenever a project lacks a `documentation/` folder and the user wants one.
---

# refresh-docs

Guided creation and maintenance of a project's `documentation/` folder. The skill detects the project's structure, proposes appropriate categories, and writes Markdown documentation — always after explicit confirmation per group of files.

## Trigger

`/refresh-docs` or any request to create / update / refresh / regenerate project documentation, generate MD docs, document the codebase, or sync existing docs with current code.

## Scope

In scope:
- The current git repository (working directory).
- A single output folder: `documentation/` at the repo root.
- All categories described in `references/doc-templates.md`.

Out of scope:
- Other projects, the user's `~/.claude/`, or anything outside the current repo.
- Existing `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `CHANGELOG.md` at the repo root — read them for context, never overwrite. If they conflict with newly generated docs, surface the overlap and let the user decide.
- Auto-generated artifacts (`node_modules/`, `dist/`, `build/`, `.git/`, `vendor/`, `coverage/`, `.next/`, `.turbo/`, `target/`, `__pycache__/`, `.venv/`).

## Operating principle

**Interactive, never destructive.** No file is written without `AskUserQuestion` confirmation grouped by purpose (e.g., "Create overview.md, architecture.md, setup.md?" — one question, one answer). Communication with the user is in Bulgarian per global preference; **document content stays in English**.

Hard constraints:
- No destructive git ops (no `stash`, `checkout .`, `restore`, `reset --hard`, `clean -f`, branch deletion).
- Read before edit; never overwrite an existing doc without showing a diff and asking.
- Never run `exec()`, install packages, or hit the network without permission.
- Always write English content even when conversing in Bulgarian.

## Modes

The user can drive the skill in three ways:

| Mode | Trigger phrase | Behavior |
|------|----------------|----------|
| **Interactive** (default) | `/refresh-docs`, "update the docs", "обнови документацията" | One `AskUserQuestion` per logical group; user picks what to write/refresh. |
| **All-at-once** | "create all docs at once", "generate the full documentation", "напиши цялата документация наведнъж" | Skip per-group confirmation but **still ask once** to confirm the full plan before writing. |
| **Dry-run** | "preview docs plan", "show me the plan only", "покажи плана без да пишеш" | Print the proposed file tree + per-file purpose. Write nothing. |

Identify the mode from the invocation phrase. If ambiguous, ask via `AskUserQuestion`.

## Workflow

Use `TaskCreate`/`TaskUpdate` to track phases. Each phase ends with an explicit `AskUserQuestion` checkpoint unless in dry-run mode.

### Phase 1 — Detect repo state

1. Resolve repo root via `git rev-parse --show-toplevel`. If not a git repo, ask whether to proceed (no `.last-sync` baseline will be possible).
2. Check whether `documentation/` exists.
   - **Absent** → "create" flow.
   - **Present** → "update" flow.
3. Read `documentation/.meta/last-sync.json` if it exists (schema in `references/update-detection.md`).
4. Detect tech stack and structure following `references/auto-detect-categories.md`. Surface a one-paragraph summary of what was found (languages, top-level dirs, manifests, services, frameworks).

### Phase 2 — Propose categories and tree

Apply the rules in `references/auto-detect-categories.md` to derive the proposed file tree. Always hierarchical with an index:

```
documentation/
├── README.md                    # index — links to every other doc
├── architecture/
│   ├── overview.md              # high-level: components, responsibilities, boundaries
│   └── data-flow.md             # request lifecycle / data path (Mermaid optional)
├── modules/
│   └── <one-per-detected-module>.md
├── guides/
│   ├── setup.md                 # local dev environment
│   ├── development.md           # day-to-day workflow, commands, conventions
│   └── deployment.md            # only if deployment artifacts detected
├── reference/
│   ├── api.md                   # only if API surface detected (routes, OpenAPI)
│   ├── configuration.md         # env vars, config files
│   └── glossary.md              # domain terms (seed from CLAUDE.md if present)
└── .meta/
    ├── last-sync.json           # commit hash + per-file last-updated map
    └── README.md                # explains the .meta folder (one paragraph)
```

For small projects (<10 source files), collapse to a flat layout (`documentation/{overview,setup,api,glossary}.md`).

Show the user the proposed tree and the per-file purpose, then ask via `AskUserQuestion` whether to proceed, modify, or cancel.

### Phase 3 — Detect what changed (update flow only)

If `last-sync.json` exists, follow `references/update-detection.md` to:

1. Run `git diff <last-sync-commit>..HEAD --stat` to list changed source files.
2. Map changed source files → potentially affected docs.
3. Build a categorized list:
   - **Stale**: docs whose underlying source changed since `last-sync`.
   - **Missing**: detected categories with no doc yet.
   - **Orphan**: docs whose described code no longer exists.

Present the categorized list and ask which groups to refresh. Never auto-delete orphans — flag them and ask.

### Phase 4 — Mermaid decision

Before writing docs, ask: "Include Mermaid diagrams (architecture, data flow, deps)?" — Yes / No / Only architecture. If yes, follow `references/mermaid-patterns.md`. Validate every diagram syntactically (no broken arrows, balanced brackets) before writing.

### Phase 5 — Generate, group by group

For each category group (`architecture/`, `modules/`, `guides/`, `reference/`):

1. Show the file list to be written/updated for that group.
2. `AskUserQuestion`: "Write this group?" Options: Yes / Skip / Show one as preview / Cancel.
3. On Yes: produce content per the templates in `references/doc-templates.md`. Use `Write` for new files, `Edit` for incremental updates (preserve manual edits — see "Manual edit detection" below).
4. After every file, briefly state what was written.
5. **All-at-once mode**: skip the per-group ask but keep step 4.

### Phase 6 — Update index and baseline

1. Regenerate `documentation/README.md` so it links every existing file with a one-line purpose.
2. Update `documentation/.meta/last-sync.json`:
   ```json
   {
     "schemaVersion": 1,
     "lastSyncCommit": "<git rev-parse HEAD>",
     "lastSyncAt": "<ISO 8601 UTC>",
     "files": {
       "documentation/architecture/overview.md": {
         "updatedAt": "<ISO 8601 UTC>",
         "sourceGlobs": ["services/api/src/**", "frontend/src/App.*"]
       }
     }
   }
   ```
3. Print a final summary: created / updated / skipped counts, baseline commit, next-step suggestions.

## Manual edit detection

Before overwriting any doc, compare its current content with what was last generated. If the user has hand-edited it (heuristics: presence of new headings not in template, paragraph diff, `<!-- manual -->` marker), do NOT overwrite. Instead:

1. Show the diff between current and proposed content.
2. `AskUserQuestion`: Keep manual / Replace with regenerated / Merge interactively / Skip.

Encourage users to mark manually authored sections with:
```markdown
<!-- manual:keep -->
... content the skill must never touch ...
<!-- /manual:keep -->
```
Treat content inside `manual:keep` blocks as immutable.

## Read before write

Before generating any doc:
- Read root `README.md`, `CLAUDE.md`, `CLAUDE.local.md`, `CONTRIBUTING.md` if they exist — pull facts from them; never duplicate them verbatim. Link to them from `documentation/README.md` instead.
- Read top-level `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `Gemfile` / `pom.xml` for project metadata (name, version, scripts, dependencies).
- For each detected module, list (don't read) its files first; only open representative entry points (`index.*`, `main.*`, `*Service.*`, `*Controller.*`, `Routes.*`).

This avoids hallucinated content and keeps token usage bounded.

## Quick reference

| User says | Skill behavior |
|-----------|----------------|
| `/refresh-docs` | Run interactive mode end-to-end. |
| "create project documentation" | If no `documentation/`, propose tree → confirm → generate group by group. |
| "update the docs" / "обнови документацията" | Update flow with git-diff baseline. |
| "create all docs at once" | All-at-once: one confirmation, then write everything. |
| "preview docs plan" | Dry-run: print proposed tree only, write nothing. |
| "document the X module" | Propose adding `modules/X.md`; ignore other categories. |

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Writing files before confirmation | Always `AskUserQuestion` before any group of writes. |
| Generating Bulgarian doc content | Docs are English-only; conversation stays Bulgarian. |
| Overwriting hand-edited docs | Detect drift, show diff, ask before overwrite. Honor `<!-- manual:keep -->`. |
| Duplicating root `README.md` content | Link to it from `documentation/README.md`; don't restate. |
| Generating Mermaid diagrams without validation | Verify syntax (balanced brackets, valid node refs) before writing. |
| Documenting node_modules / generated code | Apply the skip list in `references/auto-detect-categories.md`. |
| Skipping the baseline write | Always update `.meta/last-sync.json` after a successful run, even partial. |
| Treating any `documentation/` as authoritative | If a project already uses `docs/` instead, ask whether to use it or migrate to `documentation/`. |

## References

- `references/auto-detect-categories.md` — repo scan rules, manifest detection, category derivation, skip list.
- `references/doc-templates.md` — per-file Markdown templates with required headings.
- `references/mermaid-patterns.md` — diagram recipes for architecture, data flow, dependencies.
- `references/update-detection.md` — `last-sync.json` schema, git-diff workflow, drift classification.
