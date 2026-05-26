const { test } = require('node:test');
const assert = require('node:assert/strict');
const { markAC } = require('../lib/acUpdater');

test('markAC — ticks an unchecked AC by exact text', () => {
  const body = '## Acceptance Criteria\n- [ ] Fix the thing\n- [ ] Other thing\n';
  const out = markAC(body, 'Fix the thing', true);
  assert.match(out, /- \[x\] Fix the thing/);
  assert.match(out, /- \[ \] Other thing/);
});

test('markAC — unticks a checked AC when passed=false', () => {
  const body = '- [x] Fix the thing\n';
  const out = markAC(body, 'Fix the thing', false);
  assert.equal(out.trim(), '- [ ] Fix the thing');
});

test('markAC — idempotent on already-ticked AC', () => {
  const body = '- [x] Fix the thing\n';
  const out = markAC(body, 'Fix the thing', true);
  assert.equal(out, body);
});

test('markAC — no-op when AC text is not in body', () => {
  const body = '- [ ] Different thing\n';
  const out = markAC(body, 'Fix the thing', true);
  assert.equal(out, body);
});

test('markAC — handles regex special characters in AC text', () => {
  const body = '- [ ] Handle $var.foo (special) chars [x]\n';
  const out = markAC(body, 'Handle $var.foo (special) chars [x]', true);
  assert.match(out, /- \[x\] Handle \$var\.foo \(special\) chars \[x\]/);
});

test('markAC — only ticks the matching AC, leaves others alone', () => {
  const body = '- [ ] A\n- [ ] AB\n- [ ] ABC\n';
  const out = markAC(body, 'AB', true);
  assert.match(out, /- \[ \] A\n- \[x\] AB\n- \[ \] ABC/);
});

const { markACs } = require('../lib/acUpdater');

test('markACs — applies multiple AC updates sequentially', () => {
  const body = '- [ ] A\n- [ ] B\n- [ ] C\n';
  const acs = [
    { text: 'A', passed: true },
    { text: 'B', passed: false },
    { text: 'C', passed: true },
  ];
  const out = markACs(body, acs);
  assert.match(out, /- \[x\] A/);
  assert.match(out, /- \[ \] B/);
  assert.match(out, /- \[x\] C/);
});

test('markACs — empty acs array returns body unchanged', () => {
  const body = '- [ ] X\n';
  assert.equal(markACs(body, []), body);
});

test('markACs — unmatched AC text leaves body untouched for that entry', () => {
  const body = '- [ ] Real AC\n';
  const out = markACs(body, [
    { text: 'Real AC', passed: true },
    { text: 'Missing AC', passed: true },
  ]);
  assert.match(out, /- \[x\] Real AC/);
  assert.doesNotMatch(out, /Missing AC/);
});

const { writeVerificationReport, stripVerificationReport } = require('../lib/acUpdater');

const SAMPLE_BODY = [
  '## Context',
  '',
  'Some context',
  '',
  '## Acceptance Criteria',
  '',
  '- [ ] A works',
  '- [ ] B works',
  '',
  '## References',
  '',
  '- Files: foo.js',
  '',
].join('\n');

