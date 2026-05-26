# Design: `/auto-tasks install` + project config

Date: 2026-05-26
Status: Approved (brainstorming)

## Goal

Make the `/auto-tasks` autonomous task system reusable across projects. Today the
slash command (`auto-tasks.md`) and `lib/grouping.js` hardcode one specific
monorepo: ports `:4100/:4101`, `pnpm`/`dotenv`/`tsx`/`next dev`, `apps/api/server.ts`,
Next.js readiness, `NEXT_PUBLIC_API_URL`, the rule files `portability-check.md` /
`composite-pk.md`, and the `apps/*`/`packages/*` module layout.

A new interactive `/auto-tasks install` subcommand detects the tech stack, asks the
user about anything unclear, and writes a committed project config that the rest of
the command reads. No project-specific values remain hardcoded.

## Decisions (from brainstorming)

- **Subcommand**, not a separate command: `/auto-tasks install` (keep plural name).
- **Config is committed**: `tasks/auto-tasks.config.json` (shared across machines/team).
  Task files themselves stay local-only (gitignored) — unchanged.
- **`install-cron` / `uninstall-cron` are removed** from `auto-tasks.md`; cron setup is
  folded into `install` ("starts the process" = installs the crons at the end).
- **Two verify modes**, chosen at install time:
  - `worktree` (default, current behavior): start apps directly from the worktree dir on
    config ports; main repo never touched.
  - `checkout`: in the main repo, guard for a clean tree, `git checkout <feature-branch>`,
    start apps on config ports, verify, then restore the original branch (always, in
    `try/finally`). Touches the main working tree — the user opts in knowingly at install,
    which constitutes the permission the global "no destructive git in main" rule requires.

## Config schema — `tasks/auto-tasks.config.json`

```jsonc
{
  "packageManager": "pnpm",            // detected from lockfile
  "install": "pnpm install",           // worktree dependency install
  "test": "pnpm test",                 // command the dev agent runs
  "worktree": { "root": ".claude/worktrees", "branchPrefix": "feature/" },
  "moduleRoots": ["apps/*/src/*", "packages/*/src/*"], // grouping.js patterns
  "projectRules": [".claude/rules/portability-check.md"], // injected into dev agent prompt
  "reviewerAgent": "elite-code-reviewer",
  "cron": { "run": "7 * * * *", "verify": "*/10 * * * *" },
  "verify": {
    "enabled": true,
    "mode": "worktree",                // "worktree" | "checkout"
    "envFile": ".env",
    "browserApp": "web",               // which app is the base URL the browser opens
    "apps": [
      { "name": "api", "cwd": "apps/api", "start": "pnpm exec tsx server.ts",
        "port": 4101, "portEnv": "API_PORT", "health": "/healthz" },
      { "name": "web", "cwd": "apps/web", "start": "pnpm exec next dev",
        "port": 4100, "portArg": "--port", "readyLog": "Ready in",
        "env": { "NEXT_PUBLIC_API_URL": "http://localhost:4101", "API_URL": "http://localhost:4101" } }
    ]
  }
}
```

Port injection covers both styles: `portEnv` (env var, e.g. Hono) and `portArg`
(CLI flag, e.g. Next). `health` polls `/healthz`; `readyLog` greps the app log for a
ready marker. Missing fields fall back to defaults applied by the CLI `config` command.

### Defaults (applied when key absent)

- `packageManager`: `npm`; `install`: `<pm> install`; `test`: `<pm> test`.
- `worktree`: `{ root: ".claude/worktrees", branchPrefix: "feature/" }`.
- `moduleRoots`: `[]` (grouping then relies on file/topic overlap only).
- `projectRules`: `[]`; `reviewerAgent`: `elite-code-reviewer`.
- `cron`: `{ run: "7 * * * *", verify: "*/10 * * * *" }`.
- `verify.enabled`: `false` if no `apps`; `verify.mode`: `worktree`; `verify.envFile`: `.env`.

## CLI changes (`scripts/auto-tasks/`)

