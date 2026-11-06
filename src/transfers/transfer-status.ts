export const TRANSFER_STATUSES = [
  'pending',
  'completed',
  'failed',
  'cancelled',
] as const;

export type TransferStatus = (typeof TRANSFER_STATUSES)[number];
