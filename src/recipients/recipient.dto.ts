import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
} from 'class-validator';
import { CountryCodeConstraint } from './country-code.validator.js';
import type { Recipient } from './recipient.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateRecipientDto {
  @ApiProperty({ example: 'Amara Okafor', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: 'NG',
    description: 'ISO 3166-1 alpha-2 country code.',
  })
  @Transform(upper)
  @Validate(CountryCodeConstraint)
  country: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

/** PATCH body: every field optional; `notes: null` clears the notes. */
export class UpdateRecipientDto extends PartialType(CreateRecipientDto) {}

export class RecipientResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Amara Okafor' })
  name: string;

  @ApiProperty({ example: 'NG' })
  country: string;

  @ApiProperty({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: string;

  /** The owner's id is deliberately not exposed. */
  static from(recipient: Recipient): RecipientResponse {
    return {
      id: recipient.id,
      name: recipient.name,
      country: recipient.country,
      notes: recipient.notes,
      createdAt: recipient.createdAt.toISOString(),
      updatedAt: recipient.updatedAt.toISOString(),
    };
  }
}
