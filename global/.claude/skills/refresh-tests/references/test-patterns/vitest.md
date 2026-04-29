# Vitest Test Patterns

Idiomatic Vitest scaffolding. Vitest is API-compatible with Jest but ESM-native and Vite-integrated. Most patterns from `jest.md` apply — this doc highlights only the differences.

## File naming
Same as Jest: `*.test.{js,ts,jsx,tsx}` or `*.spec.*`. Often sibling to source for Vite projects.

## Imports / setup
Always ESM. Vitest globals (`describe`, `it`, `expect`) are NOT auto-imported by default — either enable `globals: true` in config OR explicit import:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processPayment } from '../paymentService';
```

## Three-test starter template

```typescript
import { describe, it, expect } from 'vitest';
import { processPayment } from '../paymentService';

describe('processPayment', () => {
  it('returns success for valid amount', () => {
    const result = processPayment({ amount: 100, currency: 'USD' });
    expect(result.status).toBe('success');
    expect(result.transactionId).toBeDefined();
  });

  it('rejects negative amounts', () => {
    expect(() => processPayment({ amount: -10, currency: 'USD' }))
      .toThrow('Amount must be positive');
  });

  it('handles zero amount as no-op', () => {
    const result = processPayment({ amount: 0, currency: 'USD' });
    expect(result.status).toBe('skipped');
  });
});
```

## Mocking — `vi.*` instead of `jest.*`

```typescript
import { vi } from 'vitest';

// Module mock
vi.mock('../db', () => ({
  query: vi.fn().mockResolvedValue([{ id: 1 }]),
}));

// Spy
const spy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

// Global
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ data: 'mocked' }),
}));
```

### Resetting between tests
```typescript
beforeEach(() => {
  vi.clearAllMocks();        // clear call history
  // OR
  vi.restoreAllMocks();      // restore originals
  // OR (full reset for stubGlobal)
  vi.unstubAllGlobals();
});
```

### Hoisted mocks
Vitest hoists `vi.mock()` calls to the top of the file (like Jest). For dynamic factory patterns use `vi.hoisted()`:

```typescript
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('node-fetch', () => ({ default: mockFetch }));
```

## React Testing Library
Same as Jest:
```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

it('renders title', () => {
  render(<Card title="Hello" />);
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

Setup file (referenced from `vitest.config.ts` `setupFiles`):
```typescript
// test-setup.ts
import '@testing-library/jest-dom/vitest';
```

## Async
Identical to Jest:
```typescript
it('resolves', async () => {
  await expect(asyncFn()).resolves.toBe('value');
});
```

## Snapshots
- Inline: `expect(x).toMatchInlineSnapshot()`
- File: `expect(x).toMatchSnapshot()` → `__snapshots__/<test>.test.ts.snap`
- Update: `npx vitest run --update` (or `-u`)

## Vitest-only goodies
```typescript
// Test concurrency within a file
describe.concurrent('parallel suite', () => {
  it.concurrent('a', async () => { /* ... */ });
  it.concurrent('b', async () => { /* ... */ });
});

// Skip / focus
it.skip('not yet', () => {});
it.only('focus', () => {});

// Each
it.each([
  [1, 1, 2],
  [2, 3, 5],
])('add(%i, %i) = %i', (a, b, expected) => {
  expect(add(a, b)).toBe(expected);
});
```

## Coverage
Requires `@vitest/coverage-v8` (or `-istanbul`):
```bash
npm i -D @vitest/coverage-v8
npx vitest run --coverage
```

## Differences from Jest cheat sheet
| Concept | Jest | Vitest |
|---------|------|--------|
| Mock fn | `jest.fn()` | `vi.fn()` |
| Module mock | `jest.mock(...)` | `vi.mock(...)` |
| Spy | `jest.spyOn()` | `vi.spyOn()` |
| Globals | `global.x = ...` | `vi.stubGlobal('x', ...)` |
| Fake timers | `jest.useFakeTimers()` | `vi.useFakeTimers()` |
| Reset | `jest.clearAllMocks()` | `vi.clearAllMocks()` |
| Config | `jest.config.js` | `vitest.config.ts` (Vite-style) |
| Auto-globals | always (default) | only if `globals: true` |
