const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { listTasks, readTask, writeTask, atomicClaim, moveToArchive, markFailed, transitionStatusInPlace } = require('../lib/taskStore');
const { serializeTaskFile } = require('../lib/frontmatter');

let tmp;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-tasks-'));
  for (const sub of ['inbox', 'processing', 'archive']) {
    await fs.mkdir(path.join(tmp, sub), { recursive: true });
  }
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function seed(dir, id, slug, fm = {}) {
  const frontmatter = {
    id, title: slug, status: 'for_dev', priority: 'normal',
    created_at: '2026-04-17T10:00:00Z', updated_at: '2026-04-17T10:00:00Z',
    worktree: null, branch: null, review_score: null, attempts: 0,
    last_error: null, source: null, merged_from: [],
    ...fm,
  };
  const body = '## Context\n\nbody\n';
  const filename = `${id}-${slug}.md`;
  await fs.writeFile(path.join(tmp, dir, filename), serializeTaskFile(frontmatter, body));
  return filename;
}

test('listTasks — returns all inbox + processing + archive by default', async () => {
  await seed('inbox', '2026-04-17-001', 'a');
  await seed('processing', '2026-04-17-002', 'b', { status: 'processing' });
  await seed('archive', '2026-04-17-003', 'c', { status: 'done' });

  const tasks = await listTasks(tmp);
  assert.equal(tasks.length, 3);
  const byStatus = Object.fromEntries(tasks.map((t) => [t.frontmatter.status, t.dir]));
  assert.equal(byStatus.for_dev, 'inbox');
  assert.equal(byStatus.processing, 'processing');
  assert.equal(byStatus.done, 'archive');
});

test('listTasks — filters by status', async () => {
  await seed('inbox', '2026-04-17-001', 'a');
  await seed('inbox', '2026-04-17-002', 'b', { status: 'new' });
  const open = await listTasks(tmp, { status: 'for_dev' });
  assert.equal(open.length, 1);
  assert.equal(open[0].id, '2026-04-17-001');
});

test('readTask — returns null for missing id', async () => {
  assert.equal(await readTask(tmp, 'nope'), null);
});

test('atomicClaim — moves inbox → processing and patches frontmatter', async () => {
  await seed('inbox', '2026-04-17-001', 'foo');
  const claimed = await atomicClaim(tmp, '2026-04-17-001', {
    status: 'processing',
    worktree: '.claude/worktrees/foo',
    branch: 'feature/foo',
    updated_at: '2026-04-17T12:00:00Z',
  });
  assert.ok(claimed);
  assert.equal(claimed.dir, 'processing');
  assert.equal(claimed.frontmatter.status, 'processing');
  assert.equal(claimed.frontmatter.worktree, '.claude/worktrees/foo');

  const inboxEntries = await fs.readdir(path.join(tmp, 'inbox'));
  assert.equal(inboxEntries.length, 0);
});

test('atomicClaim — returns null when source already gone (lost race)', async () => {
  const r = await atomicClaim(tmp, '2026-04-17-999', { status: 'processing' });
  assert.equal(r, null);
});

test('atomicClaim — returns null when task is not in for_dev', async () => {
  await seed('inbox', '2026-04-17-001', 'foo', { status: 'new' });
  const r = await atomicClaim(tmp, '2026-04-17-001', { status: 'processing' });
  assert.equal(r, null);
  const t = await readTask(tmp, '2026-04-17-001');
  assert.equal(t.dir, 'inbox');
  assert.equal(t.frontmatter.status, 'new');
});

test('moveToArchive — moves processing → archive with patch', async () => {
  await seed('processing', '2026-04-17-001', 'foo', { status: 'processing' });
  const archived = await moveToArchive(tmp, '2026-04-17-001', { status: 'done', review_score: 8 });
  assert.equal(archived.dir, 'archive');
  assert.equal(archived.frontmatter.status, 'done');
  assert.equal(archived.frontmatter.review_score, 8);

  const procEntries = await fs.readdir(path.join(tmp, 'processing'));
  assert.equal(procEntries.length, 0);
});

test('markFailed — keeps in processing with status:failed + last_error', async () => {
  await seed('processing', '2026-04-17-001', 'foo', { status: 'processing' });
  const failed = await markFailed(tmp, '2026-04-17-001', 'boom');
  assert.equal(failed.dir, 'processing');
  assert.equal(failed.frontmatter.status, 'failed');
  assert.equal(failed.frontmatter.last_error, 'boom');
});

