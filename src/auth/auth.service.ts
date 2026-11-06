import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../config/app-config.service.js';
import { PasswordService } from '../users/password.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { UsersService } from '../users/users.service.js';
import type { AccessTokenPayload } from './auth.types.js';
import { durationToSeconds } from './duration.js';

export const INVALID_CREDENTIALS = 'Invalid email or password.';
export const INVALID_REFRESH_TOKEN = 'Invalid or expired refresh token.';

@Injectable()
export class AuthService implements OnModuleInit {
  /** A real hash of a throwaway value, verified against when the email is unknown. */
  private dummyHash!: string;

  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.passwords.hash(`dummy-${Math.random()}`);
  }

  /**
   * Verifies the credentials and returns a signed access token.
   *
   * A wrong password and an unknown email give the identical response, and both
   * run one argon2 verification, so neither the body nor the response time
   * reveals whether the email is registered.
   */
  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    const valid = await this.passwords.verify(
      user?.passwordHash ?? this.dummyHash,
      password,
    );
    if (!user || !valid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return {
      ...(await this.accessToken(user.id)),
      refreshToken: await this.refreshTokens.issue(user.id),
    };
  }

  /**
   * Rotates a refresh token and returns a new access token and refresh token.
   * Every failure (unknown, expired, revoked, reused) is the same generic 401.
   */
  async refresh(rawToken: string | undefined) {
    if (!rawToken) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }
    const result = await this.refreshTokens.rotate(rawToken);
    if (result.status !== 'rotated') {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }
    // The family belongs to a user who may have been deleted since (the cascade
    // would have removed the token, so this is just defence in depth).
    const user = await this.users.findById(result.userId);
    if (!user) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }
    return {
      ...(await this.accessToken(user.id)),
      refreshToken: result.token,
    };
  }

  /** Ends the session of the presented refresh token. Never reveals whether it was valid. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) {
      await this.refreshTokens.revokeFamilyOf(rawToken);
    }
  }

  private async accessToken(userId: string) {
    const payload: AccessTokenPayload = { sub: userId };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer' as const,
      expiresIn: durationToSeconds(this.config.jwtAccessTtl),
    };
  }
}
