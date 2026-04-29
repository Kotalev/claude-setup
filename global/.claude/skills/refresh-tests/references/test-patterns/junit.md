# JUnit 5 Test Patterns (Java + Kotlin)

Idiomatic JUnit 5 (Jupiter) scaffolding. JUnit 4 syntax is legacy — prefer 5 for new tests.

## File naming
- Maven/Gradle: `src/test/java/<package>/<Class>Test.java`
- Test class: `<ClassUnderTest>Test`
- Methods: `@Test void shouldDoX()` — return `void`, package-private (no `public` needed in JUnit 5)

## Imports

```java
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import static org.junit.jupiter.api.Assertions.*;
```

## Three-test starter template

```java
package com.example.payment;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PaymentServiceTest {

    @Test
    void returnsSuccessForValidAmount() {
        var service = new PaymentService();
        var result = service.process(100, "USD");

        assertEquals("success", result.status());
        assertNotNull(result.transactionId());
    }

    @Test
    void rejectsNegativeAmounts() {
        var service = new PaymentService();

        var ex = assertThrows(PaymentException.class,
            () -> service.process(-10, "USD"));
        assertTrue(ex.getMessage().contains("must be positive"));
    }

    @Test
    void zeroAmountIsNoOp() {
        var service = new PaymentService();
        var result = service.process(0, "USD");

        assertEquals("skipped", result.status());
    }
}
```

## Lifecycle

```java
@BeforeAll      // once per test class — must be static (or use @TestInstance(PER_CLASS))
@BeforeEach     // before each test
@AfterEach
@AfterAll
```

```java
class PaymentServiceTest {
    private PaymentService service;

    @BeforeEach
    void setUp() {
        service = new PaymentService();
    }
}
```

## Parametrised tests

```java
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;

@ParameterizedTest
@CsvSource({
    "100, USD, success",
    "0, USD, skipped"
})
void paymentOutcomes(int amount, String currency, String expectedStatus) {
    assertEquals(expectedStatus,
        new PaymentService().process(amount, currency).status());
}

@ParameterizedTest
@MethodSource("paymentScenarios")
void paymentOutcomes2(int amount, String expected) { /* ... */ }

static Stream<Arguments> paymentScenarios() {
    return Stream.of(
        Arguments.of(100, "success"),
        Arguments.of(0, "skipped")
    );
}
```

## DisplayName & nested

```java
@DisplayName("Payment processing")
class PaymentServiceTest {

    @Nested
    @DisplayName("when amount is valid")
    class WhenAmountIsValid {
        @Test
        @DisplayName("returns success")
        void returnsSuccess() { /* ... */ }
    }
}
```

## Mocking with Mockito

```java
import static org.mockito.Mockito.*;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.api.extension.ExtendWith;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock private Mailer mailer;
    @Mock private UserRepository repo;

    @Test
    void sendsWelcomeEmail() {
        when(repo.save(any())).thenReturn(new User(1, "alice"));

        var service = new UserService(repo, mailer);
        service.register("a@example.com");

        verify(mailer, times(1)).send("a@example.com", "Welcome!");
    }
}
```

### Common Mockito patterns
```java
when(mock.method()).thenReturn(value);
when(mock.method(anyString())).thenThrow(new IOException());
when(mock.method()).thenAnswer(invocation -> compute(invocation.getArgument(0)));

verify(mock).method();
verify(mock, never()).method();
verify(mock, times(2)).method();
verify(mock, atLeastOnce()).method();
verify(mock).method(eq("exact"), any(Foo.class));

verifyNoInteractions(mock);
verifyNoMoreInteractions(mock);
```

## Assertions reference

```java
assertEquals(expected, actual);
assertNotEquals(unexpected, actual);
assertSame(expected, actual);            // ==
assertNull(value); assertNotNull(value);
assertTrue(condition); assertFalse(condition);
assertArrayEquals(expectedArr, actualArr);
assertIterableEquals(expectedList, actualList);

assertThrows(IOException.class, () -> doThing());
assertDoesNotThrow(() -> doThing());

// Group multiple assertions — all run, all failures reported
assertAll("payment",
    () -> assertEquals("success", result.status()),
    () -> assertNotNull(result.transactionId())
);
```

For richer assertions, AssertJ:
```java
import static org.assertj.core.api.Assertions.*;
assertThat(result.status()).isEqualTo("success");
assertThat(list).containsExactly("a", "b").doesNotContain("c");
```

## Temp files / dirs

```java
@TempDir
Path tempDir;  // injected before each test, cleaned up after

@Test
void writesLog() throws IOException {
    var log = tempDir.resolve("app.log");
    Files.writeString(log, "hello");
    assertEquals("hello", Files.readString(log));
}
```

## Skipping

```java
@Disabled("flaky on CI — TICKET-123")
@Test
void brokenTest() { /* ... */ }

@EnabledOnOs(OS.LINUX)
@DisabledIfEnvironmentVariable(named = "CI", matches = "true")
```

## Kotlin syntax

```kotlin
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals

class PaymentServiceTest {
    @Test
    fun `returns success for valid amount`() {
        val result = PaymentService().process(100, "USD")
        assertEquals("success", result.status)
    }

    @Test
    fun `rejects negative amounts`() {
        assertThrows<PaymentException> {
            PaymentService().process(-10, "USD")
        }
    }
}
```

Backtick method names give human-readable test reports. Use `kotlin.test.*` for Kotlin-idiomatic assertions or `assertj-core` for fluent style.

## Anti-patterns
- Using `@Disabled` permanently — fix or delete
- `assertTrue(obj.equals(other))` — use `assertEquals(other, obj)` for better diff
- Sharing mutable state between tests via static fields without `@BeforeEach` reset
- Catching exceptions in test body to assert — use `assertThrows`
