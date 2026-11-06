import { describe, expect, it } from 'vitest';
import { collectFieldErrors, validationError } from '../common/validation.js';
import { toTransferResponse } from './transfer.mapper.js';
import type { Transfer } from './transfer.entity.js';
import {
  isExchangeRate,
  isMinorUnits,
  isTransferDate,
} from './transfer-validators.js';

describe('isMinorUnits', () => {
  it('accepts canonical non-negative integer strings up to the bigint maximum', () => {
    for (const v of [
      '0',
      '1',
      '15000',
      '9007199254740993',
      '9223372036854775807',
    ]) {
      expect(isMinorUnits(v, { positive: false })).toBe(true);
    }
  });

  it('rejects numbers, decimals, signs, padding and overflow', () => {
    for (const v of [
      15000,
      '',
      '-1',
      '1.5',
      '01',
      ' 1',
      '1e3',
      'abc',
      '9223372036854775808',
      null,
      undefined,
    ]) {
      expect(isMinorUnits(v, { positive: false }), String(v)).toBe(false);
    }
  });

  it('can require a positive amount', () => {
    expect(isMinorUnits('0', { positive: true })).toBe(false);
    expect(isMinorUnits('1', { positive: true })).toBe(true);
  });
});

describe('isExchangeRate', () => {
  it('accepts positive decimal strings with up to 12 decimals', () => {
    for (const v of [
      '1',
      '0.1',
      '1950.5',
      '0.000000000001',
      '123456789012.123456789012',
    ]) {
      expect(isExchangeRate(v)).toBe(true);
    }
  });

  it('rejects everything else', () => {
    for (const v of [
      '0',
      '-1',
      '',
      '.5',
      '1.',
      '1e3',
      'abc',
      '1.0000000000001',
      1950,
      null,
    ]) {
      expect(isExchangeRate(v), String(v)).toBe(false);
    }
  });
});

describe('isTransferDate', () => {
  const now = new Date('2026-11-05T23:30:00Z');

  it('accepts today, yesterday, tomorrow and the earliest date', () => {
    for (const v of ['2026-11-05', '2026-11-04', '2026-11-06', '2000-01-01']) {
      expect(isTransferDate(v, now), v).toBe(true);
    }
  });

  it('rejects dates more than one day ahead, before 2000, or not real dates', () => {
    for (const v of [
      '2026-11-07',
      '2999-01-01',
      '1999-12-31',
      '2026-02-30',
      '2026-13-01',
      '2026-1-1',
      '2026-11-05T10:00:00Z',
      'tomorrow',
      '',
      20261105,
      null,
    ]) {
      expect(isTransferDate(v, now), String(v)).toBe(false);
    }
  });

  it('handles leap days', () => {
    expect(isTransferDate('2024-02-29', now)).toBe(true);
    expect(isTransferDate('2025-02-29', now)).toBe(false);
  });

  it('is evaluated against the supplied clock, in UTC', () => {
    expect(isTransferDate('2026-11-06', new Date('2026-11-05T00:00:00Z'))).toBe(
      true,
    );
    expect(isTransferDate('2026-11-07', new Date('2026-11-05T23:59:59Z'))).toBe(
      false,
    );
  });
});

describe('field-level validation errors', () => {
  it('flattens a nested error tree into dotted field paths', () => {
    const errors = collectFieldErrors([
      {
        property: 'provider',
        constraints: { length: 'too short' },
        children: [],
      },
      {
        property: 'sent',
        children: [
          {
            property: 'amount',
            constraints: { isMinorUnits: 'bad amount' },
            children: [],
          },
        ],
      },
    ]);
    expect(errors).toEqual([
      { field: 'provider', messages: ['too short'] },
      { field: 'sent.amount', messages: ['bad amount'] },
    ]);
  });

  it('keeps the flat message list and adds the grouped errors', () => {
    const exception = validationError([
      { field: 'a', messages: ['one', 'two'] },
      { field: 'b', messages: ['three'] },
    ]);
    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: ['one', 'two', 'three'],
      errors: [
        { field: 'a', messages: ['one', 'two'] },
        { field: 'b', messages: ['three'] },
      ],
    });
  });
});

describe('toTransferResponse', () => {
  it('builds money through the money module and marks provenance', () => {
    const response = toTransferResponse({
      id: 'id',
      recipientId: 'r',
      transferDate: '2026-11-01',
      sentAmountMinor: 9007199254740993n,
      sentCurrency: 'GBP',
      receivingCurrency: 'NGN',
      exchangeRate: '1950.5',
      feeMinor: 0n,
      provider: 'Wise',
      purpose: null,
      status: 'pending',
      notes: null,
      createdAt: new Date('2026-11-01T10:00:00Z'),
      updatedAt: new Date('2026-11-01T10:00:00Z'),
    } as Transfer);
    expect(response.sent).toEqual({
      amount: '9007199254740993',
      currency: 'GBP',
      provenance: 'user-entered',
    });
    expect(response.fee).toEqual({
      amount: '0',
      currency: 'GBP',
      provenance: 'user-entered',
    });
    expect(response.exchangeRate).toEqual({
      value: '1950.5',
      provenance: 'user-entered',
    });
    expect(response.createdAt).toBe('2026-11-01T10:00:00.000Z');
  });
});
