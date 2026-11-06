import { describe, expect, it } from 'vitest';
import { bigintTransformer, numericStringTransformer } from './index.js';

describe('bigintTransformer', () => {
  it('writes bigint as a string and reads strings as bigint, beyond 2^53', () => {
    expect(bigintTransformer.to(9007199254740993n)).toBe('9007199254740993');
    expect(bigintTransformer.from('9007199254740993')).toBe(9007199254740993n);
  });

  it('passes null and undefined through', () => {
    expect(bigintTransformer.to(null)).toBeNull();
    expect(bigintTransformer.to(undefined)).toBeUndefined();
    expect(bigintTransformer.from(null)).toBeNull();
    expect(bigintTransformer.from(undefined)).toBeUndefined();
  });
});

describe('numericStringTransformer', () => {
  it('keeps strings and trims the scale padding Postgres adds', () => {
    expect(numericStringTransformer.to('1950.5')).toBe('1950.5');
    expect(numericStringTransformer.from('1950.500000000000')).toBe('1950.5');
    expect(numericStringTransformer.from('1950.000000000000')).toBe('1950');
    expect(numericStringTransformer.from('0.100000000000')).toBe('0.1');
    expect(numericStringTransformer.from('1950')).toBe('1950');
  });

  it('passes null and undefined through', () => {
    expect(numericStringTransformer.to(null)).toBeNull();
    expect(numericStringTransformer.from(null)).toBeNull();
    expect(numericStringTransformer.from(undefined)).toBeUndefined();
  });
});
