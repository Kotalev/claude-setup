# `/auto-tasks install` + project config — Implementation Plan

**Goal:** Make `/auto-tasks` reusable across projects via an interactive `/auto-tasks install` subcommand that detects the stack, asks the user, and writes a committed `tasks/auto-tasks.config.json` that the rest of the command reads — removing all hardcoded project specifics.

**Architecture:** A new `lib/config.js` (defaults + normalize + validate + load/write) backs a `config` CLI subcommand. `lib/grouping.js` takes `moduleRoots` from config instead of hardcoded patterns. `auto-tasks.md` becomes config-driven for `run`/`verify`, gains an `install` section, and drops `install-cron`/`uninstall-cron` and the legacy `archive`/`done` path.

**Tech Stack:** Node ≥20, `node:test`, no deps. Markdown slash command driven by Claude (AskUserQuestion, Agent, CronCreate, chrome-devtools MCP).

Design: `docs/plans/2026-05-26-auto-tasks-install-config-design.md`.

---

## Task 0: Branch

```bash
git checkout -b feature/auto-tasks-install
```

---

## Task 1: `lib/config.js` (TDD)

**Files:** `scripts/auto-tasks/lib/config.js`, `scripts/auto-tasks/__tests__/config.test.js`

### Step 1: Failing test

Create `__tests__/config.test.js`:

```js
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { normalizeConfig, validateConfig, loadConfig, writeConfig } = require('../lib/config');

let tmp;
beforeEach(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'at-config-')); });
afterEach(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

test('normalizeConfig — empty input yields defaults', () => {
  const c = normalizeConfig({});
  assert.equal(c.packageManager, 'npm');
  assert.equal(c.install, 'npm install');
  assert.equal(c.test, 'npm test');
  assert.deepEqual(c.moduleRoots, []);
  assert.deepEqual(c.projectRules, []);
  assert.equal(c.verify.mode, 'worktree');
  assert.equal(c.verify.enabled, false);
  assert.deepEqual(c.verify.apps, []);
});

test('normalizeConfig — install/test derive from packageManager', () => {
  const c = normalizeConfig({ packageManager: 'pnpm' });
  assert.equal(c.install, 'pnpm install');
  assert.equal(c.test, 'pnpm test');
});

test('normalizeConfig — explicit install/test override derived', () => {
  const c = normalizeConfig({ packageManager: 'pnpm', install: 'pnpm i --frozen', test: 'pnpm vitest' });
  assert.equal(c.install, 'pnpm i --frozen');
  assert.equal(c.test, 'pnpm vitest');
});

test('normalizeConfig — verify.enabled defaults to true when apps present', () => {
  const c = normalizeConfig({ verify: { apps: [{ name: 'web', cwd: 'apps/web', start: 'next dev', port: 4100 }] } });
  assert.equal(c.verify.enabled, true);
  assert.equal(c.verify.browserApp, 'web'); // defaults to first app
});

test('validateConfig — rejects bad mode', () => {
  assert.throws(() => validateConfig(normalizeConfig({ verify: { mode: 'bogus' } })), /verify\.mode/);
});

test('validateConfig — rejects app missing required fields', () => {
  assert.throws(() => validateConfig(normalizeConfig({ verify: { apps: [{ name: 'x' }] } })), /cwd is required/);
});

test('validateConfig — rejects browserApp not matching an app', () => {
  const raw = { verify: { browserApp: 'nope', apps: [{ name: 'web', cwd: 'a', start: 's', port: 1 }] } };
  assert.throws(() => validateConfig(normalizeConfig(raw)), /browserApp/);
});

test('loadConfig — missing file returns defaults', async () => {
  const c = await loadConfig(path.join(tmp, 'tasks'));
  assert.equal(c.packageManager, 'npm');
});

test('writeConfig + loadConfig — round-trips normalized config', async () => {
  const tasksDir = path.join(tmp, 'tasks');
  const payload = {
    packageManager: 'pnpm',
    verify: { mode: 'checkout', apps: [{ name: 'web', cwd: 'apps/web', start: 'pnpm dev', port: 3000 }] },
  };
  const file = await writeConfig(tasksDir, payload);
  assert.ok(file.endsWith('auto-tasks.config.json'));
  const loaded = await loadConfig(tasksDir);
  assert.equal(loaded.verify.mode, 'checkout');
  assert.equal(loaded.verify.apps[0].port, 3000);
  assert.equal(loaded.install, 'pnpm install');
});

test('writeConfig — refuses invalid payload', async () => {
  await assert.rejects(() => writeConfig(path.join(tmp, 'tasks'), { verify: { apps: [{ name: 'x' }] } }), /invalid config/);
});
```

