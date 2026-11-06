import { type CurrencyCode, isKnownCurrency } from './currencies.js';
import {
  CurrencyMismatchError,
  InvalidAmountError,
  NegativeAmountError,
  UnsupportedCurrencyError,
} from './errors.js';

/** Largest value a Postgres `bigint` column can hold (2^63 - 1). */
export const MAX_MINOR_UNITS = (1n << 63n) - 1n;

/** The wire format of ADR 0004: the amount is a string of minor units. */
export interface MoneyWire {
  amount: string;
  currency: string;
}

const MINOR_UNITS_PATTERN = /^(0|[1-9]\d*)$/;

/**
 * An amount of money: integer minor units (`bigint`) plus a currency code.
 * Immutable. There is no way to build one from a `number`, and no operation
 * returns a float. Zero is allowed (fees can be zero); negative is not.
 */
export class Money {
  private constructor(
    readonly minor: bigint,
    readonly currency: CurrencyCode,
  ) {}

  /** Builds money from a `bigint` of minor units, e.g. `Money.of(15000n, 'GBP')` is £150.00. */
  static of(minor: bigint, currency: string): Money {
    if (typeof minor !== 'bigint') {
      throw new InvalidAmountError(
        'Money amounts must be bigint minor units, never numbers.',
      );
    }
    if (!isKnownCurrency(currency)) {
      throw new UnsupportedCurrencyError(`Unknown currency "${currency}".`);
    }
    if (minor < 0n) {
      throw new NegativeAmountError('Amount must not be negative.');
    }
    if (minor > MAX_MINOR_UNITS) {
      throw new InvalidAmountError(
        `Amount exceeds the maximum of ${MAX_MINOR_UNITS} minor units.`,
      );
    }
    return new Money(minor, currency);
  }

  static zero(currency: string): Money {
    return Money.of(0n, currency);
  }

  /**
   * Parses the wire format `{ amount: "15000", currency: "GBP" }`. The amount
   * must be a canonical non-negative integer string (no sign, decimal point,
   * exponent, spaces or leading zeros).
   */
  static fromWire(wire: MoneyWire): Money {
    const { amount, currency } = wire;
    if (typeof amount !== 'string') {
      throw new InvalidAmountError('Amount must be a string of minor units.');
    }
    if (amount.startsWith('-')) {
      throw new NegativeAmountError('Amount must not be negative.');
    }
    if (!MINOR_UNITS_PATTERN.test(amount)) {
      throw new InvalidAmountError(
        `Amount "${amount}" is not a valid integer string of minor units.`,
      );
    }
    return Money.of(BigInt(amount), currency);
  }

  /** Sums money of one currency. The currency is explicit so an empty list is well defined. */
  static sum(currency: string, items: readonly Money[]): Money {
    return items.reduce<Money>(
      (total, item) => total.add(item),
      Money.zero(currency),
    );
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.minor + other.minor, this.currency);
  }

  /** Throws `NegativeAmountError` if `other` is larger than this amount. */
  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.minor - other.minor, this.currency);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minor === other.minor;
  }

  isZero(): boolean {
    return this.minor === 0n;
  }

  toWire(): MoneyWire {
    return { amount: this.minor.toString(), currency: this.currency };
  }

  toJSON(): MoneyWire {
    return this.toWire();
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(
        `Cannot combine ${this.currency} with ${other.currency}.`,
      );
    }
  }
}
