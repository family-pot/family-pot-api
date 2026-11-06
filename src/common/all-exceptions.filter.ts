import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppConfigService } from '../config/app-config.service.js';

/** A 4xx error from middleware that marks itself as safe to expose (http-errors). */
function asClientError(
  exception: unknown,
): { status: number; message: string } | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { status, expose, message } = exception as {
    status?: unknown;
    expose?: unknown;
    message?: unknown;
  };
  return typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    expose === true &&
    typeof message === 'string'
    ? { status, message }
    : undefined;
}

/**
 * The one place that decides what an error looks like on the wire.
 *
 * - `HttpException`s (validation errors, 401, 404, 429, ...) keep the status and
 *   message their code chose.
 * - Anything else is an unexpected failure: the client gets a generic 500, the
 *   details go to the server log. In production the response never contains
 *   internals; outside production it also carries the error's message and
 *   stack to ease debugging.
 */
@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly config: AppConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      response
        .status(exception.getStatus())
        .json(
          typeof body === 'string'
            ? { statusCode: exception.getStatus(), message: body }
            : body,
        );
      return;
    }

    // Errors raised by Express middleware (for example body-parser's 413 for a
    // body over the limit, or 400 for malformed JSON) are not HttpExceptions but
    // carry a 4xx `status` and are safe to show.
    const clientError = asClientError(exception);
    if (clientError) {
      response
        .status(clientError.status)
        .json({ statusCode: clientError.status, message: clientError.message });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.message : String(exception),
      exception instanceof Error ? exception.stack : undefined,
    );

    const body: Record<string, unknown> = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
    if (this.config.nodeEnv !== 'production' && exception instanceof Error) {
      body.detail = exception.message;
      body.stack = exception.stack;
    }
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}
