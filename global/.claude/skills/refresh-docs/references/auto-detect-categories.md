# Auto-detect categories

How to scan a repository and derive an appropriate `documentation/` tree.

## Step 1 — Bound the scan

Always honor this skip list (case-sensitive, glob-matched against repo-relative paths):

```
node_modules/   dist/        build/         out/         .next/      .turbo/
.svelte-kit/    .nuxt/       .cache/        coverage/    .nyc_output/
.git/           .hg/         .svn/
vendor/         third_party/ third-party/   external/
target/         bin/         obj/
__pycache__/    .venv/       venv/          .tox/        .mypy_cache/
.gradle/        .idea/       .vscode/       .vs/
*.min.js        *.bundle.js  *.map          *.lock
package-lock.json   yarn.lock    pnpm-lock.yaml   poetry.lock   Cargo.lock
```

For any non-trivial scan use `find` with `-prune` rather than walking and filtering after the fact:

```bash
find . \( -name node_modules -o -name .git -o -name dist -o -name build \
        -o -name vendor -o -name target -o -name __pycache__ \) -prune \
       -o -type f -print
```

Bound the scan to the git working tree: `git ls-files` is the safest source of truth — it already excludes ignored paths.

## Step 2 — Detect manifests (project-level facts)

Look for these in the repo root (and one level deep for monorepos):

