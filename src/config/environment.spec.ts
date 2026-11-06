import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment.js';

const validConfig = {
  DATABASE_URL: 'postgres://family:secret@localhost:5432/family_pot',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
};

function errorFor(config: Record<string, unknown>): string {
  try {
    validateEnvironment(config);
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

describe('validateEnvironment', () => {
  it('parses a valid configuration and applies defaults', () => {
    const env = validateEnvironment(validConfig);

    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_URL).toBe(validConfig.DATABASE_URL);
    expect(env.DATABASE_SSL).toBe(false);
    expect(env.DATABASE_URL_TEST).toBeUndefined();
    expect(env.CORS_ORIGIN).toEqual([]);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
    expect(env.ALLOW_REMOTE_DB_RESET).toBe(false);
    expect(env.REFRESH_COOKIE_SAME_SITE).toBe('strict');
  });

  it('parses explicit values into typed values', () => {
    const env = validateEnvironment({
      ...validConfig,
      PORT: '4321',
      NODE_ENV: 'test',
      DATABASE_URL_TEST:
        'postgresql://family:secret@localhost:5432/family_pot_test',
      DATABASE_SSL: 'true',
      CORS_ORIGIN: 'http://localhost:3000, https://family-pot.example ',
      JWT_ACCESS_TTL: '1h',
      REFRESH_TOKEN_TTL_DAYS: '30',
      ALLOW_REMOTE_DB_RESET: 'true',
    });

    expect(env.PORT).toBe(4321);
    expect(env.NODE_ENV).toBe('test');
    expect(env.DATABASE_SSL).toBe(true);
    expect(env.CORS_ORIGIN).toEqual([
      'http://localhost:3000',
      'https://family-pot.example',
    ]);
    expect(env.JWT_ACCESS_TTL).toBe('1h');
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.ALLOW_REMOTE_DB_RESET).toBe(true);
  });

  it('reports a missing DATABASE_URL', () => {
    expect(errorFor({ JWT_ACCESS_SECRET: 'a'.repeat(32) })).toContain(
      'DATABASE_URL is required.',
    );
  });

  it('reports a missing JWT_ACCESS_SECRET', () => {
    expect(errorFor({ DATABASE_URL: validConfig.DATABASE_URL })).toContain(
      'JWT_ACCESS_SECRET is required.',
    );
  });

  it('rejects a non-postgres DATABASE_URL without printing the password', () => {
    const message = errorFor({
      DATABASE_URL: 'mysql://family:super-secret@localhost/family_pot',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
    });

    expect(message).toContain(
      'DATABASE_URL must start with postgres:// or postgresql://.',
    );
    expect(message).not.toContain('super-secret');
  });

  it('rejects a secret key shorter than 32 characters', () => {
    expect(errorFor({ ...validConfig, JWT_ACCESS_SECRET: 'short' })).toContain(
      'JWT_ACCESS_SECRET must be at least 32 characters long.',
    );
  });

  it('rejects a non-numeric and an out-of-range PORT', () => {
    expect(errorFor({ ...validConfig, PORT: 'not-a-number' })).toContain(
      'PORT must be an integer between 1 and 65535.',
    );
    expect(errorFor({ ...validConfig, PORT: '70000' })).toContain(
      'PORT must be an integer between 1 and 65535.',
    );
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(errorFor({ ...validConfig, NODE_ENV: 'staging' })).toContain(
      'NODE_ENV must be one of development, test, production.',
    );
  });

  it('rejects invalid booleans, durations and refresh days', () => {
    expect(
      errorFor({
        ...validConfig,
        DATABASE_SSL: 'yes',
        ALLOW_REMOTE_DB_RESET: '1',
      }),
    ).toContain('DATABASE_SSL must be "true" or "false".');
    expect(
      errorFor({ ...validConfig, JWT_ACCESS_TTL: '15 minutes' }),
    ).toContain('JWT_ACCESS_TTL must be a positive duration');
    expect(
      errorFor({ ...validConfig, REFRESH_TOKEN_TTL_DAYS: '-2' }),
    ).toContain('REFRESH_TOKEN_TTL_DAYS must be an integer between 1 and 365.');
  });

  it('rejects wildcard and invalid CORS origins', () => {
    expect(errorFor({ ...validConfig, CORS_ORIGIN: '*' })).toContain(
      'CORS_ORIGIN must not contain a wildcard origin.',
    );
    expect(
      errorFor({ ...validConfig, CORS_ORIGIN: 'http://localhost:3000, nope' }),
    ).toContain('CORS_ORIGIN must be a comma-separated list of valid origins.');
  });

  it('reports several problems together', () => {
    const message = errorFor({
      PORT: 'not-a-number',
      JWT_ACCESS_SECRET: 'short',
    });

    expect(message).toContain('PORT');
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('JWT_ACCESS_SECRET');
  });

  it('validates REFRESH_COOKIE_SAME_SITE', () => {
    expect(
      validateEnvironment({ ...validConfig, REFRESH_COOKIE_SAME_SITE: 'lax' })
        .REFRESH_COOKIE_SAME_SITE,
    ).toBe('lax');
    expect(
      errorFor({ ...validConfig, REFRESH_COOKIE_SAME_SITE: 'sometimes' }),
    ).toContain('REFRESH_COOKIE_SAME_SITE must be strict, lax or none.');
  });

  it('applies defaults and validates the hardening settings', () => {
    const env = validateEnvironment(validConfig);
    expect(env).toMatchObject({
      RATE_LIMIT_GLOBAL_LIMIT: 100,
      RATE_LIMIT_GLOBAL_TTL_SECONDS: 60,
      RATE_LIMIT_AUTH_LIMIT: 10,
      RATE_LIMIT_AUTH_TTL_SECONDS: 60,
      REQUEST_BODY_LIMIT: '100kb',
      TRUST_PROXY: 0,
    });

    expect(
      validateEnvironment({
        ...validConfig,
        RATE_LIMIT_AUTH_LIMIT: '3',
        REQUEST_BODY_LIMIT: '2mb',
        TRUST_PROXY: '1',
      }),
    ).toMatchObject({
      RATE_LIMIT_AUTH_LIMIT: 3,
      REQUEST_BODY_LIMIT: '2mb',
      TRUST_PROXY: 1,
    });

    const message = errorFor({
      ...validConfig,
      RATE_LIMIT_GLOBAL_LIMIT: '0',
      RATE_LIMIT_AUTH_TTL_SECONDS: 'abc',
      REQUEST_BODY_LIMIT: 'huge',
      TRUST_PROXY: '99',
    });
    expect(message).toContain('RATE_LIMIT_GLOBAL_LIMIT');
    expect(message).toContain('RATE_LIMIT_AUTH_TTL_SECONDS');
    expect(message).toContain(
      'REQUEST_BODY_LIMIT must look like 100kb or 1mb.',
    );
    expect(message).toContain('TRUST_PROXY');
  });
});
