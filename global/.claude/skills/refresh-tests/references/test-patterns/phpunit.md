# PHPUnit Test Patterns

Idiomatic PHPUnit scaffolding for PHP projects.

## File naming
- `tests/<Module>Test.php` (top-level `tests/` directory)
- Class extends `\PHPUnit\Framework\TestCase`
- Class name = `<Subject>Test`
- Methods: `public function test<Behaviour>(): void` (or annotated `@test`)

## Three-test starter template

```php
<?php

declare(strict_types=1);

namespace App\Tests;

use App\Payment\PaymentService;
use App\Payment\PaymentException;
use PHPUnit\Framework\TestCase;

final class PaymentServiceTest extends TestCase
{
    public function testReturnsSuccessForValidAmount(): void
    {
        $service = new PaymentService();
        $result = $service->process(100, 'USD');

        $this->assertSame('success', $result->status);
        $this->assertNotEmpty($result->transactionId);
    }

    public function testRejectsNegativeAmounts(): void
    {
        $service = new PaymentService();

        $this->expectException(PaymentException::class);
        $this->expectExceptionMessageMatches('/must be positive/');

        $service->process(-10, 'USD');
    }

    public function testZeroAmountIsNoOp(): void
    {
        $service = new PaymentService();
        $result = $service->process(0, 'USD');

        $this->assertSame('skipped', $result->status);
    }
}
```

## Setup / teardown

```php
protected function setUp(): void
{
    parent::setUp();
    $this->service = new PaymentService();
}

protected function tearDown(): void
{
    // close resources, restore globals
    parent::tearDown();
}

public static function setUpBeforeClass(): void { /* once per class */ }
public static function tearDownAfterClass(): void { /* once per class */ }
```

## Data providers (parametrised tests)

```php
/**
 * @dataProvider amountProvider
 */
public function testPaymentOutcomes(int $amount, string $expectedStatus): void
{
    $result = (new PaymentService())->process($amount, 'USD');
    $this->assertSame($expectedStatus, $result->status);
}

public static function amountProvider(): array
{
    return [
        'happy'    => [100, 'success'],
        'zero'     => [0, 'skipped'],
        // negative case can't go here — separate test for exceptions
    ];
}
```

PHPUnit 10+ supports attributes:
```php
use PHPUnit\Framework\Attributes\DataProvider;

#[DataProvider('amountProvider')]
public function testPaymentOutcomes(int $amount, string $expectedStatus): void { /* ... */ }
```

## Mocking

### `createMock` (auto-stubbed methods return null)

```php
public function testSendsWelcomeEmail(): void
{
    $mailer = $this->createMock(Mailer::class);
    $mailer->expects($this->once())
           ->method('send')
           ->with('a@example.com', 'Welcome!');

    (new UserService($mailer))->register('a@example.com');
}
```

### Stub specific return values

```php
$repo = $this->createMock(UserRepository::class);
$repo->method('find')->willReturn(new User('Alice'));
// OR with conditions:
$repo->method('find')
     ->with($this->equalTo(42))
     ->willReturn(new User('Alice'));
```

### Verify in any order
```php
$mailer->expects($this->exactly(2))->method('send');
$mailer->expects($this->never())->method('panic');
```

### `getMockBuilder` for fine control
```php
$service = $this->getMockBuilder(PaymentService::class)
    ->disableOriginalConstructor()
    ->onlyMethods(['callApi'])
    ->getMock();
$service->method('callApi')->willReturn(['ok' => true]);
```

## Assertions reference

```php
$this->assertSame($expected, $actual);              // strict equality (===)
$this->assertEquals($expected, $actual);            // loose equality (==)
$this->assertNotSame(/* ... */);
$this->assertTrue($x); $this->assertFalse($x);
$this->assertNull($x);
$this->assertCount(3, $array);
$this->assertContains('item', $array);
$this->assertEmpty($array);
$this->assertInstanceOf(SomeClass::class, $obj);
$this->assertMatchesRegularExpression('/regex/', $string);
$this->assertGreaterThan(5, $x);
$this->expectException(SomeException::class);
$this->expectExceptionMessage('exact message');
$this->expectExceptionMessageMatches('/regex/');
```

## Filesystem fixtures

```php
public function testWritesLog(): void
{
    $tmp = sys_get_temp_dir() . '/test-' . uniqid() . '.log';
    try {
        Logger::write($tmp, 'hello');
        $this->assertSame("hello\n", file_get_contents($tmp));
    } finally {
        @unlink($tmp);
    }
}
```

## Database tests (with Laravel / Doctrine)

For Laravel:
```php
use Illuminate\Foundation\Testing\RefreshDatabase;

final class UserTest extends TestCase
{
    use RefreshDatabase;  // wraps each test in a transaction

    public function testCreatesUser(): void
    {
        $user = User::factory()->create(['email' => 'a@example.com']);
        $this->assertDatabaseHas('users', ['email' => 'a@example.com']);
    }
}
```

## Skipping

```php
public function testRequiresExtension(): void
{
    if (!extension_loaded('xdebug')) {
        $this->markTestSkipped('xdebug not loaded');
    }
    // ...
}

#[RequiresPhp('>=8.2')]
public function testNewSyntax(): void { /* ... */ }
```

## Coverage

Requires Xdebug or PCOV PHP extension. Enable in `phpunit.xml`:
```xml
<coverage>
    <include>
        <directory suffix=".php">src</directory>
    </include>
    <report>
        <html outputDirectory="coverage" />
        <clover outputFile="coverage.xml" />
    </report>
</coverage>
```
Run: `vendor/bin/phpunit --coverage-html coverage`.

## Anti-patterns
- Suppressing errors with `@` to silence test warnings — fix the root cause
- Sharing state via static class properties between tests
- Mocking PHP built-ins (`time()`, `file_get_contents()`) — extract to wrapper interfaces instead
- `$this->assertTrue(true)` placeholder