New `config` subcommand (TDD):
- `config` → read `tasks/auto-tasks.config.json` (if present), deep-merge over defaults,
  validate, print normalized JSON. Missing file → defaults only.
- `config --set <path.json>` → validate the payload, write `tasks/auto-tasks.config.json`.
  Used by the `install` flow to persist answers.

`lib/grouping.js`:
- `detectModule(filePath, moduleRoots)` reads glob-ish patterns from config instead of the
  hardcoded `MODULE_PATTERNS`. Empty `moduleRoots` → returns `null` (no module grouping).
- `groupCandidates(candidates, moduleRoots)` and the `group-candidates` / `find-related`
  commands pass `moduleRoots` loaded from config.

Remove the legacy `archive` subcommand + `done` status path (superseded by `verify-complete`,
which archives with `status: verified`). Keep `complete-dev` / `verify-complete` as the only
archival routes.

## `auto-tasks.md` changes

- **New `install` subcommand section** (detailed below).
- **Remove** `install-cron` and `uninstall-cron` sections + their entries in the subcommand list.
- **`run`**: read config; use `config.install` for worktree deps, `config.test` for the agent's
  test step, `config.worktree.*` for paths, `config.projectRules` for the injected rules list
  (replacing the hardcoded portability/composite-pk references), `config.reviewerAgent` for review.
- **`verify`**: rewrite to be config-driven. Loop over `config.verify.apps` to start each app
  (port via `portEnv`/`portArg`, env overrides, `health`/`readyLog` readiness). `config.verify.mode`
  selects worktree vs checkout. Browser base URL = the `browserApp`'s port + `test_url`.

## `/auto-tasks install` flow

1. **Detect.** Package manager from lockfile (`pnpm-lock.yaml`/`package-lock.json`/`yarn.lock`).
   Monorepo from `pnpm-workspace.yaml` / `package.json#workspaces`. Apps from `apps/*` (and
   workspace globs); per app, read `package.json` deps (next/vite/hono/express/fastify…) and the
   `dev` script to propose `cwd`/`start`/`port`/readiness.
2. **Propose & ask.** Present the inferred config; use `AskUserQuestion` for anything unclear or
   ambiguous (apps list, ports, start commands, env overrides, which app is the browser base URL).
3. **Verify mode.** Ask `worktree` vs `checkout`.
4. **Project rules.** List `.claude/rules/*.md`; user multi-selects which to inject (or none).
5. **Cron.** Ask `run` / `verify` schedules (defaults pre-filled).
6. **Persist.** Build the JSON, `node index.js config --set <tmp>` to validate + write.
7. **Start the process.** Offer to install the crons (the `CronCreate` logic previously in
   `install-cron`), saving ids to `tasks/.cron-id` / `tasks/.cron-id-verify`.

## Doc / housekeeping fixes (the original inaccuracies)

- `tasks/README.md`: change "Committed." → local-only (matches `.gitignore`); fix the stale
  inline status list (`new | for_dev | processing | done | failed`) to the full lifecycle;
  document `tasks/auto-tasks.config.json` + `/auto-tasks install`.
- `.gitignore`: add trailing newline; confirm `tasks/auto-tasks.config.json` is NOT ignored.
- Dangling rule refs (`portability-check.md`, `composite-pk.md`) disappear from hardcoded text —
  they now come only from `config.projectRules` (empty by default).

## Scope boundaries

- **In:** the config file, `config` CLI command, `install` subcommand, config-driven
  `run`/`verify`, generic `grouping.js`, removal of `install-cron`/`uninstall-cron` + legacy
  `archive`, doc fixes.
- **Out:** a cron *uninstall* path (user removed `uninstall-cron`; manage crons manually or
  re-run install). Auto-detecting frameworks beyond a best-effort proposal (install always asks).
  Per-app multi-mode port sets (one `port` per app; checkout mode reuses it).

## Verification

- CLI: `node --test __tests__/` — new tests for `config` (defaults merge, `--set` validation,
  round-trip) and updated `grouping` tests (moduleRoots passed in, empty → null).
- Manual: run `/auto-tasks install` in `project/`, inspect the written config, dry-run a
  `verify` against the config in both modes.
