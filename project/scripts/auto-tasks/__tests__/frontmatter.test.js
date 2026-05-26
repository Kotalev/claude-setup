const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseTaskFile, serializeTaskFile, slugify } = require('../lib/frontmatter');

test('parseTaskFile — reads scalar fields, null, empty array, string array', () => {
  const raw = [
    '---',
    'id: 2026-04-17-001',
    'title: Fix thing',
    'status: new',
    'priority: normal',
    'created_at: 2026-04-17T14:30:00Z',
    'updated_at: 2026-04-17T14:30:00Z',
    'worktree: null',
    'branch: null',
    'review_score: null',
    'attempts: 0',
    'last_error: null',
    'source: null',
    'merged_from: []',
    '---',
    '',
    '## Context',
    'Body line 1',
    '',
  ].join('\n');

  const { frontmatter, body } = parseTaskFile(raw);
  assert.equal(frontmatter.id, '2026-04-17-001');
  assert.equal(frontmatter.status, 'new');
  assert.equal(frontmatter.worktree, null);
  assert.equal(frontmatter.attempts, 0);
  assert.deepEqual(frontmatter.merged_from, []);
  assert.match(body, /^## Context/);
});

test('parseTaskFile — string array with values', () => {
  const raw = '---\nmerged_from: ["2026-04-17-002", "2026-04-17-003"]\n---\nbody\n';
  const { frontmatter } = parseTaskFile(raw);
  assert.deepEqual(frontmatter.merged_from, ['2026-04-17-002', '2026-04-17-003']);
});

test('parseTaskFile — returns null for content without frontmatter', () => {
  assert.equal(parseTaskFile('no frontmatter here'), null);
});

test('serializeTaskFile — round-trips through parse', () => {
  const input = {
    frontmatter: {
      id: '2026-04-17-001',
      title: 'Fix thing',
      status: 'new',
      priority: 'normal',
      created_at: '2026-04-17T14:30:00Z',
      updated_at: '2026-04-17T14:30:00Z',
      worktree: null,
      branch: null,
      review_score: null,
      attempts: 0,
      last_error: null,
      source: null,
      merged_from: [],
    },
    body: '## Context\nHi\n',
  };
  const out = serializeTaskFile(input.frontmatter, input.body);
  const reparsed = parseTaskFile(out);
  assert.deepEqual(reparsed.frontmatter, input.frontmatter);
  assert.equal(reparsed.body.trim(), input.body.trim());
});

test('serializeTaskFile — escapes quotes in title', () => {
  const out = serializeTaskFile(
    { id: 'x', title: 'has "quotes" inside', status: 'new', merged_from: [] },
    'body'
  );
  const { frontmatter } = parseTaskFile(out);
  assert.equal(frontmatter.title, 'has "quotes" inside');
});

test('slugify — lowercases, hyphenates, strips punctuation', () => {
  assert.equal(slugify('Fix Pagination in Mixed Docs!'), 'fix-pagination-in-mixed-docs');
  assert.equal(slugify('  Multiple   spaces  '), 'multiple-spaces');
  assert.equal(slugify('CamelCaseTitle'), 'camelcasetitle');
});

test('slugify — truncates to 60 chars', () => {
  const long = 'a'.repeat(100);
  assert.ok(slugify(long).length <= 60);
});

test('serializeTaskFile — round-trips strings with newlines (last_error case)', () => {
  const fm = {
    id: 'x', title: 't', status: 'failed', merged_from: [],
    last_error: 'Error: boom\n  at foo.js:42\n  at bar.js:10',
  };
  const out = serializeTaskFile(fm, 'body\n');
  const reparsed = parseTaskFile(out);
  assert.equal(reparsed.frontmatter.last_error, 'Error: boom\n  at foo.js:42\n  at bar.js:10');
  assert.equal(reparsed.frontmatter.status, 'failed');
});

test('serializeTaskFile — round-trips strings with literal backslash and quotes', () => {
  const fm = {
    id: 'x', title: 'has "quote" and \\n literal', status: 'new', merged_from: [],
  };
  const out = serializeTaskFile(fm, 'body\n');
  const reparsed = parseTaskFile(out);
  assert.equal(reparsed.frontmatter.title, 'has "quote" and \\n literal');
});

test('frontmatter — round-trips new verification fields (null defaults)', () => {
  const fm = {
    id: '2026-04-20-001', title: 't', status: 'new', priority: 'normal',
    created_at: 'x', updated_at: 'x', worktree: null, branch: null,
    review_score: null, attempts: 0, last_error: null, source: null, merged_from: [],
    test_url: null, verified_at: null, verify_notes: null,
  };
  const out = serializeTaskFile(fm, 'body\n');
  const reparsed = parseTaskFile(out);
  assert.equal(reparsed.frontmatter.test_url, null);
  assert.equal(reparsed.frontmatter.verified_at, null);
  assert.equal(reparsed.frontmatter.verify_notes, null);
});

test('frontmatter — round-trips populated test_url + verify_notes with special chars', () => {
  const fm = {
    id: '2026-04-20-001', title: 't', status: 'verified', priority: 'normal',
    created_at: 'x', updated_at: 'x', worktree: null, branch: null,
    review_score: 9, attempts: 0, last_error: null, source: null, merged_from: [],
    test_url: '/pdf/test-token',
    verified_at: '2026-04-20T14:30:00Z',
    verify_notes: 'A4 passed (natural 213×300). A5 passed after fullscreen cycle.',
  };
  const out = serializeTaskFile(fm, 'body\n');
  const reparsed = parseTaskFile(out);
  assert.equal(reparsed.frontmatter.test_url, '/pdf/test-token');
  assert.equal(reparsed.frontmatter.verified_at, '2026-04-20T14:30:00Z');
  assert.equal(reparsed.frontmatter.verify_notes, 'A4 passed (natural 213×300). A5 passed after fullscreen cycle.');
});
