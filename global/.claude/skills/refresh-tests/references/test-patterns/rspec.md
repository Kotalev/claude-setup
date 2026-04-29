# RSpec Test Patterns

Idiomatic RSpec scaffolding for Ruby projects. (For Minitest, see bottom of file.)

## File naming
- `spec/<module>_spec.rb` (top-level `spec/` directory)
- Mirror layout: `app/services/payment.rb` → `spec/services/payment_spec.rb`

## Imports / setup

```ruby
require 'spec_helper'   # OR 'rails_helper' for Rails projects
require 'payment'

# spec_helper.rb at project root:
RSpec.configure do |config|
  config.expect_with :rspec do |c|
    c.syntax = :expect  # avoid the older `should` syntax
  end
end
```

## Three-test starter template

```ruby
require 'spec_helper'
require 'payment'

RSpec.describe Payment do
  describe '.process' do
    it 'returns success for a valid amount' do
      result = Payment.process(amount: 100, currency: 'USD')
      expect(result.status).to eq('success')
      expect(result.transaction_id).not_to be_nil
    end

    it 'raises for negative amounts' do
      expect { Payment.process(amount: -10, currency: 'USD') }
        .to raise_error(Payment::Error, /must be positive/)
    end

    it 'is a no-op for zero amount' do
      result = Payment.process(amount: 0, currency: 'USD')
      expect(result.status).to eq('skipped')
    end
  end
end
```

## describe / context / it

- `describe ClassName` — outer block (one per file)
- `describe '#method'` for instance methods, `describe '.method'` for class methods
- `context 'when X'` — group tests sharing a precondition
- `it 'does Y'` — single behaviour

```ruby
RSpec.describe ShoppingCart do
  describe '#total' do
    context 'with no items' do
      it 'returns 0' do
        expect(ShoppingCart.new.total).to eq(0)
      end
    end

    context 'with multiple items' do
      it 'sums prices' do
        cart = ShoppingCart.new
        cart.add(item_priced(5))
        cart.add(item_priced(7))
        expect(cart.total).to eq(12)
      end
    end
  end
end
```

## let / let!

`let(:name) { ... }` — memoised per-test, lazy:
```ruby
RSpec.describe User do
  let(:user) { User.new(name: 'Alice', age: 30) }

  it 'has a name' do
    expect(user.name).to eq('Alice')
  end

  it 'is an adult' do
    expect(user.adult?).to be true
  end
end
```

`let!` — same but eager (runs before each test). Use when the side effect matters (e.g., DB row creation).

## Hooks

```ruby
before(:each) { @counter = 0 }   # default scope
before(:all)  { @db = Database.new }  # use sparingly — shared mutable state
after(:each)  { cleanup }
around(:each) { |ex| Timeout.timeout(5) { ex.run } }
```

## Doubles & mocks

```ruby
# Plain double
notifier = double('Notifier', send: true)

# Verifying double — checks methods exist on the real class
notifier = instance_double(Notifier, send: true)

it 'sends welcome email' do
  user_service = UserService.new(notifier: notifier)
  user_service.register('a@example.com')
  expect(notifier).to have_received(:send).with('a@example.com', 'Welcome!')
end
```

Stub a method on a real object:
```ruby
allow(SomeClass).to receive(:external_call).and_return('mocked')
allow(obj).to receive(:method).and_raise(SomeError)
allow(obj).to receive(:method).and_call_original  # spy without changing behaviour
```

Expect a call (fails if not called):
```ruby
expect(mailer).to receive(:deliver).once
```

## Shared examples

```ruby
RSpec.shared_examples 'a serialisable thing' do
  it 'round-trips through JSON' do
    json = subject.to_json
    expect(described_class.from_json(json)).to eq(subject)
  end
end

RSpec.describe User do
  subject { User.new(name: 'A') }
  it_behaves_like 'a serialisable thing'
end
```

## subject

```ruby
RSpec.describe Calculator do
  subject(:calc) { Calculator.new }

  describe '#add' do
    it { expect(calc.add(2, 3)).to eq(5) }
    # OR using implicit subject:
    it { is_expected.to respond_to(:add) }
  end
end
```

## Matchers reference

```ruby
expect(x).to eq(5)              # ==
expect(x).to eql(5)             # equal?
expect(x).to be > 5             # comparison
expect(x).to be_within(0.01).of(3.14)
expect(x).to be_a(String)
expect(x).to match(/regex/)
expect(x).to include(1, 2)
expect(arr).to contain_exactly(1, 2, 3)  # order-independent
expect(x).to be_truthy / be_falsey / be_nil
expect { ... }.to raise_error(ArgumentError, /msg/)
expect { ... }.to change { obj.count }.by(1)
expect { ... }.not_to change { obj.count }
```

## Database transactions (Rails)

```ruby
RSpec.configure do |config|
  config.use_transactional_fixtures = true  # auto-rollback after each test
end
```

For tests that must survive transactions (e.g., feature tests with multiple DB connections), use DatabaseCleaner.

## Anti-patterns
- `before(:all)` for mutable state — bleeds between tests
- `should` syntax (legacy) — use `expect`
- Stubbing methods on the system under test — you're testing the stub
- One giant `it` block with 15 expects — break into focused contexts

---

## Minitest (if not using RSpec)

```ruby
require 'minitest/autorun'
require 'payment'

class PaymentTest < Minitest::Test
  def setup
    @service = PaymentService.new
  end

  def test_returns_success_for_valid_amount
    result = @service.process(amount: 100, currency: 'USD')
    assert_equal 'success', result.status
  end

  def test_rejects_negative_amounts
    assert_raises(Payment::Error) do
      @service.process(amount: -10, currency: 'USD')
    end
  end

  def test_zero_amount_is_no_op
    assert_equal 'skipped', @service.process(amount: 0, currency: 'USD').status
  end
end
```

Common assertions: `assert`, `refute`, `assert_equal`, `assert_raises`, `assert_includes`, `assert_match`.