| Manifest | What it tells you |
|----------|-------------------|
| `package.json` | Name, version, scripts (run/build/test/lint), deps (frameworks: react, vue, svelte, next, express, fastify, nestjs, vite, webpack), workspaces. |
| `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, `turbo.json` | Monorepo with sub-packages — each is a candidate module. |
| `pyproject.toml`, `setup.py`, `setup.cfg`, `requirements*.txt` | Python project; framework hints in deps (django, flask, fastapi, sqlalchemy). |
| `Cargo.toml` | Rust crate; `[workspace]` → multi-crate. |
| `go.mod` | Go module; sub-`main` packages → CLIs/services. |
| `Gemfile` | Ruby app; `rails`/`sinatra` in deps. |
| `composer.json` | PHP; `laravel`/`symfony` hints. |
| `pom.xml`, `build.gradle*` | Java/Kotlin; multi-module if `<modules>` or `include(...)`. |
| `*.csproj`, `*.sln` | .NET. |
| `Dockerfile`, `docker-compose*.yml` | Containerized; surface as a deployment doc. |
| `.github/workflows/*`, `.gitlab-ci.yml`, `Jenkinsfile` | CI; mention in deployment doc. |
| `terraform/`, `*.tf`, `pulumi/`, `helm/`, `k8s/`, `kustomize/` | Infra-as-code → deployment doc. |
| `openapi.{yaml,yml,json}`, `swagger.{yaml,yml,json}` | REST API spec → API reference doc. |
| `prisma/schema.prisma`, `schema.sql`, `migrations/` | Database schema → data-model section. |
| `.env.example` | Environment variables → configuration doc. |

Read each detected manifest **once**. Cache the parsed data; do not re-read in later phases.

## Step 3 — Detect top-level structure

Inspect immediate children of the repo root. Common patterns:

| Layout | Interpretation |
|--------|----------------|
| `src/` only | Single-package app. One `modules/` doc per major sub-folder. |
| `services/`, `apps/`, `packages/`, `crates/`, `cmd/` | Monorepo. One `modules/<name>.md` per sub-folder. |
| `frontend/` + `backend/` (or `client/` + `server/`) | Two-tier; create `modules/frontend.md` + `modules/backend.md`. |
| `api/` + `worker/` + `web/` | Multi-service; one module doc per. |
| `lib/` + `bin/` (Rust/Go/Ruby) | Library + CLI; mention both. |
| `infra/` or `deploy/` | Surface a deployment guide. |
| `docs/` already exists | Ask whether to migrate to `documentation/` or leave it. Never silently duplicate. |

Skip dotfiles and the skip list above.

## Step 4 — Derive categories

Apply this decision matrix. Always include the **always-on** categories; include **conditional** categories only when the trigger fires.

### Always on

| Category | File | Trigger |
|----------|------|---------|
| Index | `documentation/README.md` | Always. |
| Overview | `documentation/architecture/overview.md` (or `documentation/overview.md` for tiny projects) | Always. |
| Setup | `documentation/guides/setup.md` | Always. |
| Glossary | `documentation/reference/glossary.md` | Always (seed from CLAUDE.md domain terms if present). |

### Conditional

| Category | File | Trigger condition |
|----------|------|-------------------|
| Architecture detail | `architecture/data-flow.md` | >1 module OR a service detected. |
| Module docs | `modules/<name>.md` per major sub-folder | >1 module OR monorepo workspace. |
| API reference | `reference/api.md` | OpenAPI spec OR routes/controllers detected (`routes/`, `controllers/`, Express/Fastify/FastAPI/Rails routes). |
| Configuration | `reference/configuration.md` | `.env.example` OR config dir (`config/`, `conf/`) OR known config files (next.config.*, vite.config.*, etc.). |
| Deployment | `guides/deployment.md` | Dockerfile OR CI workflow OR infra-as-code OR `deploy/`. |
| Development guide | `guides/development.md` | Has `package.json scripts` / `Makefile` / `justfile` / `Taskfile.yml` with non-trivial targets. |
| Database | `reference/database.md` | `prisma/`, `migrations/`, `schema.sql`, ORM config. |
| Troubleshooting | `guides/troubleshooting.md` | `CLAUDE.md` mentions troubleshooting OR repo has a `docs/troubleshooting.*`. Otherwise skip — let the user opt in. |
| Testing | `guides/testing.md` | Test directory detected with non-trivial size (>5 test files) AND no existing `TESTING.md`. |
| Contributing | Skip; link to existing `CONTRIBUTING.md` from the index. | `CONTRIBUTING.md` exists at root. |

### Tiny-project collapse

If the repo has **<10 source files** AND no sub-modules, collapse to a flat layout:

```
documentation/
├── README.md
├── overview.md
├── setup.md
├── api.md          (only if API surface detected)
└── glossary.md
```

Skip `architecture/`, `modules/`, `guides/`, `reference/` subfolders.

## Step 5 — Discover modules

For each module candidate identified in Step 3:

1. List its top-level files (`ls -la`, then `git ls-files <module-path> | head -50`).
2. Identify the entry point (one of, in order):
   - `index.{ts,tsx,js,jsx,mjs,cjs,py}`
   - `main.{ts,js,py,go,rs}`
   - `app.{ts,js,py}`
   - `server.{ts,js,py}`
   - The file whose name matches the module name.
   - Otherwise: skip the module and surface a warning ("could not find entry point for `<name>`").
3. Read **only the entry point** and at most 2 representative files (e.g., a route file, a service file). Do not read the whole module.
4. Extract: purpose (from comments/docstrings), public API (exported symbols), notable dependencies.

Each module produces one `modules/<name>.md` using the module template in `references/doc-templates.md`.

## Step 6 — Surface the proposal

Print the resulting tree to the user (markdown code block) along with a one-sentence rationale per file. Then `AskUserQuestion`:

- Question: "Proceed with this tree?"
- Options: "Yes, proceed", "Modify (specify which to skip/add)", "Cancel".

Do **not** start writing until the user confirms.

## Edge cases

| Case | Handling |
|------|----------|
| Empty repo (no source files) | Ask whether to scaffold a starter `documentation/README.md` only. |
| Repo with only docs (no code) | Skip module detection; produce `overview.md` + `glossary.md` only. |
| Multiple languages in one repo | List all detected; produce one `architecture/overview.md` covering the polyglot layout. |
| Existing `docs/` folder | Ask: "Migrate `docs/` content to `documentation/`, leave both, or use `docs/`?" — honor the answer; never silently overwrite. |
| Existing `documentation/` not generated by this skill | Treat hand-authored content as `manual:keep` by default; ask before any overwrite. |
| Detached HEAD / no commits yet | Skip baseline write; warn the user that incremental updates won't work until first commit. |
