import { Decimal } from 'decimal.js';
import { exponentOf } from './currencies.js';
import { InvalidRateError } from './errors.js';
import { Money } from './money.js';

/**
 * How to round a conversion result to whole minor units. It is always passed
 * explicitly (ADR 0004). Use {@link DEFAULT_ROUNDING_MODE} for user-facing
 * conversions.
 */
export type RoundingMode = 'half_up' | 'half_even' | 'down' | 'up';

export const DEFAULT_ROUNDING_MODE: RoundingMode = 'half_up';

/** Scale of the database column `numeric(24,12)`. */
export const RATE_MAX_DECIMALS = 12;

const RATE_PATTERN = /^(0|[1-9]\d*)(\.\d+)?$/;

// A private Decimal with enough precision that no operation here ever rounds
// implicitly: bigint amounts up to 2^63 times a 12-decimal rate need < 40 digits.
const Dec = Decimal.clone({ precision: 100, toExpNeg: -1000, toExpPos: 1000 });

const DECIMAL_ROUNDING: Record<RoundingMode, Decimal.Rounding> = {
  half_up: Dec.ROUND_HALF_UP,
  half_even: Dec.ROUND_HALF_EVEN,
  down: Dec.ROUND_DOWN,
  up: Dec.ROUND_UP,
};

/**
 * Units of the receiving currency per 1 unit of the sending currency, as a
 * decimal string such as "1950.5". Positive, at most 12 decimal places.
 */
export class ExchangeRate {
  private constructor(readonly value: string) {}

  static parse(value: string): ExchangeRate {
    if (typeof value !== 'string' || !RATE_PATTERN.test(value)) {
      throw new InvalidRateError(
        `Rate "${String(value)}" is not a valid decimal string.`,
      );
    }
    const decimals = value.split('.')[1]?.length ?? 0;
    if (decimals > RATE_MAX_DECIMALS) {
      throw new InvalidRateError(
        `Rate has more than ${RATE_MAX_DECIMALS} decimal places.`,
      );
    }
    if (new Dec(value).isZero()) {
      throw new InvalidRateError('Rate must be greater than zero.');
    }
    return new ExchangeRate(value);
  }

  toJSON(): string {
    return this.value;
  }
}

/**
 * Converts `money` to `toCurrency`:
 *
 *   result = amountMinor x rate x 10^(exponentB - exponentA), then rounded
 *
 * The multiplication uses decimal.js on strings, never JavaScript numbers.
 */
export function convert(
  money: Money,
  rate: ExchangeRate,
  toCurrency: string,
  mode: RoundingMode,
): Money {
  const shift = exponentOf(toCurrency) - exponentOf(money.currency);
  const exact = new Dec(money.minor.toString())
    .mul(rate.value)
    .mul(Dec.pow(10, shift));
  const rounded = exact.toDecimalPlaces(0, DECIMAL_ROUNDING[mode]);
  return Money.of(BigInt(rounded.toFixed(0)), toCurrency);
}
