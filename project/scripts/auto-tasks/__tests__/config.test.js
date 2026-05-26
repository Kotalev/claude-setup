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
