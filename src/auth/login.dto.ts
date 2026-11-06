import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from './register.dto.js';

export class LoginDto {
  @ApiProperty({ example: 'ada@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  // No minimum here: a wrong password is a 401, not a 400 that reveals the policy.
  @ApiProperty({ writeOnly: true })
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

export class LoginResponse {
  @ApiProperty({
    description: 'Short-lived JWT; send as `Authorization: Bearer <token>`.',
  })
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({
    example: 900,
    description: 'Lifetime in seconds (JWT_ACCESS_TTL).',
  })
  expiresIn: number;
}

export class CurrentUserResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'ada@example.com' })
  email: string;
}
