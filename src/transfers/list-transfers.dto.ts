import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TransferResponse } from './transfer.dto.js';
import { TRANSFER_STATUSES, type TransferStatus } from './transfer-status.js';
import { IsCalendarDate } from './transfer-validators.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Query string of `GET /transfers`. Unknown parameters are rejected with 400. */
export class ListTransfersQuery {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Only transfers to this recipient.',
  })
  @IsOptional()
  @IsUUID()
  recipientId?: string;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Transfers on or after this date (inclusive).',
  })
  @IsOptional()
  @IsCalendarDate()
  dateFrom?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Transfers on or before this date (inclusive).',
  })
  @IsOptional()
  @IsCalendarDate()
  dateTo?: string;

  @ApiPropertyOptional({
    example: 'Wise',
    description: 'Exact provider name, case-insensitive.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  provider?: string;

  @ApiPropertyOptional({ enum: TRANSFER_STATUSES })
  @IsOptional()
  @IsIn(TRANSFER_STATUSES)
  status?: TransferStatus;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
    description: 'Page size.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Opaque cursor: pass the `nextCursor` of the previous page to get the next one.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

export class PaginationMeta {
  @ApiProperty({ example: 20, description: 'The page size used.' })
  limit: number;

  @ApiProperty({ description: 'There are more transfers after this page.' })
  hasMore: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Pass as `cursor` to get the next page; null on the last page.',
  })
  nextCursor: string | null;
}

export class TransferPage {
  @ApiProperty({ type: [TransferResponse] })
  data: TransferResponse[];

  @ApiProperty({ type: PaginationMeta })
  pagination: PaginationMeta;
}
