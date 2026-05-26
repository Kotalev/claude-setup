const { test } = require('node:test');
const assert = require('node:assert/strict');
const { groupCandidates, detectModule, normalizeTopic } = require('../lib/grouping');

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

test('groupCandidates — groups by shared file', () => {
  const cands = [
    { title: 'Fix A', files: ['apps/web/src/TableView.tsx'] },
    { title: 'Fix B', files: ['apps/web/src/TableView.tsx', 'apps/web/src/TableHeader.tsx'] },
    { title: 'Fix C', files: ['apps/api/src/routes/tables.ts'] },
  ];
  const { groups, standalone } = groupCandidates(cands);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.deepEqual(groups[0].commonFiles, ['apps/web/src/TableView.tsx']);
  assert.equal(standalone.length, 1);
  assert.equal(standalone[0].title, 'Fix C');
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

test('groupCandidates — transitive grouping via shared files', () => {
  const cands = [
    { title: 'A', files: ['x.js'] },
    { title: 'B', files: ['x.js', 'y.js'] },
    { title: 'C', files: ['y.js', 'z.js'] },
  ];
  const { groups } = groupCandidates(cands);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 3);
});

test('groupCandidates — empty input returns empty groups', () => {
  assert.deepEqual(groupCandidates([]), { groups: [], standalone: [] });
});

test('normalizeTopic — lowercases, hyphenates, strips punctuation', () => {
  assert.equal(normalizeTopic('Table View'), 'table-view');
  assert.equal(normalizeTopic('  Row   Mutation  '), 'row-mutation');
  assert.equal(normalizeTopic('auth/session!'), 'authsession');
  assert.equal(normalizeTopic(''), '');
  assert.equal(normalizeTopic(null), '');
  assert.equal(normalizeTopic(undefined), '');
});

test('groupCandidates — groups by shared topic when files do not overlap', () => {
  const cands = [
    { title: 'Fix table column resize', files: ['apps/web/src/grid/ColumnHeader.tsx'], topic: 'table-grid' },
    { title: 'Fix table row height', files: ['apps/web/src/grid/RowContainer.tsx'], topic: 'table-grid' },
    { title: 'Unrelated auth change', files: ['apps/api/src/routes/auth.ts'], topic: 'auth-session' },
  ];
  const { groups, standalone } = groupCandidates(cands);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].topic, 'table-grid');
  assert.equal(standalone.length, 1);
  assert.equal(standalone[0].title, 'Unrelated auth change');
});

test('groupCandidates — topic normalization merges differently-cased topics', () => {
  const cands = [
    { title: 'A', files: ['a.js'], topic: 'Table Schema' },
    { title: 'B', files: ['b.js'], topic: 'table-schema' },
    { title: 'C', files: ['c.js'], topic: '  TABLE   SCHEMA  ' },
  ];
  const { groups } = groupCandidates(cands);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 3);
  assert.equal(groups[0].topic, 'table-schema');
});

test('groupCandidates — empty/missing topic does not trigger false grouping', () => {
  const cands = [
    { title: 'A', files: ['a.js'] },
    { title: 'B', files: ['b.js'], topic: '' },
    { title: 'C', files: ['c.js'], topic: null },
  ];
  const { groups, standalone } = groupCandidates(cands);
  assert.equal(groups.length, 0);
  assert.equal(standalone.length, 3);
});

test('groupCandidates — file overlap and topic overlap compose transitively', () => {
  const cands = [
    { title: 'A', files: ['x.js'], topic: 'feat-alpha' },
    { title: 'B', files: ['y.js'], topic: 'feat-alpha' },
    { title: 'C', files: ['y.js', 'z.js'], topic: 'feat-beta' },
    { title: 'D', files: ['unrelated.js'], topic: 'feat-gamma' },
  ];
  const { groups, standalone } = groupCandidates(cands);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 3);
  const titles = groups[0].items.map((i) => i.title).sort();
  assert.deepEqual(titles, ['A', 'B', 'C']);
  assert.equal(standalone.length, 1);
  assert.equal(standalone[0].title, 'D');
});

test('groupCandidates — most frequent topic wins when a group has mixed topics', () => {
  const cands = [
    { title: 'A', files: ['apps/db/src/schema/shared.ts'], topic: 'row-mutation' },
    { title: 'B', files: ['apps/db/src/schema/shared.ts'], topic: 'row-mutation' },
    { title: 'C', files: ['apps/db/src/schema/shared.ts'], topic: 'table-toolbar' },
  ];
  const { groups } = groupCandidates(cands);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].topic, 'row-mutation');
});
