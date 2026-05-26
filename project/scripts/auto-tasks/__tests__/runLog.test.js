const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { appendRunLog, readRunLog } = require('../lib/runLog');

let tmp;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-tasks-log-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

test('appendRunLog — writes one JSON line and is readable', async () => {
  await appendRunLog(tmp, { trigger: 'cron', picked: 2, done: 1, failed: 1, duration_ms: 300 });
  await appendRunLog(tmp, { trigger: 'manual', picked: 0, done: 0, failed: 0, duration_ms: 5 });

  const entries = await readRunLog(tmp);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].trigger, 'cron');
  assert.equal(entries[1].trigger, 'manual');
  assert.ok(entries[0].ts, 'ts should be auto-populated');
});

test('readRunLog — returns [] when log is missing', async () => {
  const entries = await readRunLog(tmp);
  assert.deepEqual(entries, []);
});