test('writeTask — creates a new file in inbox', async () => {
  const fm = {
    id: '2026-04-17-010', title: 'Fresh', status: 'new', priority: 'normal',
    created_at: '2026-04-17T10:00:00Z', updated_at: '2026-04-17T10:00:00Z',
    worktree: null, branch: null, review_score: null, attempts: 0,
    last_error: null, source: null, merged_from: [],
  };
  await writeTask(tmp, 'inbox', { id: fm.id, slug: 'fresh', frontmatter: fm, body: '## Context\nfresh\n' });
  const t = await readTask(tmp, '2026-04-17-010');
  assert.equal(t.dir, 'inbox');
  assert.equal(t.frontmatter.title, 'Fresh');
});

test('atomicClaim — exactly one of two concurrent claims wins', async () => {
  await seed('inbox', '2026-04-17-001', 'foo');
  const [a, b] = await Promise.all([
    atomicClaim(tmp, '2026-04-17-001', { status: 'processing', worktree: 'a' }),
    atomicClaim(tmp, '2026-04-17-001', { status: 'processing', worktree: 'b' }),
  ]);
  const winners = [a, b].filter(Boolean);
  assert.equal(winners.length, 1);
  assert.equal((await fs.readdir(path.join(tmp, 'inbox'))).length, 0);
  assert.equal((await fs.readdir(path.join(tmp, 'processing'))).length, 1);
});

test('atomicClaim — recovers from partial-claim (rename happened but patch did not)', async () => {
  // Simulate: task is already in processing/ but status is still for_dev
  await seed('processing', '2026-04-17-001', 'foo', { status: 'for_dev' });
  const claimed = await atomicClaim(tmp, '2026-04-17-001', {
    status: 'processing', worktree: 'w', branch: 'b', updated_at: 'now',
  });
  assert.ok(claimed);
  assert.equal(claimed.frontmatter.status, 'processing');
  assert.equal(claimed.frontmatter.worktree, 'w');
});

test('readTask — throws when id exists in multiple directories', async () => {
  await seed('inbox', '2026-04-17-001', 'foo');
  await seed('processing', '2026-04-17-001', 'foo', { status: 'processing' });
  await assert.rejects(() => readTask(tmp, '2026-04-17-001'), /multiple dirs/);
});

test('parseFilename — accepts slugs with uppercase and underscores via listTasks', async () => {
  // Manually write a file with a non-canonical slug (simulating human rename)
  const fm = {
    id: '2026-04-17-005', title: 'Renamed', status: 'new', priority: 'normal',
    created_at: 'x', updated_at: 'x', worktree: null, branch: null,
    review_score: null, attempts: 0, last_error: null, source: null, merged_from: [],
  };
  const { serializeTaskFile } = require('../lib/frontmatter');
  await fs.writeFile(
    path.join(tmp, 'inbox', '2026-04-17-005-HAS_UPPER.md'),
    serializeTaskFile(fm, '## Context\n')
  );
  const tasks = await listTasks(tmp);
  assert.equal(tasks.some((t) => t.id === '2026-04-17-005'), true);
});

test('transitionStatusInPlace — updates status when current matches fromStatus', async () => {
  await seed('processing', '2026-04-17-020', 'foo', { status: 'processing' });
  const result = await transitionStatusInPlace(tmp, '2026-04-17-020', {
    fromStatus: 'processing',
    patch: { status: 'awaiting_verification', review_score: 9 },
  });
  assert.ok(result);
  assert.equal(result.frontmatter.status, 'awaiting_verification');
  assert.equal(result.frontmatter.review_score, 9);
  assert.equal(result.dir, 'processing');
});

test('transitionStatusInPlace — returns null when status does not match', async () => {
  await seed('processing', '2026-04-17-021', 'foo', { status: 'processing' });
  const result = await transitionStatusInPlace(tmp, '2026-04-17-021', {
    fromStatus: 'awaiting_verification',
    patch: { status: 'verifying' },
  });
  assert.equal(result, null);
  const unchanged = await readTask(tmp, '2026-04-17-021');
  assert.equal(unchanged.frontmatter.status, 'processing');
});

test('transitionStatusInPlace — leaves body unchanged, updates updated_at', async () => {
  await seed('processing', '2026-04-17-022', 'foo', { status: 'awaiting_verification', updated_at: '2020-01-01T00:00:00Z' });
  const result = await transitionStatusInPlace(tmp, '2026-04-17-022', {
    fromStatus: 'awaiting_verification',
    patch: { status: 'verifying' },
  });
  assert.match(result.body, /## Context/);
  assert.notEqual(result.frontmatter.updated_at, '2020-01-01T00:00:00Z');
});

test('transitionStatusInPlace — returns null for missing task', async () => {
  const result = await transitionStatusInPlace(tmp, '9999-99-99-999', {
    fromStatus: 'any', patch: {},
  });
  assert.equal(result, null);
});
