# Jest Test Patterns

Idiomatic Jest scaffolding for new tests. Use when generating starter tests in Phase 7.

## File naming
- Co-located: `src/foo/Bar.js` → `src/foo/__tests__/Bar.test.js`
- Or sibling: `src/foo/Bar.js` → `src/foo/Bar.test.js`
- Match the existing project convention; don't mix.

## Imports / setup

```javascript
const { foo } = require('../foo');           // CommonJS (most common in Jest)
// OR
import { foo } from '../foo';                // ESM (needs jest.config: extensionsToTreatAsEsm)
```

For React components: `import { render, screen } from '@testing-library/react';`

## Three-test starter template

```javascript
const { processPayment } = require('../paymentService');

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

Three tests = happy path + error path + edge case. Always emit all three.

## Mocking

### Module mock
```javascript
jest.mock('../db', () => ({
  query: jest.fn().mockResolvedValue([{ id: 1 }]),
}));

const { query } = require('../db');
const { listUsers } = require('../users');

it('lists users from db', async () => {
  const users = await listUsers();
  expect(query).toHaveBeenCalledWith('SELECT * FROM users');
  expect(users).toHaveLength(1);
});
```

### Spy on real function
```javascript
const logger = require('../logger');
const spy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
// ... test code ...
expect(spy).toHaveBeenCalledWith(expect.stringContaining('deprecated'));
spy.mockRestore();
```

### Mock fetch / global
```javascript
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: 'mocked' }),
  });
});
afterEach(() => { jest.restoreAllMocks(); });
```

## Fixtures

```javascript
// In test-utils/fixtures.js — reused across files
function makeUser(overrides = {}) {
  return { id: 1, name: 'Alice', email: 'a@example.com', ...overrides };
}
module.exports = { makeUser };
```

```javascript
const { makeUser } = require('../test-utils/fixtures');
it('serialises user', () => {
  const user = makeUser({ name: 'Bob' });
  expect(serialise(user)).toMatchSnapshot();
});
```

## Async / Promises

```javascript
it('resolves', async () => {
  await expect(asyncFn()).resolves.toBe('value');
});

it('rejects', async () => {
  await expect(asyncFn()).rejects.toThrow('boom');
});
```

## Setup / teardown

```javascript
let server;
beforeAll(async () => { server = await startServer(); });
afterAll(async () => { await server.close(); });
beforeEach(() => { jest.clearAllMocks(); });
```

## Snapshots
Avoid snapshot tests for primitives or large objects — they create maintenance noise. Use only for rendered HTML / DOM structures where the exact output matters.

```javascript
it('renders header', () => {
  const { container } = render(<Header title="X" />);
  expect(container.firstChild).toMatchInlineSnapshot();
});
```

## Anti-patterns to avoid
- `jest.fn().mockReturnValue(undefined)` for void functions — just `jest.fn()`
- `expect(true).toBe(true)` — meaningless assertion
- Testing implementation details (`expect(component.state.foo)`) instead of behaviour (`expect(screen.getByText('foo'))`)
- One giant test with 10 assertions — split into focused tests with one behaviour each
