# Money module

Implements [ADR 0004](https://github.com/family-pot/family-pot-docs/blob/main/adr/0004-money-representation.md). **Never use `number` arithmetic on money**; use these types.

- **Amounts** are integer minor units as `bigint`, plus an ISO 4217 code. On the wire they are `{ "amount": "15000", "currency": "GBP" }` (£150.00); the amount is always a string.
- **Exchange rates** are decimal strings (units of receiving currency per 1 unit of sending currency), at most 12 decimal places, greater than zero.
- **Conversion** is `amountMinor x rate x 10^(exponentB - exponentA)`, rounded. The multiplication uses decimal.js on strings. The rounding mode is always passed explicitly.
- **Fees** are in the sending currency (a `Money` of that currency).

Zero is a valid amount (a fee can be zero). Negative amounts are rejected with `NegativeAmountError`. Whether a transfer amount must be positive is a rule of the transfer, not of this module. Amounts above the Postgres `bigint` maximum (2^63 - 1) are rejected.

## Usage

```ts
import { ExchangeRate, Money, convert, DEFAULT_ROUNDING_MODE } from '../money';

const sent = Money.of(15000n, 'GBP'); // £150.00
const rate = ExchangeRate.parse('1950.5'); // NGN per GBP
const received = convert(sent, rate, 'NGN', DEFAULT_ROUNDING_MODE);
received.toWire(); // { amount: '29257500', currency: 'NGN' } (NGN 292,575.00)

// Parsing input from the wire (throws InvalidAmountError / NegativeAmountError / UnsupportedCurrencyError)
const fee = Money.fromWire({ amount: '350', currency: 'GBP' });

// Arithmetic throws CurrencyMismatchError across currencies and never returns a float
const total = sent.add(fee); // £153.50
Money.sum('GBP', [sent, fee]); // the currency is explicit, so an empty list gives zero
sent.subtract(fee);
```

Rounding modes: `half_up` (default for user-facing conversion), `half_even` (ties to even), `down`, `up`.

```ts
const five = Money.of(5n, 'GBP');
convert(five, ExchangeRate.parse('0.5'), 'USD', 'half_up').minor; // 3n  (2.5)
convert(five, ExchangeRate.parse('0.5'), 'USD', 'half_even').minor; // 2n
```

## Currencies

`SUPPORTED_CURRENCIES` is the MVP list: GBP, USD, EUR, CAD, NGN, GHS, KES, INR, PHP (all 2 decimals). The exponent table also knows JPY (0) and KWD (3) so the 0- and 3-decimal cases of the ADR are exercised, but they are not in `SUPPORTED_CURRENCIES`; validate user input with `isSupportedCurrency`, not `isKnownCurrency`.

## Database columns

Postgres `bigint` and `numeric` come back from the driver as strings (ADR 0003). Use the transformers so they never become JavaScript numbers:

```ts
@Column({ type: 'bigint', transformer: bigintTransformer })
sentAmountMinor: bigint;

@Column({ type: 'numeric', precision: 24, scale: 12, transformer: numericStringTransformer })
exchangeRate: string;
```

`numericStringTransformer` trims the scale padding Postgres adds (`"1950.500000000000"` becomes `"1950.5"`).

## Tests

`pnpm test:cov` enforces 100% coverage for `src/money` (see `vitest.config.ts`) and CI runs it. The three worked examples of ADR 0004 are tests in `rate.spec.ts`.