### Step 2: Run, verify failure

```bash
cd scripts/auto-tasks && node --test __tests__/config.test.js
# Expected: FAIL — Cannot find module '../lib/config'
```

### Step 3: Implement `lib/config.js`

```js
const fs = require('node:fs/promises');
const path = require('node:path');

const CONFIG_FILE = 'auto-tasks.config.json';

function baseDefaults() {
  return {
    packageManager: 'npm',
    worktree: { root: '.claude/worktrees', branchPrefix: 'feature/' },
    moduleRoots: [],
    projectRules: [],
    reviewerAgent: 'elite-code-reviewer',
    cron: { run: '7 * * * *', verify: '*/10 * * * *' },
    verify: { enabled: false, mode: 'worktree', envFile: '.env', browserApp: null, apps: [] },
  };
}

function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }

function normalizeConfig(raw = {}) {
  const d = baseDefaults();
  const r = obj(raw);
  const pm = r.packageManager || d.packageManager;
  const v = obj(r.verify);
  const apps = Array.isArray(v.apps) ? v.apps : d.verify.apps;
  return {
    packageManager: pm,
    install: r.install || `${pm} install`,
    test: r.test || `${pm} test`,
    worktree: { ...d.worktree, ...obj(r.worktree) },
    moduleRoots: Array.isArray(r.moduleRoots) ? r.moduleRoots : d.moduleRoots,
    projectRules: Array.isArray(r.projectRules) ? r.projectRules : d.projectRules,
    reviewerAgent: r.reviewerAgent || d.reviewerAgent,
    cron: { ...d.cron, ...obj(r.cron) },
    verify: {
      enabled: v.enabled !== undefined ? !!v.enabled : apps.length > 0,
      mode: v.mode || d.verify.mode,
      envFile: v.envFile || d.verify.envFile,
      browserApp: v.browserApp || (apps[0] && apps[0].name) || null,
      apps,
    },
  };
}

function validateConfig(cfg) {
  const errors = [];
  if (!['worktree', 'checkout'].includes(cfg.verify.mode)) {
    errors.push(`verify.mode must be 'worktree' or 'checkout' (got '${cfg.verify.mode}')`);
  }
  const names = new Set();
  cfg.verify.apps.forEach((app, i) => {
    if (!app.name) errors.push(`verify.apps[${i}].name is required`);
    if (!app.cwd) errors.push(`verify.apps[${i}].cwd is required`);
    if (!app.start) errors.push(`verify.apps[${i}].start is required`);
    if (typeof app.port !== 'number') errors.push(`verify.apps[${i}].port must be a number`);
    if (app.name) {
      if (names.has(app.name)) errors.push(`duplicate app name '${app.name}'`);
      names.add(app.name);
    }
  });
  if (cfg.verify.browserApp && !names.has(cfg.verify.browserApp)) {
    errors.push(`verify.browserApp '${cfg.verify.browserApp}' does not match any app`);
  }
  if (errors.length) throw new Error('invalid config: ' + errors.join('; '));
  return cfg;
}

async function loadConfig(tasksDir) {
  const file = path.join(tasksDir, CONFIG_FILE);
  let raw = {};
  try { raw = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (err) { if (err.code !== 'ENOENT') throw err; }
  return normalizeConfig(raw);
}

async function writeConfig(tasksDir, payload) {
  const normalized = validateConfig(normalizeConfig(payload));
  const file = path.join(tasksDir, CONFIG_FILE);
  await fs.mkdir(tasksDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
  return file;
}

module.exports = { CONFIG_FILE, baseDefaults, normalizeConfig, validateConfig, loadConfig, writeConfig };
```

