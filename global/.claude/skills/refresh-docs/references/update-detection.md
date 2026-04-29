# Update detection

How `refresh-docs` decides what to refresh, using a git-diff baseline plus optional manual override.

## The baseline file

Path: `documentation/.meta/last-sync.json`

Schema:

```json
{
  "schemaVersion": 1,
  "lastSyncCommit": "abc123def456...",
  "lastSyncAt": "2026-04-26T10:15:30Z",
  "branch": "main",
  "files": {
    "documentation/architecture/overview.md": {
      "updatedAt": "2026-04-26T10:15:30Z",
      "sourceGlobs": ["src/**", "package.json"]
    },
    "documentation/modules/api.md": {
      "updatedAt": "2026-04-26T10:15:30Z",
      "sourceGlobs": ["services/api/src/**"]
    }
  }
}
```

Rules:
- Always write `lastSyncCommit` from `git rev-parse HEAD` at the **end** of the run, not the start (so partial runs don't poison the baseline).
- `sourceGlobs` is the list of repo-relative globs that, when changed, mean the doc may be stale.
- Bump `schemaVersion` if the structure ever changes; treat unknown versions as "no baseline" and warn.

If the file is missing, malformed, or its `lastSyncCommit` no longer exists in the repo (e.g., force-pushed history), treat the project as freshly documented and prompt the user before regenerating.

## Detection workflow

### Step 1 — Diff against baseline

```bash
LAST=$(jq -r .lastSyncCommit documentation/.meta/last-sync.json)
git diff --name-only "$LAST"..HEAD -- ':!documentation/'
```

Excluding `documentation/` avoids loops where doc edits trigger doc regeneration.

If `LAST` does not exist in the local history:

```bash
git cat-file -e "$LAST^{commit}" 2>/dev/null || echo "baseline orphaned"
```

→ ask the user whether to use HEAD as the new baseline (skip stale detection this run) or run a full re-scan.

### Step 2 — Map source paths to docs

For each changed file, find every doc whose `sourceGlobs` matches:

```bash
# pseudocode
for changed in changed_files:
  for doc, meta in last_sync.files:
    if any(fnmatch(changed, g) for g in meta.sourceGlobs):
      mark doc as stale because of changed
```

A doc may be marked stale by multiple files; keep the full list to show the user.

### Step 3 — Find missing categories

Re-run the detection from `auto-detect-categories.md`. For every category that should exist but has no entry in `files`:

- Add it to the **Missing** bucket.

### Step 4 — Find orphans

For every entry in `files` whose all `sourceGlobs` no longer match any tracked file (`git ls-files`):

- Add it to the **Orphan** bucket. Never auto-delete — only flag.

### Step 5 — Surface to user

Print three sections:

```
STALE (changed source since last sync):
  documentation/modules/api.md  ← 12 changes in services/api/src/
  documentation/reference/configuration.md  ← 2 changes in .env.example

MISSING (category exists in code but no doc):
  documentation/modules/spreadsheet.md  ← frontend/src/spreadsheet/

ORPHAN (doc exists but underlying code is gone):
  documentation/modules/legacy-importer.md  ← parsers/legacy/ no longer exists
```

Then `AskUserQuestion` with options:
- "Refresh all stale" / "Pick which stale to refresh" / "Skip stale"
- (Always ask separately about orphans — never bundle the delete decision with refresh.)

## Drift heuristics for individual files

Sometimes the user has manually edited a doc since the last sync. Detect drift before overwriting:

1. Compute the SHA-256 of the current file. Compare with the last-known hash if you stored one (optional v2 schema field).
2. **Cheaper alternative** that works without stored hashes: read the file and look for:
   - Sections with headings not present in the template — likely manual content.
   - Any `<!-- manual:keep -->` blocks.
3. If drift is suspected, never overwrite silently. Show a unified diff (use `diff -u` via Bash) and `AskUserQuestion`:
   - Keep current
   - Replace with regenerated (warn that manual changes will be lost)
   - Merge interactively (read both, propose a merged version, ask again)
   - Skip this file

Always honor `<!-- manual:keep -->` regions — copy them verbatim into any regenerated content.

## Source-glob heuristics

When generating a new doc, derive `sourceGlobs` from the doc's purpose:

| Doc | Default globs |
|-----|---------------|
| `architecture/overview.md` | top-level dirs (e.g. `services/**`, `frontend/**`), root manifests (`package.json`, `pyproject.toml`, etc.) |
| `architecture/data-flow.md` | route/controller dirs, message-queue handlers, event-bus configs |
| `modules/<name>.md` | the module's source root: e.g. `services/api/src/**` |
| `guides/setup.md` | `package.json`, `Makefile`, `justfile`, `docker-compose*.yml`, `.env.example`, `README.md` |
| `guides/development.md` | `package.json scripts`, `Makefile`, lint/format configs (`.eslintrc*`, `.prettierrc*`, `pyproject.toml [tool.*]`) |
| `guides/deployment.md` | `Dockerfile*`, `.github/workflows/**`, `.gitlab-ci.yml`, `Jenkinsfile`, `infra/**`, `deploy/**`, `terraform/**`, `helm/**`, `k8s/**` |
| `guides/testing.md` | test dirs, test runner configs (`jest.config.*`, `vitest.config.*`, `pytest.ini`, etc.) |
| `reference/api.md` | `routes/**`, `controllers/**`, `openapi.*`, `swagger.*`, route definition files |
| `reference/configuration.md` | `.env.example`, `config/**`, named config files (`next.config.*`, `vite.config.*`, etc.) |
| `reference/database.md` | `prisma/schema.prisma`, `migrations/**`, `schema.sql`, ORM model dirs |
| `reference/glossary.md` | `CLAUDE.md`, `README.md` |

Keep globs as narrow as defensible. Overly broad globs (`**/*`) cause every doc to be flagged stale on every commit and erode trust in the system.

## Edge cases

| Case | Behavior |
|------|----------|
| Branch switched since last sync | Compute diff against the merge base: `git merge-base HEAD <last-sync-commit>`. |
| `last-sync.json` exists but no commit since baseline | Print "No source changes since last sync; nothing to update unless you want to add a new category." |
| Repo has uncommitted changes | Surface them: `git status --porcelain`. Ask: "Include uncommitted changes?" — default yes. |
| Detached HEAD | Skip `branch` field; record commit SHA only. |
| Submodules | List but do not recurse — surface as "not scanned: <submodule path>". |
| Massive diff (>500 changed files) | Bucket changes by top-level directory and present aggregated counts; do not list every file. |

## Final write

Always update `last-sync.json` at the very end of a successful run, even if some groups were skipped. Record only the docs you actually wrote/updated; preserve previous entries for untouched docs (their `updatedAt` stays as it was).
