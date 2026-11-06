import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import type { AuthUser } from './auth.types.js';

/**
 * Protects a controller or a route. One decorator: it applies the guard and
 * documents bearer auth and the 401 in Swagger.
 *
 *   @Auth()
 *   @Controller({ path: 'recipients', version: '1' })
 *   export class RecipientsController { ... }
 *
 * The module that declares the controller must import `AuthModule`.
 */
export function Auth(): ClassDecorator & MethodDecorator {
  return applyDecorators(
    UseGuards(AuthGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      description: 'Missing, invalid or expired access token.',
    }),
  );
}

/** The authenticated user. Only valid on routes protected by `@Auth()`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    return context.switchToHttp().getRequest<AuthenticatedRequest>().user!;
  },
);
