const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', 'index.js');
let tmp;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-tasks-cli-'));
  for (const d of ['inbox', 'processing', 'archive']) {
    await fs.mkdir(path.join(tmp, 'tasks', d), { recursive: true });
  }
  await fs.mkdir(path.join(tmp, '.git'), { recursive: true });
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

function run(args) {
  return JSON.parse(execFileSync('node', [CLI, ...args, '--root', tmp], { encoding: 'utf8' }));
}

test('CLI next-id — returns 001 in empty tasks dir', () => {
  const out = run(['next-id', '--date', '2026-04-17']);
  assert.equal(out.id, '2026-04-17-001');
});

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

test('CLI create — writes a new task in inbox/', async () => {
  const payload = { title: 'Fix foo', body: '## Context\nbody\n' };
  const payloadPath = path.join(tmp, 'payload.json');
  await fs.writeFile(payloadPath, JSON.stringify(payload));
  const out = run(['create', '--json', payloadPath]);
  assert.match(out.id, /^\d{4}-\d{2}-\d{2}-\d{3}$/);
  assert.ok(out.path.endsWith('.md'));
  const content = await fs.readFile(out.path, 'utf8');
  assert.match(content, /title: Fix foo/);
  assert.match(content, /status: new/);
});

test('CLI approve — flips new → for_dev', async () => {
  await fs.writeFile(path.join(tmp, 'tasks', 'inbox', '2026-04-17-001-t.md'),
    '---\nid: 2026-04-17-001\ntitle: t\nstatus: new\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: null\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\n---\n\nbody\n');
  run(['approve', '--id', '2026-04-17-001']);
  const content = await fs.readFile(path.join(tmp, 'tasks', 'inbox', '2026-04-17-001-t.md'), 'utf8');
  assert.match(content, /status: for_dev/);
});

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

test('CLI group-candidates — groups by file overlap', async () => {
  const payload = [
    { title: 'A', files: ['foo.js'] },
    { title: 'B', files: ['foo.js', 'bar.js'] },
    { title: 'C', files: ['qux.js'] },
  ];
  const p = path.join(tmp, 'group.json');
  await fs.writeFile(p, JSON.stringify(payload));
  const out = run(['group-candidates', '--json', p]);
  assert.equal(out.groups.length, 1);
  assert.equal(out.standalone.length, 1);
});

test('CLI complete-dev — test_url populated → awaiting_verification', async () => {
  const file = '2026-04-17-030-x.md';
  await fs.writeFile(path.join(tmp, 'tasks', 'processing', file),
    '---\nid: 2026-04-17-030\ntitle: x\nstatus: processing\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: null\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: "/pdf/test-token"\nverified_at: null\nverify_notes: null\n---\n\nbody\n');
  const out = run(['complete-dev', '--id', '2026-04-17-030', '--review-score', '8']);
  assert.equal(out.id, '2026-04-17-030');
  assert.equal(out.status, 'awaiting_verification');
  const content = await fs.readFile(path.join(tmp, 'tasks', 'processing', file), 'utf8');
  assert.match(content, /status: awaiting_verification/);
  assert.match(content, /review_score: 8/);
});

test('CLI complete-dev — test_url null → not_verified', async () => {
  const file = '2026-04-17-031-x.md';
  await fs.writeFile(path.join(tmp, 'tasks', 'processing', file),
    '---\nid: 2026-04-17-031\ntitle: x\nstatus: processing\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: null\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: null\nverified_at: null\nverify_notes: null\n---\n\nbody\n');
  const out = run(['complete-dev', '--id', '2026-04-17-031', '--review-score', '9']);
  assert.equal(out.status, 'not_verified');
  const content = await fs.readFile(path.join(tmp, 'tasks', 'processing', file), 'utf8');
  assert.match(content, /status: not_verified/);
});

test('CLI complete-dev — fails if task not in processing', async () => {
  const file = '2026-04-17-032-x.md';
  await fs.writeFile(path.join(tmp, 'tasks', 'inbox', file),
    '---\nid: 2026-04-17-032\ntitle: x\nstatus: for_dev\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: null\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: null\nverified_at: null\nverify_notes: null\n---\n\nbody\n');
  assert.throws(() => run(['complete-dev', '--id', '2026-04-17-032', '--review-score', '8']));
});

test('CLI verify-claim — awaiting_verification → verifying, stays in processing/', async () => {
  const file = '2026-04-17-040-x.md';
  await fs.writeFile(path.join(tmp, 'tasks', 'processing', file),
    '---\nid: 2026-04-17-040\ntitle: x\nstatus: awaiting_verification\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: ".claude/worktrees/x"\nbranch: null\nreview_score: 8\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: "/pdf/t"\nverified_at: null\nverify_notes: null\n---\n\nbody\n');
  const out = run(['verify-claim', '--id', '2026-04-17-040']);
  assert.equal(out.claimed, true);
  assert.equal(out.task.frontmatter.status, 'verifying');
  const content = await fs.readFile(path.join(tmp, 'tasks', 'processing', file), 'utf8');
  assert.match(content, /status: verifying/);
});

