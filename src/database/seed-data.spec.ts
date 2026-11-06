import { describe, expect, it } from 'vitest';
import { isCountryCode } from '../recipients/countries.js';
import { isSupportedCurrency } from '../money/index.js';
import { isTransferDate } from '../transfers/transfer-validators.js';
import { DEMO_RECIPIENTS, DEMO_TRANSFERS, DEMO_USER } from './seed-data.js';

// The seed writes straight to the database, so it must only contain data the
// API itself would accept.
describe('demo seed data', () => {
  it('has a demo login that satisfies the password policy', () => {
    expect(DEMO_USER.email).toMatch(/@familypot\.example$/);
    expect(DEMO_USER.password.length).toBeGreaterThanOrEqual(12);
  });

  it('has unique recipients with valid country codes, clearly marked as sample data', () => {
    expect(new Set(DEMO_RECIPIENTS.map((r) => r.name)).size).toBe(
      DEMO_RECIPIENTS.length,
    );
    for (const r of DEMO_RECIPIENTS) {
      expect(isCountryCode(r.country), r.name).toBe(true);
      expect(r.notes).toMatch(/^Sample data/);
    }
  });

  it('has transfers the API would accept', () => {
    const names = new Set(DEMO_RECIPIENTS.map((r) => r.name));
    for (const t of DEMO_TRANSFERS) {
      expect(names.has(t.recipient), t.recipient).toBe(true);
      expect(isTransferDate(t.transferDate), t.transferDate).toBe(true);
      expect(isSupportedCurrency(t.sent.currency)).toBe(true);
      expect(isSupportedCurrency(t.receivingCurrency)).toBe(true);
      expect(t.sent.minor).toBeGreaterThan(0n);
      expect(t.fee.currency).toBe(t.sent.currency); // the fee is in the sending currency
      expect(t.exchangeRate).toMatch(/^(0|[1-9]\d*)(\.\d*[1-9])?$/); // canonical: no trailing zeros
    }
  });

  it('has no two transfers with the same idempotency key', () => {
    const keys = DEMO_TRANSFERS.map((t) =>
      [
        t.recipient,
        t.transferDate,
        t.provider,
        t.sent.minor,
        t.sent.currency,
      ].join('|'),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('covers every transfer status and several providers and currencies', () => {
    expect(new Set(DEMO_TRANSFERS.map((t) => t.status))).toEqual(
      new Set(['pending', 'completed', 'failed', 'cancelled']),
    );
    expect(new Set(DEMO_TRANSFERS.map((t) => t.provider)).size).toBeGreaterThan(
      2,
    );
    expect(
      new Set(DEMO_TRANSFERS.map((t) => t.sent.currency)).size,
    ).toBeGreaterThan(2);
  });
});
