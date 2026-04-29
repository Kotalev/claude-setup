# xUnit Test Patterns (.NET)

Idiomatic xUnit scaffolding for C# / .NET projects. (For NUnit/MSTest, see bottom.)

## File naming / project layout
- Test project: `MyProject.Tests` next to `MyProject`
- File: `<ClassUnderTest>Tests.cs`
- Class: `<ClassUnderTest>Tests` (no inheritance required)
- Methods: `[Fact] public void Method_ShouldX_WhenY()`

## Imports

```csharp
using Xunit;
using FluentAssertions;     // optional, much nicer assertions
using Moq;                  // most common mocking library
```

## Three-test starter template

```csharp
namespace MyProject.Tests;

using Xunit;

public class PaymentServiceTests
{
    [Fact]
    public void Process_ReturnsSuccess_ForValidAmount()
    {
        var service = new PaymentService();

        var result = service.Process(100, "USD");

        Assert.Equal("success", result.Status);
        Assert.NotNull(result.TransactionId);
    }

    [Fact]
    public void Process_Throws_ForNegativeAmount()
    {
        var service = new PaymentService();

        var ex = Assert.Throws<PaymentException>(
            () => service.Process(-10, "USD"));
        Assert.Contains("must be positive", ex.Message);
    }

    [Fact]
    public void Process_IsNoOp_ForZeroAmount()
    {
        var service = new PaymentService();

        var result = service.Process(0, "USD");

        Assert.Equal("skipped", result.Status);
    }
}
```

## Theory (parametrised tests)

```csharp
[Theory]
[InlineData(100, "USD", "success")]
[InlineData(0,   "USD", "skipped")]
public void Process_Outcomes(int amount, string currency, string expectedStatus)
{
    var result = new PaymentService().Process(amount, currency);
    Assert.Equal(expectedStatus, result.Status);
}

// MemberData for complex objects:
[Theory]
[MemberData(nameof(PaymentScenarios))]
public void Process_Outcomes2(int amount, string expected) { /* ... */ }

public static IEnumerable<object[]> PaymentScenarios =>
    new List<object[]>
    {
        new object[] { 100, "success" },
        new object[] { 0,   "skipped" }
    };

// ClassData for reusable test data:
[Theory]
[ClassData(typeof(PaymentTestData))]
public void Process_Outcomes3(int amount, string expected) { /* ... */ }
```

## Setup / teardown — constructor + IDisposable

xUnit creates a new instance per test (no `[SetUp]` / `[TearDown]`):

```csharp
public class PaymentServiceTests : IDisposable
{
    private readonly PaymentService _service;
    private readonly Mock<IPaymentGateway> _gateway;

    public PaymentServiceTests()
    {
        _gateway = new Mock<IPaymentGateway>();
        _service = new PaymentService(_gateway.Object);
    }

    [Fact]
    public void Process_CallsGateway()
    {
        _service.Process(100, "USD");
        _gateway.Verify(g => g.Charge(100, "USD"), Times.Once);
    }

    public void Dispose()
    {
        // cleanup if needed
    }
}
```

For shared setup across tests, use `IClassFixture<T>`:

```csharp
public class DatabaseFixture : IDisposable
{
    public TestDb Db { get; } = new();
    public void Dispose() => Db.Dispose();
}

public class UserRepoTests : IClassFixture<DatabaseFixture>
{
    private readonly DatabaseFixture _fix;
    public UserRepoTests(DatabaseFixture fix) => _fix = fix;
    // ...
}
```

## Mocking with Moq

```csharp
[Fact]
public void Register_SendsWelcomeEmail()
{
    var mailer = new Mock<IMailer>();
    mailer.Setup(m => m.Send(It.IsAny<string>(), It.IsAny<string>()))
          .Returns(true);

    var service = new UserService(mailer.Object);
    service.Register("a@example.com");

    mailer.Verify(m => m.Send("a@example.com", "Welcome!"), Times.Once);
}
```

