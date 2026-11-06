import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity.js';
import { bigintTransformer, numericStringTransformer } from '../money/index.js';
import { Recipient } from '../recipients/recipient.entity.js';
import { User } from '../users/user.entity.js';
import type { TransferStatus } from './transfer-status.js';

@Entity({ name: 'transfers' })
@Check("\"status\" IN ('pending', 'completed', 'failed', 'cancelled')")
@Check('"sentAmountMinor" > 0')
@Check('"feeMinor" >= 0')
export class Transfer extends AppBaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'uuid' })
  recipientId: string;

  // RESTRICT: a recipient that still has transfers can never be deleted, even
  // if an application-level check is bypassed.
  @ManyToOne(() => Recipient, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'recipientId' })
  recipient?: Recipient;

  /** Calendar date the money was sent, `YYYY-MM-DD`. */
  @Column({ type: 'date' })
  transferDate: string;

  /** Sent amount in minor units of `sentCurrency` (ADR 0004). */
  @Column({ type: 'bigint', transformer: bigintTransformer })
  sentAmountMinor: bigint;

  @Column({ type: 'varchar', length: 3 })
  sentCurrency: string;

  @Column({ type: 'varchar', length: 3 })
  receivingCurrency: string;

  /** Units of the receiving currency per 1 unit of the sending currency. */
  @Column({
    type: 'numeric',
    precision: 24,
    scale: 12,
    transformer: numericStringTransformer,
  })
  exchangeRate: string;

  /** Fee in minor units of the SENDING currency. */
  @Column({ type: 'bigint', transformer: bigintTransformer })
  feeMinor: bigint;

  @Column({ type: 'varchar', length: 100 })
  provider: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  purpose: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: TransferStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;
}