### Step 4: Verify + commit

```bash
node --test __tests__/config.test.js   # Expected: PASS
git add scripts/auto-tasks/lib/config.js scripts/auto-tasks/__tests__/config.test.js
git commit -m "Add auto-tasks project config lib (defaults/normalize/validate/load/write)"
```

---

## Task 2: CLI `config` subcommand (TDD)

**Files:** `scripts/auto-tasks/index.js`, `scripts/auto-tasks/__tests__/index.cli.test.js`

### Step 1: Failing tests (append to `index.cli.test.js`)

```js
test('CLI config — prints defaults when no config file', () => {
  const out = run(['config']);
  assert.equal(out.packageManager, 'npm');
  assert.equal(out.verify.mode, 'worktree');
});

test('CLI config --set — writes then reads back', async () => {
  const payload = { packageManager: 'pnpm', verify: { apps: [{ name: 'web', cwd: 'apps/web', start: 'pnpm dev', port: 4100 }] } };
  const p = path.join(tmp, 'cfg.json');
  await fs.writeFile(p, JSON.stringify(payload));
  const set = run(['config', '--set', p]);
  assert.equal(set.ok, true);
  const read = run(['config']);
  assert.equal(read.packageManager, 'pnpm');
  assert.equal(read.verify.apps[0].name, 'web');
  assert.equal(read.install, 'pnpm install');
});
```

### Step 2: Verify failure

```bash
node --test __tests__/index.cli.test.js   # Expected: FAIL — help printed, JSON.parse error / wrong output
```

### Step 3: Implement in `index.js`

Add to imports:
```js
const { loadConfig, writeConfig } = require('./lib/config');
```
Add command:
```js
async function cmdConfig(args) {
  const tasksDir = tasksRoot(args);
  if (args.set) {
    const payload = JSON.parse(await fs.readFile(args.set, 'utf8'));
    const file = await writeConfig(tasksDir, payload);
    print({ ok: true, path: file });
    return;
  }
  print(await loadConfig(tasksDir));
}
```
Register in `commands`: `'config': cmdConfig,`

### Step 4: Verify + commit

```bash
node --test __tests__/index.cli.test.js   # Expected: PASS
git add scripts/auto-tasks/index.js scripts/auto-tasks/__tests__/index.cli.test.js
git commit -m "Add 'config' CLI subcommand (read/normalize, --set write)"
```

---

## Task 3: Generalize `grouping.js` (TDD)

**Files:** `scripts/auto-tasks/lib/grouping.js`, `scripts/auto-tasks/__tests__/grouping.test.js`

### Step 1: Update tests for the new signature

In `grouping.test.js`, change the two module-dependent tests to pass `moduleRoots`:

```js
const ROOTS = ['apps/*/src/*', 'packages/*/src/*'];

test('detectModule — returns module root for known paths', () => {
  assert.equal(detectModule('apps/web/src/components/TableView.tsx', ROOTS), 'apps/web/src/components');
  assert.equal(detectModule('apps/api/src/routes/tables.ts', ROOTS), 'apps/api/src/routes');
  assert.equal(detectModule('packages/db/src/schema/table_rows.ts', ROOTS), 'packages/db/src/schema');
  assert.equal(detectModule('README.md', ROOTS), null);
});

test('detectModule — no moduleRoots returns null', () => {
  assert.equal(detectModule('apps/web/src/components/TableView.tsx'), null);
});

test('groupCandidates — groups by shared module when no file overlap', () => {
  const cands = [
    { title: 'A', files: ['apps/web/src/components/Foo.tsx'] },
    { title: 'B', files: ['apps/web/src/components/Bar.tsx'] },
    { title: 'C', files: ['apps/api/src/routes/tables.ts'] },
  ];
  const { groups, standalone } = groupCandidates(cands, ROOTS);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].module, 'apps/web/src/components');
  assert.equal(standalone.length, 1);
});
```

