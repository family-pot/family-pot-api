import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

const PASSWORD = 'a-long-enough-password';
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('Refresh tokens and logout (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const createdEmails: string[] = [];
  let email: string;
  let userId: string;

  const http = () => request(app.getHttpServer());

  /** The raw refresh token in a response's Set-Cookie header. */
  const cookieOf = (res: request.Response): string | undefined => {
    const header = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const entry = header.find((c) => c.startsWith('refresh_token='));
    const value = entry?.split(';')[0]?.slice('refresh_token='.length);
    return value || undefined;
  };
  const rawSetCookie = (res: request.Response) =>
    ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('refresh_token='))!;

  const login = async () => {
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { res, token: cookieOf(res)! };
  };
  const refresh = (token?: string) => {
    const req = http().post('/api/v1/auth/refresh');
    return token ? req.set('Cookie', `refresh_token=${token}`) : req;
  };
  const logout = (token?: string) => {
    const req = http().post('/api/v1/auth/logout');
    return token ? req.set('Cookie', `refresh_token=${token}`) : req;
  };
  const rowFor = async (token: string) =>
    (
      await dataSource.query(
        'SELECT * FROM refresh_tokens WHERE "tokenHash" = $1',
        [sha256(token)],
      )
    )[0];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);

    email = `refresh-${Date.now().toString(36)}@example.com`;
    createdEmails.push(email);
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);
    userId = res.body.id;
  });

  afterAll(async () => {
    // refresh_tokens rows are removed by ON DELETE CASCADE.
    await dataSource.query('DELETE FROM users WHERE email = ANY($1)', [
      createdEmails,
    ]);
    await app.close();
  });

  describe('login', () => {
    it('sets an httpOnly refresh cookie scoped to the auth endpoints and keeps it out of the body', async () => {
      const { res, token } = await login();
      const cookie = rawSetCookie(res);

      expect(token).toBeTruthy();
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/v1/auth');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Max-Age=604800'); // REFRESH_TOKEN_TTL_DAYS=7
      expect(cookie).not.toContain('Secure'); // NODE_ENV=test; Secure only in production
      expect(JSON.stringify(res.body)).not.toContain(token);
      expect(Object.keys(res.body).sort()).toEqual([
        'accessToken',
        'expiresIn',
        'tokenType',
      ]);
    });

    it('stores only a SHA-256 hash of the token, never the raw value', async () => {
      const { token } = await login();
      const row = await rowFor(token);

      expect(row).toBeDefined();
      expect(row.tokenHash).toBe(sha256(token));
      expect(row.userId).toBe(userId);
      expect(JSON.stringify(row)).not.toContain(token);
      expect(row.revokedAt).toBeNull();
      expect(row.replacedById).toBeNull();
      const lifetimeMs = new Date(row.expiresAt).getTime() - Date.now();
      expect(lifetimeMs).toBeGreaterThan(6.9 * 24 * 3600 * 1000);
      expect(lifetimeMs).toBeLessThanOrEqual(7 * 24 * 3600 * 1000);
    });

    it('never writes refresh tokens to the logs', async () => {
      const chunks: string[] = [];
      const collect = (chunk: unknown) => (chunks.push(String(chunk)), true);
      const stdout = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation(collect);
      const stderr = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(collect);
      let tokens: string[] = [];
      try {
        const { token } = await login();
        const rotated = cookieOf(await refresh(token).expect(200))!;
        await refresh(token).expect(401); // reuse path logs nothing sensitive either
        tokens = [token, rotated];
      } finally {
        stdout.mockRestore();
        stderr.mockRestore();
      }
      for (const token of tokens) expect(chunks.join('')).not.toContain(token);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the token: the old one is replaced and a new access token works', async () => {
      const { token: first } = await login();
      const res = await refresh(first).expect(200);
      const second = cookieOf(res)!;

      expect(second).toBeTruthy();
      expect(second).not.toBe(first);
      expect(Object.keys(res.body).sort()).toEqual([
        'accessToken',
        'expiresIn',
        'tokenType',
      ]);
      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);

      const oldRow = await rowFor(first);
      const newRow = await rowFor(second);
      expect(oldRow.revokedAt).not.toBeNull();
      expect(oldRow.replacedById).toBe(newRow.id);
      expect(newRow.familyId).toBe(oldRow.familyId);
      expect(newRow.revokedAt).toBeNull();

      // The new token keeps working, and so on down the chain.
      await refresh(second).expect(200);
    });

    it('rejects a missing, unknown or malformed token with one generic 401', async () => {
      const missing = await refresh().expect(401);
      const unknown = await refresh('not-a-real-token').expect(401);
      const garbage = await refresh('%%%').expect(401);
      expect(unknown.body).toEqual(missing.body);
      expect(garbage.body).toEqual(missing.body);
      expect(missing.body.message).toBe('Invalid or expired refresh token.');
    });

    it('rejects an expired token', async () => {
      const { token } = await login();
      await dataSource.query(
        `UPDATE refresh_tokens SET "expiresAt" = now() - interval '1 minute' WHERE "tokenHash" = $1`,
        [sha256(token)],
      );
      await refresh(token).expect(401);
    });

    it('clears the cookie when the refresh fails', async () => {
      const res = await refresh('not-a-real-token').expect(401);
      const cookie = rawSetCookie(res);
      expect(cookie).toMatch(/^refresh_token=;/);
      expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    });
  });

  describe('reuse detection', () => {
    it('revokes the whole family when a rotated token is presented again', async () => {
      const { token: first } = await login();
      const second = cookieOf(await refresh(first).expect(200))!;
      const third = cookieOf(await refresh(second).expect(200))!;

      // An attacker (or a stale client) replays the first token.
      await refresh(first).expect(401);

      // Everyone in the family is logged out, including the legitimate newest token.
      await refresh(third).expect(401);
      await refresh(second).expect(401);
      const rows = await dataSource.query(
        'SELECT "revokedAt" FROM refresh_tokens WHERE "familyId" = $1',
        [(await rowFor(first)).familyId],
      );
      expect(rows).toHaveLength(3);
      expect(
        rows.every((row: { revokedAt: Date | null }) => row.revokedAt !== null),
      ).toBe(true);
    });

    it('leaves other sessions of the same user untouched', async () => {
      const { token: sessionA } = await login();
      const { token: sessionB } = await login();
      expect((await rowFor(sessionA)).familyId).not.toBe(
        (await rowFor(sessionB)).familyId,
      );

      const a2 = cookieOf(await refresh(sessionA).expect(200))!;
      await refresh(sessionA).expect(401); // reuse in session A
      await refresh(a2).expect(401);

      await refresh(sessionB).expect(200); // session B is unaffected
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the session, clears the cookie, and refresh then fails', async () => {
      const { token } = await login();
      const rotated = cookieOf(await refresh(token).expect(200))!;

      const res = await logout(rotated).expect(204);
      expect(rawSetCookie(res)).toMatch(/^refresh_token=;/);

      await refresh(rotated).expect(401);
      const row = await rowFor(rotated);
      expect(row.revokedAt).not.toBeNull();
      expect(row.replacedById).toBeNull(); // revoked by logout, not rotated
    });

    it('is 204 without a cookie or with a junk token, and reveals nothing', async () => {
      await logout().expect(204);
      await logout('not-a-real-token').expect(204);
    });

    it('only ends the session it was called for', async () => {
      const { token: a } = await login();
      const { token: b } = await login();
      await logout(a).expect(204);
      await refresh(a).expect(401);
      await refresh(b).expect(200);
    });
  });

  describe('concurrent refresh with the same token', () => {
    // Documented behaviour (README): the strict choice. Requests are serialized
    // on the token row. The first rotates it; the second then presents an
    // already-rotated token, which is reuse, so the whole family is revoked.
    it('lets exactly one succeed and then revokes the family', async () => {
      const { token } = await login();
      const results = await Promise.all([refresh(token), refresh(token)]);

      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 401,
      ]);

      const winner = results.find((r) => r.status === 200)!;
      const winnerToken = cookieOf(winner)!;
      await refresh(winnerToken).expect(401); // family revoked
    });
  });

  it('documents refresh and logout in Swagger', async () => {
    const res = await http().get('/api/docs-json').expect(200);
    expect(
      res.body.paths['/api/v1/auth/refresh'].post.responses['401'],
    ).toBeDefined();
    expect(
      res.body.paths['/api/v1/auth/logout'].post.responses['204'],
    ).toBeDefined();
  });
});