test('CLI verify-claim — refuses task not in awaiting_verification', async () => {
  const file = '2026-04-17-041-x.md';
  await fs.writeFile(path.join(tmp, 'tasks', 'processing', file),
    '---\nid: 2026-04-17-041\ntitle: x\nstatus: processing\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: null\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: null\nverified_at: null\nverify_notes: null\n---\n\nbody\n');
  const out = run(['verify-claim', '--id', '2026-04-17-041']);
  assert.equal(out.claimed, false);
});

test('CLI verify-complete — all acs passed → verified + archive move + AC ticks', async () => {
  const file = '2026-04-17-050-x.md';
  const body = '## Acceptance Criteria\n- [ ] First thing works\n- [ ] Second thing works\n';
  await fs.writeFile(path.join(tmp, 'tasks', 'processing', file),
    `---\nid: 2026-04-17-050\ntitle: x\nstatus: verifying\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: 8\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: "/t"\nverified_at: null\nverify_notes: null\n---\n\n${body}`);

  const payload = {
    acs: [
      { text: 'First thing works', passed: true, evidence: 'screenshot ok' },
      { text: 'Second thing works', passed: true, evidence: 'interaction ok' },
    ],
    notes: 'both pass',
  };
  const payloadPath = path.join(tmp, 'payload.json');
  await fs.writeFile(payloadPath, JSON.stringify(payload));

  const out = run(['verify-complete', '--id', '2026-04-17-050', '--json', payloadPath]);
  assert.equal(out.status, 'verified');

  const archived = await fs.readFile(path.join(tmp, 'tasks', 'archive', file), 'utf8');
  assert.match(archived, /status: verified/);
  assert.match(archived, /verify_notes: both pass/);
  assert.match(archived, /- \[x\] First thing works/);
  assert.match(archived, /- \[x\] Second thing works/);

  const processingEntries = await fs.readdir(path.join(tmp, 'tasks', 'processing'));
  assert.equal(processingEntries.includes(file), false);
});

test('CLI verify-complete — any ac failed → not_verified stays in processing/', async () => {
  const file = '2026-04-17-051-x.md';
  const body = '## Acceptance Criteria\n- [ ] A works\n- [ ] B works\n';
  await fs.writeFile(path.join(tmp, 'tasks', 'processing', file),
    `---\nid: 2026-04-17-051\ntitle: x\nstatus: verifying\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: 8\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: "/t"\nverified_at: null\nverify_notes: null\n---\n\n${body}`);

  const payload = {
    acs: [
      { text: 'A works', passed: true, evidence: 'ok' },
      { text: 'B works', passed: false, evidence: 'still broken' },
    ],
    notes: 'A ok, B failed',
  };
  const payloadPath = path.join(tmp, 'payload.json');
  await fs.writeFile(payloadPath, JSON.stringify(payload));

  const out = run(['verify-complete', '--id', '2026-04-17-051', '--json', payloadPath]);
  assert.equal(out.status, 'not_verified');

  const stillInProcessing = await fs.readFile(path.join(tmp, 'tasks', 'processing', file), 'utf8');
  assert.match(stillInProcessing, /status: not_verified/);
  assert.match(stillInProcessing, /- \[x\] A works/);
  assert.match(stillInProcessing, /- \[ \] B works/);

  const archiveEntries = await fs.readdir(path.join(tmp, 'tasks', 'archive'));
  assert.equal(archiveEntries.includes(file), false);
});

