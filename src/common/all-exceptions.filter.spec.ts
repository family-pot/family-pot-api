import {
  BadRequestException,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../config/app-config.service.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function run(exception: unknown, nodeEnv: 'production' | 'development') {
  const filter = new AllExceptionsFilter({ nodeEnv } as AppConfigService);
  const json = vi.fn();
  const status = vi.fn((_code: number) => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  };
  filter.catch(exception, host as never);
  return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
}

describe('AllExceptionsFilter', () => {
  let logError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps the status and body of HttpExceptions', () => {
    const { status, body } = run(
      new BadRequestException(['name must not be empty']),
      'production',
    );
    expect(status).toBe(400);
    expect(body.message).toEqual(['name must not be empty']);
    expect(run(new NotFoundException('gone'), 'production').status).toBe(404);
  });

  it('wraps a string response into a body', () => {
    const { status, body } = run(
      new HttpException('Teapot', 418),
      'production',
    );
    expect(status).toBe(418);
    expect(body).toEqual({ statusCode: 418, message: 'Teapot' });
  });

  it('keeps exposed 4xx errors from middleware, such as 413 and malformed JSON', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
    });
    expect(run(tooLarge, 'production')).toEqual({
      status: 413,
      body: { statusCode: 413, message: 'request entity too large' },
    });
    const badJson = Object.assign(new SyntaxError('Unexpected token'), {
      status: 400,
      expose: true,
    });
    expect(run(badJson, 'production').status).toBe(400);
  });

  it('does not trust errors that are not marked as safe to expose, or are 5xx', () => {
    const hidden = Object.assign(new Error('secret'), {
      status: 400,
      expose: false,
    });
    expect(run(hidden, 'production').body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
    const serverError = Object.assign(new Error('secret'), {
      status: 503,
      expose: true,
    });
    expect(run(serverError, 'production').status).toBe(500);
    expect(run(null, 'production').status).toBe(500);
  });

  it('hides internals of unexpected errors in production', () => {
    const { status, body } = run(
      new Error('db password is hunter2'),
      'production',
    );
    expect(status).toBe(500);
    expect(body).toEqual({ statusCode: 500, message: 'Internal server error' });
    expect(JSON.stringify(body)).not.toMatch(/hunter2|stack|at /);
  });

  it('adds detail and stack outside production, and handles non-Error throws', () => {
    const dev = run(new Error('boom'), 'development');
    expect(dev.body.detail).toBe('boom');
    expect(typeof dev.body.stack).toBe('string');
    const thrown = run('just a string', 'production');
    expect(thrown.status).toBe(500);
    expect(thrown.body.message).toBe('Internal server error');
    expect(run('just a string', 'development').body.detail).toBeUndefined();
  });

  it('logs the real error server-side', () => {
    run(new Error('boom'), 'production');
    expect(logError).toHaveBeenCalledWith('boom', expect.any(String));
  });
});
