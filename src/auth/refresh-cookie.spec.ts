import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie.js';
import { hashRefreshToken } from './refresh-token.service.js';

const base = { production: false, sameSite: 'strict', maxAgeMs: 1000 } as const;

function fakeResponse() {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

describe('setRefreshCookie', () => {
  it('is httpOnly, scoped to the auth endpoints and sets the lifetime', () => {
    const response = fakeResponse();
    setRefreshCookie(response, 'tok', base);
    expect(response.cookie).toHaveBeenCalledWith(REFRESH_COOKIE, 'tok', {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: 1000,
    });
  });

  it('is Secure in production', () => {
    const response = fakeResponse();
    setRefreshCookie(response, 'tok', { ...base, production: true });
    expect(response.cookie.mock.calls[0]?.[2]).toMatchObject({ secure: true });
  });

  it('is Secure whenever SameSite=None, because browsers require it', () => {
    const response = fakeResponse();
    setRefreshCookie(response, 'tok', { ...base, sameSite: 'none' });
    expect(response.cookie.mock.calls[0]?.[2]).toMatchObject({
      secure: true,
      sameSite: 'none',
    });
  });
});

describe('clearRefreshCookie', () => {
  it('clears with the same path and flags, without a max age', () => {
    const response = fakeResponse();
    clearRefreshCookie(response, base);
    expect(response.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    });
  });
});

describe('readRefreshCookie', () => {
  const read = (cookie?: string) =>
    readRefreshCookie({ headers: { cookie } } as unknown as Request);

  it('finds the cookie among others', () => {
    expect(read('a=1; refresh_token=abc_-123; b=2')).toBe('abc_-123');
    expect(read('refresh_token=only')).toBe('only');
  });

  it('returns undefined when absent, empty or malformed', () => {
    expect(read(undefined)).toBeUndefined();
    expect(read('')).toBeUndefined();
    expect(read('other=1')).toBeUndefined();
    expect(read('refresh_token=')).toBeUndefined();
    expect(read('novalue; refresh_tokenx=1')).toBeUndefined();
    expect(read('refresh_token=%%%')).toBeUndefined(); // bad percent-encoding
  });
});

describe('hashRefreshToken', () => {
  it('is a 64 character hex SHA-256 and deterministic', () => {
    const hash = hashRefreshToken('abc');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashRefreshToken('abc'));
    expect(hash).not.toBe(hashRefreshToken('abd'));
    expect(hash).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
