import { describe, expect, it } from 'vitest';
import {
  CurrencyMismatchError,
  InvalidAmountError,
  MAX_MINOR_UNITS,
  Money,
  MoneyError,
  NegativeAmountError,
  UnsupportedCurrencyError,
  SUPPORTED_CURRENCIES,
  exponentOf,
  isKnownCurrency,
  isSupportedCurrency,
} from './index.js';

describe('currencies', () => {
  it('has exponents for every MVP currency', () => {
    expect(SUPPORTED_CURRENCIES).toEqual([
      'GBP',
      'USD',
      'EUR',
      'CAD',
      'NGN',
      'GHS',
      'KES',
      'INR',
      'PHP',
    ]);
    for (const code of SUPPORTED_CURRENCIES) {
      expect(isSupportedCurrency(code)).toBe(true);
      expect(exponentOf(code)).toBe(2);
    }
  });

  it('knows 0- and 3-decimal currencies without enabling them for the MVP', () => {
    expect(exponentOf('JPY')).toBe(0);
    expect(exponentOf('KWD')).toBe(3);
    expect(isKnownCurrency('JPY')).toBe(true);
    expect(isSupportedCurrency('JPY')).toBe(false);
  });

  it('rejects unknown currencies, including prototype keys', () => {
    expect(isKnownCurrency('XXX')).toBe(false);
    expect(isKnownCurrency('toString')).toBe(false);
    expect(isSupportedCurrency('gbp')).toBe(false);
    expect(() => exponentOf('XXX')).toThrow(UnsupportedCurrencyError);
  });
});

describe('Money.of', () => {
  it('stores bigint minor units and a currency', () => {
    const money = Money.of(15000n, 'GBP');
    expect(money.minor).toBe(15000n);
    expect(money.currency).toBe('GBP');
  });

  it('allows zero', () => {
    expect(Money.zero('USD').isZero()).toBe(true);
    expect(Money.of(1n, 'USD').isZero()).toBe(false);
  });

  it('rejects negative amounts with a clear error', () => {
    expect(() => Money.of(-1n, 'GBP')).toThrow(NegativeAmountError);
    expect(() => Money.of(-1n, 'GBP')).toThrow('Amount must not be negative.');
  });

  it('rejects numbers, so floats can never enter', () => {
    expect(() => Money.of(1.5 as unknown as bigint, 'GBP')).toThrow(
      InvalidAmountError,
    );
    expect(() => Money.of(100 as unknown as bigint, 'GBP')).toThrow(
      /never numbers/,
    );
  });

  it('rejects an unknown currency', () => {
    expect(() => Money.of(1n, 'ZZZ')).toThrow(UnsupportedCurrencyError);
  });

  it('handles amounts beyond Number.MAX_SAFE_INTEGER exactly', () => {
    const beyond = BigInt(Number.MAX_SAFE_INTEGER) + 2n; // 9007199254740993
    const money = Money.of(beyond, 'NGN');
    expect(money.toWire().amount).toBe('9007199254740993');
    expect(Money.fromWire(money.toWire()).minor).toBe(beyond);
    expect(money.add(Money.of(1n, 'NGN')).minor).toBe(beyond + 1n);
  });

  it('enforces the Postgres bigint maximum', () => {
    expect(Money.of(MAX_MINOR_UNITS, 'GBP').minor).toBe(MAX_MINOR_UNITS);
    expect(() => Money.of(MAX_MINOR_UNITS + 1n, 'GBP')).toThrow(/maximum/);
  });

  it('all errors share the MoneyError base', () => {
    expect(() => Money.of(-1n, 'GBP')).toThrow(MoneyError);
  });
});

describe('wire format', () => {
  it('round-trips { amount: string, currency }', () => {
    const wire = { amount: '15000', currency: 'GBP' };
    expect(Money.fromWire(wire).toWire()).toEqual(wire);
    expect(JSON.stringify(Money.of(15000n, 'GBP'))).toBe(
      '{"amount":"15000","currency":"GBP"}',
    );
  });

  it('accepts "0"', () => {
    expect(Money.fromWire({ amount: '0', currency: 'GBP' }).isZero()).toBe(
      true,
    );
  });

  it('rejects a negative string with the negative error', () => {
    expect(() => Money.fromWire({ amount: '-5', currency: 'GBP' })).toThrow(
      NegativeAmountError,
    );
  });

  it.each([
    '',
    ' 12',
    '12 ',
    '1.5',
    '1e3',
    '0x10',
    '007',
    '+5',
    'abc',
    '١٢٣',
    '1,000',
  ])('rejects malformed amount %j', (amount) => {
    expect(() => Money.fromWire({ amount, currency: 'GBP' })).toThrow(
      InvalidAmountError,
    );
  });

  it('rejects a non-string amount (numbers on the wire)', () => {
    expect(() =>
      Money.fromWire({ amount: 150 as unknown as string, currency: 'GBP' }),
    ).toThrow(/string of minor units/);
  });

  it('rejects an unknown currency', () => {
    expect(() => Money.fromWire({ amount: '1', currency: 'ZZZ' })).toThrow(
      UnsupportedCurrencyError,
    );
  });
});

describe('add, subtract and sum', () => {
  const gbp = (minor: bigint) => Money.of(minor, 'GBP');

  it('adds and subtracts exactly', () => {
    expect(gbp(1001n).add(gbp(1n)).minor).toBe(1002n);
    expect(gbp(1001n).subtract(gbp(1n)).minor).toBe(1000n);
    expect(gbp(5n).subtract(gbp(5n)).isZero()).toBe(true);
  });

  it('throws when subtracting more than is available', () => {
    expect(() => gbp(1n).subtract(gbp(2n))).toThrow(NegativeAmountError);
  });

  it('throws on currency mismatch', () => {
    const usd = Money.of(1n, 'USD');
    expect(() => gbp(1n).add(usd)).toThrow(CurrencyMismatchError);
    expect(() => gbp(1n).subtract(usd)).toThrow('Cannot combine GBP with USD.');
  });

  it('sums a list, an empty list and rejects mixed currencies', () => {
    expect(Money.sum('GBP', [gbp(1n), gbp(2n), gbp(3n)]).minor).toBe(6n);
    expect(Money.sum('GBP', []).isZero()).toBe(true);
    expect(() => Money.sum('GBP', [gbp(1n), Money.of(1n, 'USD')])).toThrow(
      CurrencyMismatchError,
    );
  });

  it('compares by value and currency', () => {
    expect(gbp(5n).equals(gbp(5n))).toBe(true);
    expect(gbp(5n).equals(gbp(6n))).toBe(false);
    expect(gbp(5n).equals(Money.of(5n, 'USD'))).toBe(false);
  });
});
