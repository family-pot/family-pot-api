import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 12;
/** Upper bound so a huge password cannot be used to burn CPU and memory while hashing. */
export const PASSWORD_MAX_LENGTH = 128;

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com', description: 'Stored lowercase.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description: `${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters.`,
    writeOnly: true,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

export class RegisterResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'ada@example.com' })
  email: string;
}
