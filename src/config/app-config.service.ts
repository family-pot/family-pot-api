import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  EnvironmentVariables,
  NodeEnvironment,
  SameSiteMode,
} from './environment.js';

/**
 * Typed access to the values parsed by validateEnvironment.
 *
 * Inject this instead of ConfigService so a typo in a key is a compiler error
 * and every caller sees the same defaults.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<EnvironmentVariables>) {}

  get port(): number {
    return this.config.getOrThrow<number>('PORT');
  }

  get nodeEnv(): NodeEnvironment {
    return this.config.getOrThrow<NodeEnvironment>('NODE_ENV');
  }

  get databaseUrl(): string {
    return this.config.getOrThrow<string>('DATABASE_URL');
  }

  get databaseUrlTest(): string | undefined {
    return this.config.get<string>('DATABASE_URL_TEST');
  }

  get databaseSsl(): boolean {
    return this.config.getOrThrow<boolean>('DATABASE_SSL');
  }

  get corsOrigins(): string[] {
    return this.config.getOrThrow<string[]>('CORS_ORIGIN');
  }

  get jwtAccessSecret(): string {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  get jwtAccessTtl(): string {
    return this.config.getOrThrow<string>('JWT_ACCESS_TTL');
  }

  get refreshTokenTtlDays(): number {
    return this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');
  }

  get refreshCookieSameSite(): SameSiteMode {
    return this.config.getOrThrow<SameSiteMode>('REFRESH_COOKIE_SAME_SITE');
  }

  get rateLimitGlobalLimit(): number {
    return this.config.getOrThrow<number>('RATE_LIMIT_GLOBAL_LIMIT');
  }

  get rateLimitGlobalTtlSeconds(): number {
    return this.config.getOrThrow<number>('RATE_LIMIT_GLOBAL_TTL_SECONDS');
  }

  get rateLimitAuthLimit(): number {
    return this.config.getOrThrow<number>('RATE_LIMIT_AUTH_LIMIT');
  }

  get rateLimitAuthTtlSeconds(): number {
    return this.config.getOrThrow<number>('RATE_LIMIT_AUTH_TTL_SECONDS');
  }

  get requestBodyLimit(): string {
    return this.config.getOrThrow<string>('REQUEST_BODY_LIMIT');
  }

  /** Number of reverse proxies in front of the API (0 = none). */
  get trustProxy(): number {
    return this.config.getOrThrow<number>('TRUST_PROXY');
  }

  get allowRemoteDbReset(): boolean {
    return this.config.getOrThrow<boolean>('ALLOW_REMOTE_DB_RESET');
  }
}