test('writeVerificationReport — inserts report right after ## Acceptance Criteria section', () => {
  const out = writeVerificationReport(SAMPLE_BODY, {
    acs: [
      { text: 'A works', passed: true, evidence: 'screenshot ok' },
      { text: 'B works', passed: false, evidence: 'still broken' },
    ],
    notes: 'A ok, B failed',
    timestamp: '2026-04-21T10:30:00Z',
    status: 'not_verified',
  });
  assert.match(out, /## Verification Report/);
  assert.match(out, /_Generated: 2026-04-21T10:30:00Z — status: not_verified_/);
  assert.match(out, /\*\*Notes:\*\* A ok, B failed/);
  assert.match(out, /- ✅ A works — screenshot ok/);
  assert.match(out, /- ❌ B works — still broken/);
  // Order: AC section must appear before Verification Report, which must appear before References
  const acIdx = out.indexOf('## Acceptance Criteria');
  const vrIdx = out.indexOf('## Verification Report');
  const refIdx = out.indexOf('## References');
  assert.ok(acIdx < vrIdx && vrIdx < refIdx, 'report must sit between AC and References');
});

test('writeVerificationReport — presents ACs in agent-provided order', () => {
  const out = writeVerificationReport(SAMPLE_BODY, {
    acs: [
      { text: 'B works', passed: false, evidence: 'broken' },
      { text: 'A works', passed: true, evidence: 'ok' },
    ],
    notes: 'x',
    timestamp: '2026-04-21T10:30:00Z',
    status: 'not_verified',
  });
  const bIdx = out.indexOf('- ❌ B works');
  const aIdx = out.indexOf('- ✅ A works');
  assert.ok(bIdx !== -1 && aIdx !== -1);
  assert.ok(bIdx < aIdx, 'ACs must appear in the order provided by the agent');
});

test('writeVerificationReport — replaces prior report on re-verify (no duplicate section)', () => {
  const first = writeVerificationReport(SAMPLE_BODY, {
    acs: [{ text: 'A works', passed: false, evidence: 'first attempt failed' }],
    notes: 'first run',
    timestamp: '2026-04-21T10:00:00Z',
    status: 'not_verified',
  });
  const second = writeVerificationReport(first, {
    acs: [{ text: 'A works', passed: false, evidence: 'second attempt failed' }],
    notes: 'second run',
    timestamp: '2026-04-21T11:00:00Z',
    status: 'not_verified',
  });
  // Only one Verification Report section
  const matches = second.match(/## Verification Report/g) || [];
  assert.equal(matches.length, 1);
  // Second attempt data is present, first is gone
  assert.match(second, /second attempt failed/);
  assert.match(second, /second run/);
  assert.match(second, /11:00:00Z/);
  assert.doesNotMatch(second, /first attempt failed/);
  assert.doesNotMatch(second, /first run/);
});

test('writeVerificationReport — preserves original Acceptance Criteria bullets', () => {
  const out = writeVerificationReport(SAMPLE_BODY, {
    acs: [{ text: 'A works', passed: true, evidence: 'ok' }],
    notes: 'x',
    timestamp: '2026-04-21T10:30:00Z',
    status: 'not_verified',
  });
  assert.match(out, /- \[ \] A works/);
  assert.match(out, /- \[ \] B works/);
});

test('writeVerificationReport — handles missing evidence with placeholder', () => {
  const out = writeVerificationReport(SAMPLE_BODY, {
    acs: [{ text: 'A works', passed: true }],
    notes: null,
    timestamp: '2026-04-21T10:30:00Z',
    status: 'not_verified',
  });
  assert.match(out, /- ✅ A works — \(no evidence\)/);
});

test('writeVerificationReport — omits Notes line when notes is null/empty', () => {
  const out = writeVerificationReport(SAMPLE_BODY, {
    acs: [{ text: 'A works', passed: false, evidence: 'nope' }],
    notes: null,
    timestamp: '2026-04-21T10:30:00Z',
    status: 'not_verified',
  });
  assert.doesNotMatch(out, /\*\*Notes:\*\*/);
});

test('writeVerificationReport — empty acs array produces placeholder line', () => {
  const out = writeVerificationReport(SAMPLE_BODY, {
    acs: [],
    notes: 'agent returned no ACs',
    timestamp: '2026-04-21T10:30:00Z',
    status: 'not_verified',
  });
  assert.match(out, /## Verification Report/);
  assert.match(out, /_No acceptance criteria evaluated\._/);
});

test('writeVerificationReport — appends at end when no Acceptance Criteria section exists', () => {
  const body = '## Context\n\nBlah\n\n## References\n\n- foo.js\n';
  const out = writeVerificationReport(body, {
    acs: [{ text: 'A works', passed: false, evidence: 'broken' }],
    notes: 'x',
    timestamp: '2026-04-21T10:30:00Z',
    status: 'not_verified',
  });
  // Verification Report is present and after everything else
  assert.match(out, /## Verification Report/);
  const vrIdx = out.indexOf('## Verification Report');
  const refIdx = out.indexOf('## References');
  assert.ok(vrIdx > refIdx, 'report appended at end when no AC section');
});

test('stripVerificationReport — removes the section cleanly', () => {
  const withReport = writeVerificationReport(SAMPLE_BODY, {
    acs: [{ text: 'A works', passed: false, evidence: 'broken' }],
    notes: 'x',
    timestamp: '2026-04-21T10:30:00Z',
    status: 'not_verified',
  });
  const stripped = stripVerificationReport(withReport);
  assert.doesNotMatch(stripped, /## Verification Report/);
  assert.doesNotMatch(stripped, /broken/);
  // Rest of the body is intact
  assert.match(stripped, /## Acceptance Criteria/);
  assert.match(stripped, /## References/);
  assert.match(stripped, /- \[ \] A works/);
});

test('stripVerificationReport — no-op when section is absent', () => {
  assert.equal(stripVerificationReport(SAMPLE_BODY), SAMPLE_BODY);
});
