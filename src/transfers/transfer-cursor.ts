import { isUUID } from 'class-validator';
import { isCalendarDate } from './transfer-validators.js';

/** Where the previous page ended: the sort key of its last item. */
export interface TransferCursor {
  transferDate: string;
  id: string;
}

/**
 * Cursors are opaque to clients. They only hold the sort key (`transferDate`,
 * `id`), so they carry no data, cannot reach another user's rows (the query is
 * always scoped to the caller), and stay valid when rows are added or removed.
 */
export function encodeCursor(cursor: TransferCursor): string {
  return Buffer.from(JSON.stringify([cursor.transferDate, cursor.id])).toString(
    'base64url',
  );
}

/** Returns `undefined` for anything that is not a cursor we could have issued. */
export function decodeCursor(value: string): TransferCursor | undefined {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (!Array.isArray(parsed) || parsed.length !== 2) return undefined;
    const [transferDate, id] = parsed as unknown[];
    if (typeof transferDate !== 'string' || typeof id !== 'string')
      return undefined;
    if (!isCalendarDate(transferDate) || !isUUID(id)) return undefined;
    return { transferDate, id };
  } catch {
    return undefined;
  }
}
