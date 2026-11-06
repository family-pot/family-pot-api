import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  CreateRecipientDto,
  UpdateRecipientDto,
} from './recipient.dto.js';
import { Recipient } from './recipient.entity.js';
import { RecipientUsageRegistry } from './recipient-usage.registry.js';

@Injectable()
export class RecipientsService {
  constructor(
    @InjectRepository(Recipient)
    private readonly recipients: Repository<Recipient>,
    private readonly usage: RecipientUsageRegistry,
  ) {}

  /** Sorted case-insensitively by name, then id; explicit so it does not depend on the DB collation. */
  list(userId: string): Promise<Recipient[]> {
    return this.recipients
      .createQueryBuilder('recipient')
      .where('recipient.userId = :userId', { userId })
      .orderBy('LOWER(recipient.name)', 'ASC')
      .addOrderBy('recipient.id', 'ASC')
      .getMany();
  }

  create(userId: string, dto: CreateRecipientDto): Promise<Recipient> {
    return this.recipients.save(
      this.recipients.create({
        userId,
        name: dto.name,
        country: dto.country,
        notes: dto.notes ?? null,
      }),
    );
  }

  /** Another user's recipient is indistinguishable from a missing one: 404. */
  async get(userId: string, id: string): Promise<Recipient> {
    const recipient = await this.recipients.findOneBy({ id, userId });
    if (!recipient) {
      throw new NotFoundException('Recipient not found.');
    }
    return recipient;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateRecipientDto,
  ): Promise<Recipient> {
    const recipient = await this.get(userId, id);
    if (dto.name !== undefined) recipient.name = dto.name;
    if (dto.country !== undefined) recipient.country = dto.country;
    if (dto.notes !== undefined) recipient.notes = dto.notes;
    return this.recipients.save(recipient);
  }

  async remove(userId: string, id: string): Promise<void> {
    const recipient = await this.get(userId, id);
    const inUse = await this.usage.usage(userId, id);
    const kinds = Object.entries(inUse);
    if (kinds.length > 0) {
      const detail = kinds
        .map(([name, count]) => `${count} ${name}`)
        .join(', ');
      throw new ConflictException(
        `This recipient cannot be deleted because it is still used by ${detail}. Delete or reassign those first.`,
      );
    }
    await this.recipients.remove(recipient);
  }
}
