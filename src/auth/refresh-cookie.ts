import type { CookieOptions, Request, Response } from 'express';
import type { SameSiteMode } from '../config/environment.js';

export const REFRESH_COOKIE = 'refresh_token';
/** Only sent to the auth endpoints, never to the rest of the API. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export interface RefreshCookieSettings {
  production: boolean;
  sameSite: SameSiteMode;
  maxAgeMs: number;
}

function options({
  production,
  sameSite,
  maxAgeMs,
}: RefreshCookieSettings): CookieOptions {
  return {
    httpOnly: true,
    // SameSite=None is rejected by browsers without Secure.
    secure: production || sameSite === 'none',
    sameSite,
    path: REFRESH_COOKIE_PATH,
    maxAge: maxAgeMs,
  };
}

export function setRefreshCookie(
  response: Response,
  token: string,
  settings: RefreshCookieSettings,
): void {
  response.cookie(REFRESH_COOKIE, token, options(settings));
}

export function clearRefreshCookie(
  response: Response,
  settings: RefreshCookieSettings,
): void {
  const { maxAge: _maxAge, ...withoutMaxAge } = options(settings);
  response.clearCookie(REFRESH_COOKIE, withoutMaxAge);
}

/** Reads the refresh token from the Cookie header (no cookie-parser needed). */
export function readRefreshCookie(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === REFRESH_COOKIE) {
      const value = part.slice(index + 1).trim();
      if (value === '') return undefined;
      try {
        return decodeURIComponent(value);
      } catch {
        // Malformed percent-encoding can never be a token we issued (they are
        // base64url). Treat it as "no token" so it becomes a 401, not a 500.
        return undefined;
      }
    }
  }
  return undefined;
}
