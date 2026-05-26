const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nextId } = require('../lib/idGenerator');

test('nextId — returns 001 when no existing ids for the date', () => {
  assert.equal(nextId('2026-04-17', []), '2026-04-17-001');
});

test('nextId — increments past existing same-day ids', () => {
  const existing = ['2026-04-17-001', '2026-04-17-002', '2026-04-17-003'];
  assert.equal(nextId('2026-04-17', existing), '2026-04-17-004');
});

test('nextId — ignores other dates', () => {
  const existing = ['2026-04-16-005', '2026-04-17-001', '2026-04-18-002'];
  assert.equal(nextId('2026-04-17', existing), '2026-04-17-002');
});

test('nextId — handles gaps by picking max + 1', () => {
  const existing = ['2026-04-17-001', '2026-04-17-005'];
  assert.equal(nextId('2026-04-17', existing), '2026-04-17-006');
});

test('nextId — zero-pads to 3 digits', () => {
  const existing = Array.from({ length: 98 }, (_, i) => `2026-04-17-${String(i + 1).padStart(3, '0')}`);
  assert.equal(nextId('2026-04-17', existing), '2026-04-17-099');
});
