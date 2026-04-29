# Rust Test Patterns

Idiomatic `cargo test` scaffolding. Built-in; no external test runner.

## File layout
- **Unit tests**: inside `src/` files via `#[cfg(test)] mod tests { ... }` — same crate, can access private items
- **Integration tests**: separate files in `tests/<name>.rs` — each compiles as its own binary, only sees public API
- **Doc tests**: code blocks in `///` doc comments — run with `cargo test --doc`

## Three-test starter template (unit tests)

```rust
// src/payment.rs

pub fn process_payment(amount: i64, currency: &str) -> Result<Payment, PaymentError> {
    // ...
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_success_for_valid_amount() {
        let result = process_payment(100, "USD").unwrap();
        assert_eq!(result.status, "success");
        assert!(!result.transaction_id.is_empty());
    }

    #[test]
    fn rejects_negative_amounts() {
        let err = process_payment(-10, "USD").unwrap_err();
        assert!(matches!(err, PaymentError::InvalidAmount));
    }

    #[test]
    fn zero_amount_is_no_op() {
        let result = process_payment(0, "USD").unwrap();
        assert_eq!(result.status, "skipped");
    }
}
```

## Integration test template

```rust
// tests/payment_flow.rs
use myproject::payment::process_payment;

#[test]
fn full_payment_succeeds() {
    let result = process_payment(100, "USD").unwrap();
    assert_eq!(result.status, "success");
}
```

Each file in `tests/` is its own binary — share helpers via `tests/common/mod.rs`:
```rust
// tests/common/mod.rs
pub fn setup_test_db() -> Database { /* ... */ }

// tests/foo.rs
mod common;
#[test]
fn uses_db() {
    let db = common::setup_test_db();
    // ...
}
```

## Assertion macros

```rust
assert!(condition);
assert_eq!(actual, expected);
assert_ne!(left, right);

// Custom failure message:
assert_eq!(actual, expected, "context: {}", debug_info);

// Pattern matching:
assert!(matches!(result, Ok(Payment { status, .. }) if status == "success"));
```

For `Result` / `Option`:
```rust
let val = result.expect("should not error in test");
let val = option.expect("should be Some");
```

## Should-panic

```rust
#[test]
#[should_panic(expected = "amount must be positive")]
fn panics_on_negative() {
    process_payment(-10, "USD");  // assume this version panics
}
```

## Async tests (Tokio)

```rust
#[tokio::test]
async fn async_call_succeeds() {
    let data = fetch_data().await.unwrap();
    assert_eq!(data.status, "ok");
}
```

For async-std: `#[async_std::test]`.

## Test fixtures (no built-in framework — use functions)

```rust
fn make_user(name: &str) -> User {
    User {
        id: 1,
        name: name.to_string(),
        email: format!("{}@example.com", name),
    }
}

#[test]
fn serialises_user() {
    let u = make_user("alice");
    assert_eq!(serialise(&u), r#"{"id":1,"name":"alice"}"#);
}
```

## Mocking with mockall

```rust
use mockall::*;

#[automock]
trait Notifier {
    fn send(&self, to: &str, msg: &str) -> Result<(), Error>;
}

#[test]
fn sends_welcome() {
    let mut mock = MockNotifier::new();
    mock.expect_send()
        .withf(|to, msg| to == "a@example.com" && msg == "Welcome!")
        .times(1)
        .returning(|_, _| Ok(()));

    register_user(&mock, "a@example.com").unwrap();
}
```

## Parametrised tests with `rstest`

```rust
use rstest::rstest;

#[rstest]
#[case(100, "success")]
#[case(0, "skipped")]
fn payment_outcomes(#[case] amount: i64, #[case] expected: &str) {
    assert_eq!(process_payment(amount, "USD").unwrap().status, expected);
}
```

## Setup once per test module

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Once;

    static INIT: Once = Once::new();
    fn setup() {
        INIT.call_once(|| {
            env_logger::init();
        });
    }

    #[test]
    fn uses_logger() {
        setup();
        // ...
    }
}
```

## Coverage
Choose one:
```bash
cargo install cargo-llvm-cov
cargo llvm-cov --html

# OR
cargo install cargo-tarpaulin
cargo tarpaulin --out Html
```

## Anti-patterns
- `#[ignore]` on broken tests left indefinitely — fix or delete
- Using `unwrap()` in production code paths to make tests pass
- Integration tests sharing global state via `static mut`
- Doc tests as primary test surface — they don't get coverage tracking
