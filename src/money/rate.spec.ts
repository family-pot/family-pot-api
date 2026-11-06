import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUNDING_MODE,
  ExchangeRate,
  InvalidRateError,
  Money,
  RATE_MAX_DECIMALS,
  UnsupportedCurrencyError,
  convert,
} from './index.js';

const rate = (value: string) => ExchangeRate.parse(value);

describe('ExchangeRate.parse', () => {
  it.each([
    '1',
    '0.5',
    '1950.5',
    '0.000000000001',
    '123456789012.123456789012',
  ])('accepts %s', (value) => {
    expect(rate(value).value).toBe(value);
    expect(JSON.stringify(rate(value))).toBe(`"${value}"`);
  });

  it.each([
    '',
    '0',
    '0.0',
    '-1',
    '1e3',
    '.5',
    '1.',
    '1,5',
    ' 1',
    'abc',
    '01',
    '1.2.3',
  ])('rejects %j', (value) => {
    expect(() => rate(value)).toThrow(InvalidRateError);
  });

  it('rejects more than 12 decimal places', () => {
    expect(RATE_MAX_DECIMALS).toBe(12);
    expect(() => rate('1.0000000000001')).toThrow(/12 decimal places/);
  });

  it('rejects non-strings', () => {
    expect(() => ExchangeRate.parse(1.5 as unknown as string)).toThrow(
      InvalidRateError,
    );
  });
});

describe('convert: ADR 0004 worked examples', () => {
  it('1. £150.00 at 1950.5 NGN per GBP is NGN 292,575.00', () => {
    const result = convert(
      Money.of(15000n, 'GBP'),
      rate('1950.5'),
      'NGN',
      'half_up',
    );
    expect(result.toWire()).toEqual({ amount: '29257500', currency: 'NGN' });
  });

  it('2. 1001 pence x 1.2345 = 1235.7345 rounds half up to 1236', () => {
    const result = convert(
      Money.of(1001n, 'GBP'),
      rate('1.2345'),
      'USD',
      'half_up',
    );
    expect(result.minor).toBe(1236n);
  });

  it('3. tie: 5 x 0.5 = 2.5 is 3 half up and 2 half to even', () => {
    const five = Money.of(5n, 'GBP');
    expect(convert(five, rate('0.5'), 'USD', 'half_up').minor).toBe(3n);
    expect(convert(five, rate('0.5'), 'USD', 'half_even').minor).toBe(2n);
  });
});

describe('convert: rounding modes', () => {
  const at = (minor: bigint, r: string, mode: Parameters<typeof convert>[3]) =>
    convert(Money.of(minor, 'GBP'), rate(r), 'USD', mode).minor;

  it('half_up rounds ties away from zero', () => {
    expect(at(5n, '0.5', 'half_up')).toBe(3n); // 2.5
    expect(at(7n, '0.5', 'half_up')).toBe(4n); // 3.5
    expect(at(10n, '0.24', 'half_up')).toBe(2n); // 2.4
    expect(at(10n, '0.26', 'half_up')).toBe(3n); // 2.6
  });

  it('half_even rounds ties to the nearest even', () => {
    expect(at(5n, '0.5', 'half_even')).toBe(2n); // 2.5
    expect(at(7n, '0.5', 'half_even')).toBe(4n); // 3.5
    expect(at(10n, '0.26', 'half_even')).toBe(3n);
  });

  it('down truncates and up rounds away', () => {
    expect(at(10n, '0.29', 'down')).toBe(2n); // 2.9
    expect(at(10n, '0.21', 'up')).toBe(3n); // 2.1
    expect(at(10n, '0.2', 'down')).toBe(2n); // exact stays exact
    expect(at(10n, '0.2', 'up')).toBe(2n);
  });

  it('exposes half up as the default for user-facing conversion', () => {
    expect(DEFAULT_ROUNDING_MODE).toBe('half_up');
  });
});

describe('convert: currency exponents', () => {
  it('shifts between 2-decimal and 0-decimal currencies', () => {
    // £150.00 at 190 JPY per GBP = 28,500 JPY (JPY has no minor unit).
    const jpy = convert(Money.of(15000n, 'GBP'), rate('190'), 'JPY', 'half_up');
    expect(jpy.toWire()).toEqual({ amount: '28500', currency: 'JPY' });
    // And back: 28,500 JPY at 0.005263157895 GBP per JPY.
    const gbp = convert(jpy, rate('0.005263157895'), 'GBP', 'half_up');
    expect(gbp.minor).toBe(15000n);
  });

  it('shifts to a 3-decimal currency', () => {
    // £10.00 at 0.38 KWD per GBP = 3.800 KWD = 3800 fils.
    const kwd = convert(Money.of(1000n, 'GBP'), rate('0.38'), 'KWD', 'half_up');
    expect(kwd.toWire()).toEqual({ amount: '3800', currency: 'KWD' });
    // 3 -> 2 decimals: 3800 fils (3.800 KWD) at 2.6 GBP per KWD = 988 pence (£9.88).
    expect(convert(kwd, rate('2.6'), 'GBP', 'half_up').minor).toBe(988n);
  });

  it('is exact for amounts beyond Number.MAX_SAFE_INTEGER', () => {
    const big = Money.of(9007199254740993n, 'NGN');
    const result = convert(big, rate('3'), 'GHS', 'half_up');
    expect(result.minor).toBe(27021597764222979n); // would be wrong as a float
  });

  it('converts zero', () => {
    expect(
      convert(Money.zero('GBP'), rate('2'), 'USD', 'half_up').isZero(),
    ).toBe(true);
  });

  it('rejects an unknown target currency', () => {
    expect(() =>
      convert(Money.of(1n, 'GBP'), rate('1'), 'ZZZ', 'half_up'),
    ).toThrow(UnsupportedCurrencyError);
  });

  it('rejects a result above the bigint maximum', () => {
    expect(() =>
      convert(
        Money.of(9007199254740993n, 'GBP'),
        rate('1024'),
        'USD',
        'half_up',
      ),
    ).toThrow(/maximum/);
  });
});