(File-only and topic-only tests stay as-is — they don't rely on modules.)

### Step 2: Verify failure

```bash
node --test __tests__/grouping.test.js   # Expected: FAIL — detectModule ignores 2nd arg / module null
```

### Step 3: Implement — replace `MODULE_PATTERNS` + `detectModule`

```js
function globToRegex(glob) {
  const escaped = String(glob).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+');
  return new RegExp('^' + escaped);
}

function detectModule(filePath, moduleRoots = []) {
  for (const g of moduleRoots) {
    const m = String(filePath).match(globToRegex(g));
    if (m) return m[0];
  }
  return null;
}
```
Change `groupCandidates(candidates, moduleRoots = [])` and inside it use `detectModule(f, moduleRoots)`.

### Step 4: Verify + commit

```bash
node --test __tests__/grouping.test.js   # Expected: PASS
git add scripts/auto-tasks/lib/grouping.js scripts/auto-tasks/__tests__/grouping.test.js
git commit -m "Make grouping module detection config-driven (moduleRoots glob patterns)"
```

---

## Task 4: Wire `group-candidates` + `find-related` to config

**Files:** `scripts/auto-tasks/index.js`

### Step 1: Update both commands to load `moduleRoots`

```js
async function cmdGroupCandidates(args) {
  if (!args.json) throw new Error('--json required');
  const cands = JSON.parse(await fs.readFile(args.json, 'utf8'));
  const { moduleRoots } = await loadConfig(tasksRoot(args));
  print(groupCandidates(cands, moduleRoots));
}
```
In `cmdFindRelated`, load `const { moduleRoots } = await loadConfig(tasksRoot(args));` and replace both `detectModule(...)` calls with `detectModule(x, moduleRoots)`.

### Step 2: Verify (existing CLI tests, no config in tmp → empty moduleRoots → file-overlap grouping unchanged) + commit

```bash
node --test __tests__/   # Expected: PASS (all)
git add scripts/auto-tasks/index.js
git commit -m "Load moduleRoots from config in group-candidates/find-related"
```

---

## Task 5: Remove legacy `archive` subcommand + `done` path

**Files:** `scripts/auto-tasks/index.js`, `scripts/auto-tasks/lib/taskStore.js`, `scripts/auto-tasks/__tests__/taskStore.test.js`, `scripts/auto-tasks/__tests__/index.cli.test.js`

### Step 1: Update tests first

- `taskStore.test.js`: remove the `moveToArchive — moves processing → archive with patch` test and drop `moveToArchive` from the destructured import.
- `index.cli.test.js`: replace the `CLI claim + archive — end-to-end` test body with a claim-only assertion:

```js
test('CLI claim — moves task to processing', async () => {
  const payload = { title: 'T', body: '## Context\n', status: 'for_dev' };
  const payloadPath = path.join(tmp, 'p.json');
  await fs.writeFile(payloadPath, JSON.stringify(payload));
  const created = run(['create', '--json', payloadPath]);
  const claim = run(['claim', '--id', created.id, '--worktree', '.claude/worktrees/t', '--branch', 'feature/t']);
  assert.equal(claim.claimed, true);
  assert.equal(claim.task.frontmatter.status, 'processing');
  const proc = await fs.readdir(path.join(tmp, 'tasks', 'processing'));
  assert.equal(proc.length, 1);
});
```

### Step 2: Verify failure

```bash
node --test __tests__/   # Expected: FAIL — moveToArchive still exported/used referenced by removed tests is fine; archive cmd still present
```

### Step 3: Implement removals

- `index.js`: delete `cmdArchive`, remove `'archive': cmdArchive,` from dispatch, remove `moveToArchive` from the `require('./lib/taskStore')` destructure.
- `taskStore.js`: delete `moveToArchive` function and remove it from `module.exports`.

### Step 4: Verify + commit

```bash
node --test __tests__/   # Expected: PASS
git add -A scripts/auto-tasks
git commit -m "Remove legacy archive subcommand + done status (superseded by verify-complete)"
```

---

## Task 6: Rewrite `auto-tasks.md` (config-driven + install)

**Files:** `.claude/commands/auto-tasks.md`

No automated tests (markdown instructions). Verify by reading for internal consistency + a manual install dry-run in Task 8.

### Step 1: Subcommand list (top of file)

- Remove the `install-cron` and `uninstall-cron` bullets.
- Add: `- `install` — detect the project stack, write `tasks/auto-tasks.config.json`, and install the crons (one-time setup; run this first)`.

### Step 2: Add a "Configuration" note after the Arguments section

> All `run`/`verify` behavior is driven by `tasks/auto-tasks.config.json`. Read it with
> `node scripts/auto-tasks/index.js config` (prints normalized JSON with defaults applied).
> Run `/auto-tasks install` once before anything else.

### Step 3: New `### Subcommand: install`

Spec the flow (Claude-driven, interactive):

1. Detect package manager: check for `pnpm-lock.yaml` / `package-lock.json` / `yarn.lock` / `bun.lockb`.
2. Detect monorepo: `pnpm-workspace.yaml` or `package.json#workspaces`; collect app dirs (`apps/*` and workspace globs). For each, Read its `package.json` — infer framework from deps (next/vite/react-router/hono/express/fastify/nest) and the `dev`/`start` script; propose `cwd`, `start`, `port` (from the dev script or a sensible default), `health` (`/healthz` if api-like) or `readyLog` (`Ready in` for Next), and `env` overrides for cross-app URLs.
3. Present the inferred config; for each unclear field use `AskUserQuestion` (apps to verify, ports, start commands, which app is `browserApp`). One decision per prompt.
4. Ask `verify.mode` via `AskUserQuestion`: `worktree` (isolated, default) vs `checkout` (checks out the branch in the main repo — requires a clean tree).
5. List `.claude/rules/*.md`; `AskUserQuestion` (multiSelect) which to inject as `projectRules` (or none).
6. Ask `cron.run` / `cron.verify` schedules (defaults `7 * * * *` / `*/10 * * * *`).
7. Build the payload, write `/tmp/at-config.json`, then `node scripts/auto-tasks/index.js config --set /tmp/at-config.json`. Print the saved path.
8. Offer (AskUserQuestion `[install crons / skip]`) to install the crons — the logic previously in `install-cron`: `CronCreate` `cron.run` → prompt `/auto-tasks run` → save id to `tasks/.cron-id`; `CronCreate` `cron.verify` → `/auto-tasks verify` → `tasks/.cron-id-verify`. Skip any whose id-file already exists.

### Step 4: Make `run` config-driven

At the top of `run`, load config: `CFG=$(node scripts/auto-tasks/index.js config)` and parse fields. Then:
- Step 5 worktree setup: `<config.worktree.root>/<slug>`, branch `<config.worktree.branchPrefix><slug>`, and replace `pnpm install` with `<config.install>`.
- Step 6 dispatch prompt: replace the hardcoded "portability-check.md … composite-pk.md" sentence with: *"follow the project rules listed in `config.projectRules`: <list the paths>"* (omit the sentence entirely when the list is empty). Replace `pnpm test` with `<config.test>`.
- Step 8 review: use `subagent_type: <config.reviewerAgent>`.

### Step 5: Make `verify` config-driven (replace steps 8–11 + cleanup)

Replace the Next.js/Hono-specific startup with a config-driven loop:

```
CFG = node scripts/auto-tasks/index.js config   # verify.enabled, mode, envFile, apps[], browserApp
REPO_ROOT = git rev-parse --show-toplevel
```

- If `verify.enabled` is false → `verify-complete` with `{"acs":[],"notes":"verify disabled in config"}`, cleanup, exit.
- **Resolve BASE by mode:**
  - `worktree`: `BASE="$WORKTREE"` (main repo untouched).
  - `checkout`: guard `git -C "$REPO_ROOT" status --porcelain` — if non-empty → `verify-complete` `{"acs":[],"notes":"working tree dirty; cannot checkout for verify"}`, exit. Else `ORIG_BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)`, `git -C "$REPO_ROOT" checkout "<task.branch>"`, `BASE="$REPO_ROOT"`. Register `git -C "$REPO_ROOT" checkout "$ORIG_BRANCH"` in the `finally` cleanup.
- **Start each app in `config.verify.apps`** (in order):
  ```
  cd "$BASE/<app.cwd>"
  # port injection: if app.portEnv → prefix `<app.portEnv>=<app.port>`; build CMD = <app.start> (+ " <app.portArg> <app.port>" if app.portArg)
  # env overrides: each key in app.env as KEY=VALUE prefix
  # dotenv base: if config.verify.envFile present → wrap with `pnpm exec dotenv -e "$REPO_ROOT/<envFile>" --` (use config.packageManager exec equivalent)
  nohup <env+port prefixes> <CMD> > /tmp/verify-<app.name>.log 2>&1 &
  echo $! > .claude/verify-<app.name>.pid
  # readiness: app.health → poll http://localhost:<app.port><app.health>; elif app.readyLog → grep "<app.readyLog>" /tmp/verify-<app.name>.log; else poll http://localhost:<app.port>/
  ```
  On any startup timeout → `verify-complete` `{"acs":[],"notes":"<app.name> startup timeout on :<port>"}`, cleanup, exit.
- **Browser base URL:** `BROWSER_PORT` = port of the app named `config.verify.browserApp`. Subagent navigates to `http://localhost:$BROWSER_PORT<task.test_url>`.
- **Cleanup (`finally`):** kill every `.claude/verify-*.pid` (TERM, wait, KILL), `rm -f` them; if `checkout` mode → restore `$ORIG_BRANCH`; `rm -f .claude/verify.lock`.

### Step 6: Remove the two cron sections

Delete `### Subcommand: install-cron` and `### Subcommand: uninstall-cron` entirely.

### Step 7: Commit

```bash
git add .claude/commands/auto-tasks.md
git commit -m "Make auto-tasks.md config-driven; add install subcommand; drop cron install/uninstall + legacy archive refs"
```

---

## Task 7: Doc + gitignore fixes

**Files:** `tasks/README.md`, `.gitignore`

### Step 1: `tasks/README.md`

- Directories table: change every "Committed." to "Local-only (gitignored)."; add a row noting `auto-tasks.config.json` IS committed.
- Fix the stale inline status comment (`# new | for_dev | processing | done | failed`) to the full lifecycle: `new | for_dev | processing | awaiting_verification | verifying | not_verified | verified | failed`.
- Replace the `install-cron` mentions in "Executing tasks"/"Verification" with `/auto-tasks install` (one-time setup writes config + installs both crons).
- Add a short "Configuration" subsection documenting `tasks/auto-tasks.config.json` and that `/auto-tasks install` generates it.

### Step 2: `.gitignore`

- Add the trailing newline (file currently ends without one).
- Add a comment line that `tasks/auto-tasks.config.json` is intentionally tracked (no ignore rule needed — it is not under `tasks/inbox|processing|archive/*`).

### Step 3: Commit

```bash
git add tasks/README.md .gitignore
git commit -m "Docs: task files are local-only; document config + /auto-tasks install; fix status list"
```

---

## Task 8: Full verification

### Step 1: Full suite

```bash
cd scripts/auto-tasks && node --test __tests__/
# Expected: PASS — all (existing 88 + config/grouping/cli additions, minus removed archive tests)
```

### Step 2: Manual install dry-run (in `project/`)

```bash
node scripts/auto-tasks/index.js config   # prints defaults
# hand-write a /tmp/cfg.json mirroring this repo, then:
node scripts/auto-tasks/index.js config --set /tmp/cfg.json
node scripts/auto-tasks/index.js config   # confirm round-trip
```

### Step 3: Self-review

Run `elite-code-reviewer` on all changed files (per `.claude/rules/code-review.md`); fix until score ≥ 7.

### Step 4: Read-through of `auto-tasks.md`

Confirm: no remaining hardcoded `:4100`/`:4101`/`pnpm`/`Next`/`Hono`/`portability-check`/`composite-pk`; `run`/`verify` reference `config`; `install` present; cron sections gone.

---

## Execution options

1. **Sequential** (recommended here): tasks share files (`index.js`, `grouping.js`) and have ordering deps (1→2→4, 3→4, 5 after); work top-to-bottom with a commit per task.
2. **Subagent-driven:** Tasks 1 and 3 are independent and could be parallelized, but the shared `index.js` edits in 2/4/5 serialize quickly — limited upside.
