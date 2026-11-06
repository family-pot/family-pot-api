import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { AppConfigService } from '../config/app-config.service.js';
import { UsersService } from '../users/users.service.js';
import type { AccessTokenPayload, AuthUser } from './auth.types.js';

export type AuthenticatedRequest = Request & { user?: AuthUser };

function bearerToken(request: Request): string | undefined {
  const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
  return scheme === 'Bearer' && token ? token : undefined;
}

/**
 * Requires a valid access token. Missing, malformed, expired, tampered and
 * wrongly signed tokens, and tokens of users that no longer exist, all give the
 * same 401. Apply it with the `@Auth()` decorator.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request);
    if (!token) {
      throw new UnauthorizedException();
    }

    let payload: AccessTokenPayload;
    try {
      // The secret comes only from config, and the algorithm is pinned so a
      // token cannot pick its own (for example "none").
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.jwtAccessSecret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException();
    }

    // Check the claim before querying: a non-UUID would make Postgres throw,
    // which must not become a 500.
    const user =
      typeof payload.sub === 'string' && isUUID(payload.sub)
        ? await this.users.findById(payload.sub)
        : null;
    if (!user) {
      throw new UnauthorizedException();
    }
    request.user = { id: user.id, email: user.email };
    return true;
  }
}
