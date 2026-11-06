import { Money } from '../money/index.js';
import type { TransferResponse } from './transfer.dto.js';
import type { Transfer } from './transfer.entity.js';

/**
 * Builds the response. Money goes through the money module (the only code that
 * touches amounts), and every figure carries its provenance: everything stored
 * here was entered by the user.
 */
export function toTransferResponse(transfer: Transfer): TransferResponse {
  const sent = Money.of(
    transfer.sentAmountMinor,
    transfer.sentCurrency,
  ).toWire();
  const fee = Money.of(transfer.feeMinor, transfer.sentCurrency).toWire();
  return {
    id: transfer.id,
    recipientId: transfer.recipientId,
    transferDate: transfer.transferDate,
    sent: { ...sent, provenance: 'user-entered' },
    fee: { ...fee, provenance: 'user-entered' },
    receivingCurrency: transfer.receivingCurrency,
    exchangeRate: { value: transfer.exchangeRate, provenance: 'user-entered' },
    provider: transfer.provider,
    purpose: transfer.purpose,
    status: transfer.status,
    notes: transfer.notes,
    createdAt: transfer.createdAt.toISOString(),
    updatedAt: transfer.updatedAt.toISOString(),
  };
}