test('CLI verify-complete — not_verified writes Verification Report section in body', async () => {
  const file = '2026-04-17-053-x.md';
  const body = '## Context\n\nc\n\n## Acceptance Criteria\n\n- [ ] A works\n- [ ] B works\n\n## References\n\n- foo.js\n';
  await fs.writeFile(path.join(tmp, 'tasks', 'processing', file),
    `---\nid: 2026-04-17-053\ntitle: x\nstatus: verifying\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: 8\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: "/t"\nverified_at: null\nverify_notes: null\n---\n\n${body}`);

  const payload = {
    acs: [
      { text: 'A works', passed: true, evidence: 'tested ok' },
      { text: 'B works', passed: false, evidence: 'threw exception' },
    ],
    notes: 'B still broken',
  };
  const payloadPath = path.join(tmp, 'payload.json');
  await fs.writeFile(payloadPath, JSON.stringify(payload));

  const out = run(['verify-complete', '--id', '2026-04-17-053', '--json', payloadPath]);
  assert.equal(out.status, 'not_verified');

  const content = await fs.readFile(path.join(tmp, 'tasks', 'processing', file), 'utf8');
  assert.match(content, /## Verification Report/);
  assert.match(content, /status: not_verified/); // in frontmatter too
  assert.match(content, /_Generated: .+ — status: not_verified_/);
  assert.match(content, /\*\*Notes:\*\* B still broken/);
  assert.match(content, /- ✅ A works — tested ok/);
  assert.match(content, /- ❌ B works — threw exception/);
  // Report lives between AC and References
  const acIdx = content.indexOf('## Acceptance Criteria');
  const vrIdx = content.indexOf('## Verification Report');
  const refIdx = content.indexOf('## References');
  assert.ok(acIdx < vrIdx && vrIdx < refIdx);
});

test('CLI verify-complete — verified strips any prior Verification Report before archiving', async () => {
  const file = '2026-04-17-054-x.md';
  const body = [
    '## Acceptance Criteria',
    '',
    '- [ ] A works',
    '',
    '## Verification Report',
    '',
    '_Generated: 2026-04-20T00:00:00Z — status: not_verified_',
    '',
    '- ❌ A works — old failure',
    '',
    '## References',
    '',
    '- foo.js',
    '',
  ].join('\n');
  await fs.writeFile(path.join(tmp, 'tasks', 'processing', file),
    `---\nid: 2026-04-17-054\ntitle: x\nstatus: verifying\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: 8\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: "/t"\nverified_at: null\nverify_notes: "prev"\n---\n\n${body}`);

  const payload = {
    acs: [{ text: 'A works', passed: true, evidence: 'ok now' }],
    notes: 'fixed',
  };
  const payloadPath = path.join(tmp, 'payload.json');
  await fs.writeFile(payloadPath, JSON.stringify(payload));

  const out = run(['verify-complete', '--id', '2026-04-17-054', '--json', payloadPath]);
  assert.equal(out.status, 'verified');

  const archived = await fs.readFile(path.join(tmp, 'tasks', 'archive', file), 'utf8');
  assert.match(archived, /status: verified/);
  assert.match(archived, /- \[x\] A works/);
  assert.doesNotMatch(archived, /## Verification Report/);
  assert.doesNotMatch(archived, /old failure/);
});

test('CLI verify-complete — re-verify overwrites previous Verification Report', async () => {
  const file = '2026-04-17-055-x.md';
  const body = '## Acceptance Criteria\n\n- [ ] A works\n\n## References\n\n- foo.js\n';
  await fs.writeFile(path.join(tmp, 'tasks', 'processing', file),
    `---\nid: 2026-04-17-055\ntitle: x\nstatus: verifying\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: 8\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: "/t"\nverified_at: null\nverify_notes: null\n---\n\n${body}`);

  // First run (not_verified)
  const payload1 = { acs: [{ text: 'A works', passed: false, evidence: 'first fail' }], notes: 'attempt 1' };
  const p1 = path.join(tmp, 'p1.json');
  await fs.writeFile(p1, JSON.stringify(payload1));
  run(['verify-complete', '--id', '2026-04-17-055', '--json', p1]);

  // Manually flip status back to verifying (simulating retry → verify-claim)
  const filePath = path.join(tmp, 'tasks', 'processing', file);
  let content = await fs.readFile(filePath, 'utf8');
  content = content.replace(/status: not_verified/, 'status: verifying');
  await fs.writeFile(filePath, content);

  // Second run (still not_verified, different evidence)
  const payload2 = { acs: [{ text: 'A works', passed: false, evidence: 'second fail' }], notes: 'attempt 2' };
  const p2 = path.join(tmp, 'p2.json');
  await fs.writeFile(p2, JSON.stringify(payload2));
  run(['verify-complete', '--id', '2026-04-17-055', '--json', p2]);

  const final = await fs.readFile(filePath, 'utf8');
  const reportCount = (final.match(/## Verification Report/g) || []).length;
  assert.equal(reportCount, 1, 'only one Verification Report section after re-verify');
  assert.match(final, /second fail/);
  assert.match(final, /attempt 2/);
  assert.doesNotMatch(final, /first fail/);
  assert.doesNotMatch(final, /attempt 1/);
});

test('CLI verify-complete — empty acs array → not_verified (defensive)', async () => {
  const file = '2026-04-17-052-x.md';
  await fs.writeFile(path.join(tmp, 'tasks', 'processing', file),
    '---\nid: 2026-04-17-052\ntitle: x\nstatus: verifying\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: 8\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: "/t"\nverified_at: null\nverify_notes: null\n---\n\nbody\n');
  const payload = { acs: [], notes: 'no acs parsed' };
  const payloadPath = path.join(tmp, 'payload.json');
  await fs.writeFile(payloadPath, JSON.stringify(payload));
  const out = run(['verify-complete', '--id', '2026-04-17-052', '--json', payloadPath]);
  assert.equal(out.status, 'not_verified');
});

test('CLI delete — removes a task file and reports worktree/branch from frontmatter', async () => {
  const file = '2026-04-17-070-x.md';
  await fs.writeFile(path.join(tmp, 'tasks', 'archive', file),
    '---\nid: 2026-04-17-070\ntitle: x\nstatus: commited\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: .claude/worktrees/x\nbranch: feature/x\nreview_score: 8\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: null\nverified_at: null\nverify_notes: null\n---\n\nbody\n');
  const out = run(['delete', '--id', '2026-04-17-070']);
  assert.equal(out.id, '2026-04-17-070');
  assert.equal(out.dir, 'archive');
  assert.equal(out.worktree, '.claude/worktrees/x');
  assert.equal(out.branch, 'feature/x');
  const entries = await fs.readdir(path.join(tmp, 'tasks', 'archive'));
  assert.equal(entries.includes(file), false);
});

test('CLI delete — --require-status accepts comma-separated spellings (commited/committed)', async () => {
  await fs.writeFile(path.join(tmp, 'tasks', 'archive', '2026-04-17-071-a.md'),
    '---\nid: 2026-04-17-071\ntitle: a\nstatus: commited\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: null\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: null\nverified_at: null\nverify_notes: null\n---\n\nbody\n');
  await fs.writeFile(path.join(tmp, 'tasks', 'archive', '2026-04-17-072-b.md'),
    '---\nid: 2026-04-17-072\ntitle: b\nstatus: committed\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: null\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: null\nverified_at: null\nverify_notes: null\n---\n\nbody\n');

  const outA = run(['delete', '--id', '2026-04-17-071', '--require-status', 'commited,committed']);
  assert.equal(outA.id, '2026-04-17-071');
  const outB = run(['delete', '--id', '2026-04-17-072', '--require-status', 'commited,committed']);
  assert.equal(outB.id, '2026-04-17-072');
});

test('CLI delete — --require-status refuses tasks with other statuses', async () => {
  await fs.writeFile(path.join(tmp, 'tasks', 'processing', '2026-04-17-073-x.md'),
    '---\nid: 2026-04-17-073\ntitle: x\nstatus: processing\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: null\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: null\nverified_at: null\nverify_notes: null\n---\n\nbody\n');
  assert.throws(() => run(['delete', '--id', '2026-04-17-073', '--require-status', 'commited,committed']));
  // File must still exist
  const entries = await fs.readdir(path.join(tmp, 'tasks', 'processing'));
  assert.ok(entries.includes('2026-04-17-073-x.md'));
});

test('CLI delete — fails when task does not exist', async () => {
  assert.throws(() => run(['delete', '--id', '2026-04-17-099']));
});

test('CLI migrate-fields — adds missing fields with null defaults', async () => {
  const oldFm = '---\nid: 2026-04-17-060\ntitle: old\nstatus: new\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: null\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\n---\n\nbody\n';
  await fs.writeFile(path.join(tmp, 'tasks', 'inbox', '2026-04-17-060-old.md'), oldFm);

  const out = run(['migrate-fields']);
  assert.equal(out.migrated, 1);

  const content = await fs.readFile(path.join(tmp, 'tasks', 'inbox', '2026-04-17-060-old.md'), 'utf8');
  assert.match(content, /test_url: null/);
  assert.match(content, /verified_at: null/);
  assert.match(content, /verify_notes: null/);
});

test('CLI migrate-fields — idempotent on already-migrated file', async () => {
  const newFm = '---\nid: 2026-04-17-061\ntitle: new\nstatus: new\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: null\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: null\nverified_at: null\nverify_notes: null\n---\n\nbody\n';
  await fs.writeFile(path.join(tmp, 'tasks', 'inbox', '2026-04-17-061-x.md'), newFm);

  run(['migrate-fields']);
  const out2 = run(['migrate-fields']);
  assert.equal(out2.migrated, 0);
});

test('CLI migrate-fields — leaves populated fields untouched', async () => {
  const withUrl = '---\nid: 2026-04-17-062\ntitle: x\nstatus: new\npriority: normal\ncreated_at: x\nupdated_at: x\nworktree: null\nbranch: null\nreview_score: null\nattempts: 0\nlast_error: null\nsource: null\nmerged_from: []\ntest_url: "/existing/url"\n---\n\nbody\n';
  await fs.writeFile(path.join(tmp, 'tasks', 'inbox', '2026-04-17-062-x.md'), withUrl);

  run(['migrate-fields']);

  const content = await fs.readFile(path.join(tmp, 'tasks', 'inbox', '2026-04-17-062-x.md'), 'utf8');
  assert.match(content, /test_url: \/existing\/url/);
  assert.match(content, /verified_at: null/);
  assert.match(content, /verify_notes: null/);
});
