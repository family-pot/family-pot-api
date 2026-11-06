import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validationError, type FieldError } from '../common/validation.js';
import {
  ExchangeRate,
  Money,
  numericStringTransformer,
} from '../money/index.js';
import { RecipientUsageRegistry } from '../recipients/recipient-usage.registry.js';
import { RecipientsService } from '../recipients/recipients.service.js';
import type { CreateTransferDto, UpdateTransferDto } from './transfer.dto.js';
import { Transfer } from './transfer.entity.js';

/** The rate as stored: no trailing zeros, so what we return is what a re-read returns. */
function canonicalRate(value: string): string {
  return numericStringTransformer.from(
    ExchangeRate.parse(value).value,
  ) as string;
}

@Injectable()
export class TransfersService implements OnModuleInit {
  constructor(
    @InjectRepository(Transfer)
    private readonly transfers: Repository<Transfer>,
    private readonly recipients: RecipientsService,
    private readonly usage: RecipientUsageRegistry,
  ) {}

  onModuleInit(): void {
    // Lets the recipients module refuse to delete a recipient that has transfers.
    this.usage.register('transfers', {
      count: (userId, recipientId) =>
        this.transfers.countBy({ userId, recipientId }),
    });
  }

  /** Newest first, with the id as a tiebreak so the order is stable. */
  list(userId: string): Promise<Transfer[]> {
    return this.transfers.find({
      where: { userId },
      order: { transferDate: 'DESC', id: 'DESC' },
    });
  }

  /** Another user's transfer is indistinguishable from a missing one: 404. */
  async get(userId: string, id: string): Promise<Transfer> {
    const transfer = await this.transfers.findOneBy({ id, userId });
    if (!transfer) {
      throw new NotFoundException('Transfer not found.');
    }
    return transfer;
  }

  async create(userId: string, dto: CreateTransferDto): Promise<Transfer> {
    await this.assertOwnRecipient(userId, dto.recipientId);
    const sent = Money.fromWire({
      amount: dto.sent.amount,
      currency: dto.sent.currency,
    });
    const fee = this.feeFor(sent.currency, dto.fee);

    const saved = await this.transfers.save(
      this.transfers.create({
        userId,
        recipientId: dto.recipientId,
        transferDate: dto.transferDate,
        sentAmountMinor: sent.minor,
        sentCurrency: sent.currency,
        receivingCurrency: dto.receivingCurrency,
        exchangeRate: canonicalRate(dto.exchangeRate),
        feeMinor: fee.minor,
        provider: dto.provider,
        purpose: dto.purpose ?? null,
        status: dto.status ?? 'pending',
        notes: dto.notes ?? null,
      }),
    );
    // Re-read so the response is exactly what a later GET returns.
    return this.get(userId, saved.id);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTransferDto,
  ): Promise<Transfer> {
    const transfer = await this.get(userId, id);

    if (
      dto.recipientId !== undefined &&
      dto.recipientId !== transfer.recipientId
    ) {
      await this.assertOwnRecipient(userId, dto.recipientId);
      transfer.recipientId = dto.recipientId;
    }
    if (dto.sent !== undefined) {
      const sent = Money.fromWire({
        amount: dto.sent.amount,
        currency: dto.sent.currency,
      });
      if (sent.currency !== transfer.sentCurrency && dto.fee === undefined) {
        // The fee is in the sending currency; silently re-labelling it would change its meaning.
        throw validationError([
          {
            field: 'fee',
            messages: [
              'fee must be provided when the sending currency changes.',
            ],
          },
        ]);
      }
      transfer.sentAmountMinor = sent.minor;
      transfer.sentCurrency = sent.currency;
    }
    if (dto.fee !== undefined) {
      transfer.feeMinor = this.feeFor(transfer.sentCurrency, dto.fee).minor;
    }
    if (dto.transferDate !== undefined)
      transfer.transferDate = dto.transferDate;
    if (dto.receivingCurrency !== undefined)
      transfer.receivingCurrency = dto.receivingCurrency;
    if (dto.exchangeRate !== undefined)
      transfer.exchangeRate = canonicalRate(dto.exchangeRate);
    if (dto.provider !== undefined) transfer.provider = dto.provider;
    if (dto.purpose !== undefined) transfer.purpose = dto.purpose;
    if (dto.status !== undefined) transfer.status = dto.status;
    if (dto.notes !== undefined) transfer.notes = dto.notes;

    await this.transfers.save(transfer);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.transfers.remove(await this.get(userId, id));
  }

  /** The fee is in the sending currency; a differing currency is a field error. */
  private feeFor(sentCurrency: string, fee: CreateTransferDto['fee']): Money {
    if (!fee) return Money.zero(sentCurrency);
    const money = Money.fromWire({
      amount: fee.amount,
      currency: fee.currency,
    });
    if (money.currency !== sentCurrency) {
      throw validationError([
        {
          field: 'fee.currency',
          messages: [
            `fee.currency must equal the sending currency (${sentCurrency}).`,
          ],
        },
      ]);
    }
    return money;
  }

  /** A recipient of someone else is reported exactly like one that does not exist. */
  private async assertOwnRecipient(
    userId: string,
    recipientId: string,
  ): Promise<void> {
    try {
      await this.recipients.get(userId, recipientId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        const field: FieldError = {
          field: 'recipientId',
          messages: ['recipientId must refer to one of your recipients.'],
        };
        throw validationError([field]);
      }
      throw error;
    }
  }
}