### Moq cheat sheet
```csharp
mock.Setup(x => x.Method(It.IsAny<int>())).Returns(42);
mock.Setup(x => x.Method(It.Is<int>(n => n > 0))).Returns(true);
mock.Setup(x => x.AsyncMethod()).ReturnsAsync(value);
mock.Setup(x => x.Method()).Throws<InvalidOperationException>();

mock.Verify(x => x.Method(), Times.Once);
mock.Verify(x => x.Method(), Times.Never);
mock.Verify(x => x.Method(), Times.Exactly(3));
mock.VerifyNoOtherCalls();

// Properties:
mock.SetupProperty(x => x.Name, "Alice");

// Sequence:
mock.SetupSequence(x => x.Next())
    .Returns(1).Returns(2).Returns(3);
```

## Assertions reference (xUnit core)

```csharp
Assert.Equal(expected, actual);
Assert.NotEqual(unexpected, actual);
Assert.Same(expected, actual);          // reference equality
Assert.True(condition);
Assert.False(condition);
Assert.Null(value);
Assert.NotNull(value);
Assert.Empty(collection);
Assert.NotEmpty(collection);
Assert.Single(collection);
Assert.Contains(item, collection);
Assert.DoesNotContain(item, collection);
Assert.Equal(3, collection.Count());
Assert.IsType<MyClass>(obj);
Assert.IsAssignableFrom<IBase>(obj);
Assert.InRange(x, low, high);

Assert.Throws<ArgumentException>(() => DoThing());
await Assert.ThrowsAsync<IOException>(async () => await DoAsync());
```

### FluentAssertions (recommended)
```csharp
result.Status.Should().Be("success");
result.Items.Should().HaveCount(3).And.Contain("a");
action.Should().Throw<PaymentException>().WithMessage("*positive*");
await asyncFn.Should().ThrowAsync<IOException>();
```

## Async tests

```csharp
[Fact]
public async Task ProcessAsync_Succeeds()
{
    var result = await new PaymentService().ProcessAsync(100, "USD");
    Assert.Equal("success", result.Status);
}
```

## Test categorisation

```csharp
[Fact, Trait("Category", "Slow")]
public void LongRunningTest() { /* ... */ }

// Run: dotnet test --filter "Category=Slow"
//      dotnet test --filter "Category!=Slow"
```

## Skipping

```csharp
[Fact(Skip = "broken — see TICKET-456")]
public void BrokenTest() { /* ... */ }
```

## Anti-patterns
- Using static state to share between tests — xUnit creates new instances precisely to avoid this
- Mocking `DbContext` directly — use in-memory provider or Respawn instead
- `Assert.True(x.Equals(y))` — use `Assert.Equal(y, x)` for better failure messages
- Async-over-sync (`Task.Result`, `.Wait()`) inside tests — causes deadlocks

---

## NUnit (alternative)

```csharp
using NUnit.Framework;

[TestFixture]
public class PaymentServiceTests
{
    private PaymentService _service;

    [SetUp]
    public void Setup() => _service = new PaymentService();

    [Test]
    public void Process_Succeeds()
    {
        Assert.That(_service.Process(100, "USD").Status, Is.EqualTo("success"));
    }

    [TestCase(100, "USD", "success")]
    [TestCase(0,   "USD", "skipped")]
    public void Process_Outcomes(int amount, string currency, string expected)
    {
        Assert.That(_service.Process(amount, currency).Status, Is.EqualTo(expected));
    }
}
```

Key differences from xUnit:
- `[Test]` instead of `[Fact]`, `[TestCase]` instead of `[Theory]/[InlineData]`
- `[SetUp]` / `[TearDown]` instead of constructor/Dispose
- Single test class instance reused across tests (must reset state in SetUp)
- `Assert.That(actual, Is.EqualTo(expected))` constraint syntax (or classic `Assert.AreEqual`)
