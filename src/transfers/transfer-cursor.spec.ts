import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './transfer-cursor.js';

const ID = '0b8f9a7e-3c52-4c8e-9a52-6d9a1f6a1b11';

describe('transfer cursor', () => {
  it('round-trips the sort key and is URL-safe', () => {
    const cursor = encodeCursor({ transferDate: '2026-11-01', id: ID });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor)).toEqual({
      transferDate: '2026-11-01',
      id: ID,
    });
  });

  it('rejects anything we could not have issued', () => {
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    for (const bad of [
      '',
      'garbage',
      '!!!',
      encode('2026-11-01'),
      encode(['2026-11-01']),
      encode(['2026-11-01', ID, 'extra']),
      encode(['2026-02-30', ID]),
      encode(['2026-11-01', 'not-a-uuid']),
      encode([20261101, ID]),
      encode({ transferDate: '2026-11-01', id: ID }),
      Buffer.from('not json').toString('base64url'),
    ]) {
      expect(decodeCursor(bad), bad).toBeUndefined();
    }
  });
});
