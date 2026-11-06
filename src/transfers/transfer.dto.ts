import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SUPPORTED_CURRENCIES } from '../money/index.js';
import { TRANSFER_STATUSES, type TransferStatus } from './transfer-status.js';
import {
  IsExchangeRate,
  IsMinorUnits,
  IsTransferDate,
} from './transfer-validators.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

const currencyDoc = { enum: SUPPORTED_CURRENCIES, example: 'GBP' };

/** Money on the wire (ADR 0004): whole minor units as a string, plus a currency. */
export class SentMoneyDto {
  @ApiProperty({
    example: '15000',
    description:
      'Minor units, as a string: "15000" with GBP is 150.00. Must be positive.',
  })
  @IsMinorUnits(true)
  amount: string;

  @ApiProperty(currencyDoc)
  @Transform(upper)
  @IsIn(SUPPORTED_CURRENCIES, {
    message: `currency must be one of ${SUPPORTED_CURRENCIES.join(', ')}.`,
  })
  currency: string;
}

export class FeeMoneyDto {
  @ApiProperty({
    example: '350',
    description: 'Minor units, as a string. Zero is allowed.',
  })
  @IsMinorUnits(false)
  amount: string;

  @ApiProperty({
    ...currencyDoc,
    description: 'Must equal the sending currency.',
  })
  @Transform(upper)
  @IsIn(SUPPORTED_CURRENCIES, {
    message: `currency must be one of ${SUPPORTED_CURRENCIES.join(', ')}.`,
  })
  currency: string;
}

export class CreateTransferDto {
  @ApiProperty({ format: 'uuid', description: 'One of your recipients.' })
  @IsUUID()
  recipientId: string;

  @ApiProperty({
    example: '2026-11-01',
    description:
      'YYYY-MM-DD, not before 2000-01-01 and at most 1 day after today (UTC).',
  })
  @IsTransferDate()
  transferDate: string;

  @ApiProperty({ type: SentMoneyDto })
  @IsDefined({ message: 'sent is required' })
  @ValidateNested()
  @Type(() => SentMoneyDto)
  sent: SentMoneyDto;

  @ApiPropertyOptional({
    type: FeeMoneyDto,
    description: 'Defaults to zero in the sending currency.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FeeMoneyDto)
  fee?: FeeMoneyDto;

  @ApiProperty({ ...currencyDoc, example: 'NGN' })
  @Transform(upper)
  @IsIn(SUPPORTED_CURRENCIES, {
    message: `receivingCurrency must be one of ${SUPPORTED_CURRENCIES.join(', ')}.`,
  })
  receivingCurrency: string;

  @ApiProperty({
    example: '1950.5',
    description:
      'Units of the receiving currency per 1 unit of the sending currency, as a decimal string.',
  })
  @IsExchangeRate()
  exchangeRate: string;

  @ApiProperty({ example: 'Wise', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  provider: string;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  purpose?: string | null;

  @ApiPropertyOptional({ enum: TRANSFER_STATUSES, default: 'pending' })
  @IsOptional()
  @IsIn(TRANSFER_STATUSES)
  status?: TransferStatus;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

/** PATCH body: every top-level field optional; `sent` and `fee` are replaced whole. */
export class UpdateTransferDto extends PartialType(CreateTransferDto) {}

/** Every value we store was typed in by the user (README: provenance). */
export type Provenance = 'user-entered';

export class MoneyResponse {
  @ApiProperty({ example: '15000' })
  amount: string;
  @ApiProperty(currencyDoc)
  currency: string;
  @ApiProperty({ enum: ['user-entered'] })
  provenance: Provenance;
}

export class RateResponse {
  @ApiProperty({ example: '1950.5' })
  value: string;
  @ApiProperty({ enum: ['user-entered'] })
  provenance: Provenance;
}

export class TransferResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ format: 'uuid' })
  recipientId: string;
  @ApiProperty({ example: '2026-11-01' })
  transferDate: string;
  @ApiProperty({ type: MoneyResponse })
  sent: MoneyResponse;
  @ApiProperty({ type: MoneyResponse, description: 'In the sending currency.' })
  fee: MoneyResponse;
  @ApiProperty(currencyDoc)
  receivingCurrency: string;
  @ApiProperty({ type: RateResponse })
  exchangeRate: RateResponse;
  @ApiProperty() provider: string;
  @ApiProperty({ type: String, nullable: true }) purpose: string | null;
  @ApiProperty({ enum: TRANSFER_STATUSES }) status: TransferStatus;
  @ApiProperty({ type: String, nullable: true }) notes: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: string;
}
