# Go Test Patterns

Idiomatic Go test scaffolding. Built-in `testing` package; no third-party runner needed.

## File naming
- Same package: `foo.go` → `foo_test.go` (in same dir, same package)
- Black-box: `foo_test.go` with `package foo_test` (external; only public API)
- Function: `func TestX(t *testing.T) { ... }` — must start with `Test`

## Three-test starter template

```go
package payment

import "testing"

func TestProcessPayment_Success(t *testing.T) {
    result, err := ProcessPayment(100, "USD")
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if result.Status != "success" {
        t.Errorf("got status %q, want %q", result.Status, "success")
    }
}

func TestProcessPayment_RejectsNegative(t *testing.T) {
    _, err := ProcessPayment(-10, "USD")
    if err == nil {
        t.Fatal("expected error for negative amount, got nil")
    }
}

func TestProcessPayment_ZeroIsNoop(t *testing.T) {
    result, err := ProcessPayment(0, "USD")
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if result.Status != "skipped" {
        t.Errorf("got status %q, want %q", result.Status, "skipped")
    }
}
```

`t.Fatal` stops the test; `t.Error` continues. Use `Fatal` when subsequent assertions depend on the failed condition.

## Table-driven tests (the Go idiom)

```go
func TestProcessPayment(t *testing.T) {
    tests := []struct {
        name       string
        amount     int
        currency   string
        wantStatus string
        wantErr    bool
    }{
        {"happy", 100, "USD", "success", false},
        {"zero", 0, "USD", "skipped", false},
        {"negative", -10, "USD", "", true},
        {"empty currency", 100, "", "", true},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result, err := ProcessPayment(tt.amount, tt.currency)
            if (err != nil) != tt.wantErr {
                t.Fatalf("err = %v, wantErr = %v", err, tt.wantErr)
            }
            if !tt.wantErr && result.Status != tt.wantStatus {
                t.Errorf("status = %q, want %q", result.Status, tt.wantStatus)
            }
        })
    }
}
```

`t.Run(name, ...)` creates subtests — failures are reported with `TestProcessPayment/happy` etc.

## Mocking via interfaces (no mocking framework needed)

Production code accepts an interface:
```go
type Notifier interface {
    Send(to, msg string) error
}

func RegisterUser(n Notifier, email string) error {
    // ...
    return n.Send(email, "Welcome!")
}
```

Test passes a stub:
```go
type stubNotifier struct {
    calls []struct{ to, msg string }
    err   error
}

func (s *stubNotifier) Send(to, msg string) error {
    s.calls = append(s.calls, struct{ to, msg string }{to, msg})
    return s.err
}

func TestRegisterUser_SendsWelcome(t *testing.T) {
    n := &stubNotifier{}
    if err := RegisterUser(n, "a@example.com"); err != nil {
        t.Fatal(err)
    }
    if len(n.calls) != 1 || n.calls[0].msg != "Welcome!" {
        t.Errorf("got calls %v", n.calls)
    }
}
```

For richer mocks: `github.com/stretchr/testify/mock` or `go.uber.org/mock`.

## testify (popular assertion lib)

```go
import "github.com/stretchr/testify/assert"
import "github.com/stretchr/testify/require"

func TestWithTestify(t *testing.T) {
    result, err := ProcessPayment(100, "USD")
    require.NoError(t, err)              // stops on failure
    assert.Equal(t, "success", result.Status)  // continues on failure
}
```

## Setup / teardown

```go
func TestMain(m *testing.M) {
    setup()
    code := m.Run()
    teardown()
    os.Exit(code)
}
```

Per-test setup using `t.Cleanup`:
```go
func TestThing(t *testing.T) {
    f, err := os.CreateTemp("", "test*")
    require.NoError(t, err)
    t.Cleanup(func() { os.Remove(f.Name()) })
    // test code
}
```

## Helpers
Mark a function as a test helper so its line numbers are skipped in failure output:
```go
func mustParse(t *testing.T, s string) *Doc {
    t.Helper()
    d, err := Parse(s)
    require.NoError(t, err)
    return d
}
```

## Parallel tests
```go
func TestThing(t *testing.T) {
    t.Parallel()
    // ...
}
```

## Benchmarks (separate from tests but in same file)
```go
func BenchmarkParse(b *testing.B) {
    for i := 0; i < b.N; i++ {
        _, _ = Parse(input)
    }
}
```
Run: `go test -bench=. -benchmem`.

## Coverage
```bash
go test ./... -coverprofile=cover.out
go tool cover -func=cover.out          # per-function
go tool cover -html=cover.out          # browser
```

## Anti-patterns
- Importing `testing` from non-test code (compile error in production)
- Using global state across tests — flaky parallel runs
- `t.Skip()` without a reason
- Skipping table-driven approach for similar scenarios — leads to copy-paste sprawl
