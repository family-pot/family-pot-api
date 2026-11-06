import { SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { AppConfigService } from '../config/app-config.service.js';

const AUTH_RATE_LIMIT = 'rate-limit:auth';

/**
 * Marks a route as sensitive: it gets the stricter `auth` limit on top of the
 * global one. Put it on credential-handling endpoints (register, login, refresh).
 */
export const StrictRateLimit = () => SetMetadata(AUTH_RATE_LIMIT, true);

/** Both limits are per client IP and come from configuration. */
export function throttlerOptions(
  config: AppConfigService,
): ThrottlerModuleOptions {
  return {
    throttlers: [
      {
        name: 'global',
        ttl: config.rateLimitGlobalTtlSeconds * 1000,
        limit: config.rateLimitGlobalLimit,
      },
      {
        name: 'auth',
        ttl: config.rateLimitAuthTtlSeconds * 1000,
        limit: config.rateLimitAuthLimit,
        // Only routes marked with @StrictRateLimit() are subject to this one.
        skipIf: (context: ExecutionContext) =>
          !Reflect.getMetadata(AUTH_RATE_LIMIT, context.getHandler()),
      },
    ],
  };
}
