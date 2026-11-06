export type SameSiteMode = 'strict' | 'lax' | 'none';

export type NodeEnvironment = 'development' | 'test' | 'production';

/**
 * The shape returned by validateEnvironment. ConfigModule stores this under
 * ConfigService, so callers get parsed values rather than raw strings.
 */
export interface EnvironmentVariables {
  PORT: number;
  NODE_ENV: NodeEnvironment;
  DATABASE_URL: string;
  DATABASE_URL_TEST?: string;
  DATABASE_SSL: boolean;
  CORS_ORIGIN: string[];
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL: string;
  REFRESH_TOKEN_TTL_DAYS: number;
  REFRESH_COOKIE_SAME_SITE: SameSiteMode;
  ALLOW_REMOTE_DB_RESET: boolean;
}

const NODE_ENVIRONMENTS: readonly NodeEnvironment[] = [
  'development',
  'test',
  'production',
];

const DURATION_PATTERN = /^[1-9]\d*(s|m|h|d)$/;

function text(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = config[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function isPostgresUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'postgres:' || url.protocol === 'postgresql:';
  } catch {
    return false;
  }
}

function parseBoolean(
  config: Record<string, unknown>,
  key: string,
  fallback: boolean,
  problems: string[],
): boolean {
  const raw = text(config, key);
  if (raw === undefined) {
    return fallback;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  problems.push(`${key} must be "true" or "false".`);
  return fallback;
}

function parseInteger(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
  problems: string[],
): number {
  const raw = text(config, key);
  if (raw === undefined) {
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    problems.push(`${key} must be an integer between ${min} and ${max}.`);
    return fallback;
  }
  const value = Number(raw);
  if (value < min || value > max) {
    problems.push(`${key} must be an integer between ${min} and ${max}.`);
    return fallback;
  }
  return value;
}

/**
 * Validate all environment variables in one place so startup fails before
 * listening if anything is wrong.
 *
 * Error messages name the offending variable but never include its value: a
 * DATABASE_URL contains credentials and must not end up in logs.
 */
export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const problems: string[] = [];

  const nodeEnvironment = (text(config, 'NODE_ENV') ??
    'development') as NodeEnvironment;
  if (!NODE_ENVIRONMENTS.includes(nodeEnvironment)) {
    problems.push(`NODE_ENV must be one of ${NODE_ENVIRONMENTS.join(', ')}.`);
  }

  const port = parseInteger(config, 'PORT', 4000, 1, 65535, problems);

  const databaseUrl = text(config, 'DATABASE_URL');
  if (databaseUrl === undefined) {
    problems.push('DATABASE_URL is required.');
  } else if (!isPostgresUrl(databaseUrl)) {
    problems.push('DATABASE_URL must start with postgres:// or postgresql://.');
  }

  const databaseUrlTest = text(config, 'DATABASE_URL_TEST');
  if (databaseUrlTest !== undefined && !isPostgresUrl(databaseUrlTest)) {
    problems.push(
      'DATABASE_URL_TEST must start with postgres:// or postgresql://.',
    );
  }

  const databaseSsl = parseBoolean(config, 'DATABASE_SSL', false, problems);
  const allowRemoteDbReset = parseBoolean(
    config,
    'ALLOW_REMOTE_DB_RESET',
    false,
    problems,
  );

  const corsOrigin = text(config, 'CORS_ORIGIN');
  const corsOrigins: string[] = [];
  if (corsOrigin !== undefined) {
    for (const entry of corsOrigin.split(',').map((item) => item.trim())) {
      if (entry === '') {
        continue;
      }
      if (entry === '*') {
        problems.push('CORS_ORIGIN must not contain a wildcard origin.');
        continue;
      }
      try {
        const url = new URL(entry);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          problems.push(
            'CORS_ORIGIN entries must use the http:// or https:// protocol.',
          );
          continue;
        }
        corsOrigins.push(url.origin);
      } catch {
        problems.push(
          'CORS_ORIGIN must be a comma-separated list of valid origins.',
        );
      }
    }
  }

  const jwtAccessSecret = text(config, 'JWT_ACCESS_SECRET');
  if (jwtAccessSecret === undefined) {
    problems.push('JWT_ACCESS_SECRET is required.');
  } else if (jwtAccessSecret.length < 32) {
    problems.push('JWT_ACCESS_SECRET must be at least 32 characters long.');
  }

  const jwtAccessTtl = text(config, 'JWT_ACCESS_TTL') ?? '15m';
  if (!DURATION_PATTERN.test(jwtAccessTtl)) {
    problems.push(
      'JWT_ACCESS_TTL must be a positive duration such as 30s, 15m, 1h or 7d.',
    );
  }

  const refreshTokenTtlDays = parseInteger(
    config,
    'REFRESH_TOKEN_TTL_DAYS',
    7,
    1,
    365,
    problems,
  );

  const sameSite = (text(config, 'REFRESH_COOKIE_SAME_SITE') ??
    'strict') as SameSiteMode;
  if (!['strict', 'lax', 'none'].includes(sameSite)) {
    problems.push('REFRESH_COOKIE_SAME_SITE must be strict, lax or none.');
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${problems
        .map((problem) => `  - ${problem}`)
        .join('\n')}`,
    );
  }

  return {
    PORT: port,
    NODE_ENV: nodeEnvironment,
    DATABASE_URL: databaseUrl!,
    DATABASE_URL_TEST: databaseUrlTest,
    DATABASE_SSL: databaseSsl,
    CORS_ORIGIN: corsOrigins,
    JWT_ACCESS_SECRET: jwtAccessSecret!,
    JWT_ACCESS_TTL: jwtAccessTtl,
    REFRESH_TOKEN_TTL_DAYS: refreshTokenTtlDays,
    REFRESH_COOKIE_SAME_SITE: sameSite,
    ALLOW_REMOTE_DB_RESET: allowRemoteDbReset,
  };
}
