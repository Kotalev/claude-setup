# pytest Test Patterns

Idiomatic pytest scaffolding for new Python tests.

## File naming
- `tests/test_<module>.py` (top-level `tests/` directory)
- OR `src/foo/test_<module>.py` (co-located)
- OR `<module>_test.py`
- Test functions: `def test_<behaviour>():`
- Test classes (optional): `class TestThing:` with `def test_*` methods

## Imports / setup

```python
import pytest
from myproject.payment import process_payment, PaymentError
```

`pytest` itself only needed for fixtures, marks, and `pytest.raises`.

## Three-test starter template

```python
import pytest
from myproject.payment import process_payment, PaymentError


def test_returns_success_for_valid_amount():
    result = process_payment(amount=100, currency='USD')
    assert result.status == 'success'
    assert result.transaction_id is not None


def test_rejects_negative_amounts():
    with pytest.raises(PaymentError, match='must be positive'):
        process_payment(amount=-10, currency='USD')


def test_zero_amount_is_no_op():
    result = process_payment(amount=0, currency='USD')
    assert result.status == 'skipped'
```

Plain `assert` — pytest rewrites it to give detailed failure messages.

## Fixtures

### Define in `conftest.py` (auto-discovered)
```python
# tests/conftest.py
import pytest
from myproject.db import Database

@pytest.fixture
def db():
    """In-memory SQLite for unit tests."""
    db = Database(':memory:')
    db.migrate()
    yield db
    db.close()

@pytest.fixture
def sample_user(db):
    user = db.create_user(name='Alice', email='a@example.com')
    return user
```

### Use in tests
```python
def test_can_query_user(db, sample_user):
    found = db.find_user(sample_user.id)
    assert found.name == 'Alice'
```

### Scopes
```python
@pytest.fixture(scope='session')   # once per pytest invocation
@pytest.fixture(scope='module')    # once per .py file
@pytest.fixture(scope='function')  # default; once per test
```

## Parametrize (table-driven tests)

```python
@pytest.mark.parametrize('amount,expected_status', [
    (100, 'success'),
    (0, 'skipped'),
    (-10, None),  # will raise
])
def test_payment_outcomes(amount, expected_status):
    if expected_status is None:
        with pytest.raises(PaymentError):
            process_payment(amount=amount, currency='USD')
    else:
        assert process_payment(amount=amount, currency='USD').status == expected_status
```

## Mocking

### `monkeypatch` (built-in, simple)
```python
def test_uses_env_var(monkeypatch):
    monkeypatch.setenv('API_KEY', 'test-key')
    monkeypatch.setattr('myproject.client.requests.get', lambda url: MockResponse({'ok': True}))
    result = fetch_data()
    assert result['ok']
```

### `unittest.mock` / `pytest-mock` (richer)
```python
from unittest.mock import patch, MagicMock

@patch('myproject.email.send_email')
def test_sends_welcome(mock_send):
    register_user('alice@example.com')
    mock_send.assert_called_once_with('alice@example.com', 'Welcome!')
```

Or with `pytest-mock`:
```python
def test_sends_welcome(mocker):
    mock_send = mocker.patch('myproject.email.send_email')
    register_user('alice@example.com')
    mock_send.assert_called_once()
```

## Async (requires `pytest-asyncio`)

```python
import pytest

@pytest.mark.asyncio
async def test_async_call():
    result = await fetch_data()
    assert result['status'] == 'ok'
```

## Skipping & marking

```python
@pytest.mark.skip(reason='broken on Windows')
def test_unix_only(): ...

@pytest.mark.skipif(sys.platform == 'win32', reason='Unix only')
def test_unix_paths(): ...

@pytest.mark.slow  # custom mark; run with `pytest -m slow` or `-m 'not slow'`
def test_long_running(): ...
```

## Temporary files
```python
def test_writes_log(tmp_path):
    log_file = tmp_path / 'app.log'
    write_log(log_file, 'hello')
    assert log_file.read_text() == 'hello\n'
```

## Setup / teardown
Prefer fixtures, but for class-based:
```python
class TestPayments:
    @classmethod
    def setup_class(cls):
        cls.api = PaymentAPI(test_mode=True)

    def setup_method(self):
        self.api.reset()

    def test_charge(self): ...
```

## Anti-patterns
- `assert True` placeholder — write a real test or `pytest.skip`
- Mocking the entire SUT (system under test) — you're testing the mock, not the code
- Using `setUp` / `tearDown` (xUnit style) when fixtures are cleaner
- Catching exceptions you should let propagate: `try: foo(); except: pass` instead of `pytest.raises`
