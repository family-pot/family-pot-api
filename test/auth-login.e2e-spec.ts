import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { Auth, CurrentUser } from './../src/auth/auth.decorators.js';
import { AuthModule } from './../src/auth/auth.module.js';
import type { AuthUser } from './../src/auth/auth.types.js';
import { PasswordService } from './../src/users/password.service.js';

// A controller in another module protected with a single decorator.
@Auth()
@Controller({ path: 'test-protected', version: '1' })
class TestProtectedController {
  @Get()
  whoAmI(@CurrentUser() user: AuthUser) {
    return { email: user.email };
  }
}

@Module({ imports: [AuthModule], controllers: [TestProtectedController] })
class TestProtectedModule {}

const PASSWORD = 'a-long-enough-password';

describe('Login and AuthGuard (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwt: JwtService;
  let passwords: PasswordService;
  const createdEmails: string[] = [];
  let email: string;
  let userId: string;

  const login = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/auth/login').send(body);
  const me = (authorization?: string) => {
    const req = request(app.getHttpServer()).get('/api/v1/auth/me');
    return authorization ? req.set('Authorization', authorization) : req;
  };
  const tokenFor = async (sub: string, options: Record<string, unknown> = {}) =>
    jwt.signAsync({ sub }, options);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TestProtectedModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
    jwt = app.get(JwtService);
    passwords = app.get(PasswordService);

    email = `login-${Date.now().toString(36)}@example.com`;
    createdEmails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);
    userId = res.body.id;
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM users WHERE email = ANY($1)', [
      createdEmails,
    ]);
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('returns a bearer access token for valid credentials', async () => {
      const res = await login({ email, password: PASSWORD }).expect(200);
      expect(res.body.tokenType).toBe('Bearer');
      expect(res.body.expiresIn).toBe(900); // JWT_ACCESS_TTL default 15m
      const claims = await jwt.verifyAsync(res.body.accessToken, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      expect(claims.sub).toBe(userId);
      expect(claims.exp - claims.iat).toBe(900);
      expect(JSON.stringify(claims)).not.toMatch(/password|email/);
    });

    it('is case-insensitive for the email', async () => {
      await login({ email: email.toUpperCase(), password: PASSWORD }).expect(
        200,
      );
    });

    it('gives the identical response for a wrong password and an unknown email', async () => {
      const wrongPassword = await login({
        email,
        password: 'not-the-password',
      }).expect(401);
      const unknownEmail = await login({
        email: `nobody-${Date.now()}@example.com`,
        password: PASSWORD,
      }).expect(401);

      expect(unknownEmail.status).toBe(wrongPassword.status);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
      expect(wrongPassword.body.message).toBe('Invalid email or password.');
    });

    it('runs a password verification even when the email is unknown (equal effort)', async () => {
      const verify = vi.spyOn(passwords, 'verify');
      try {
        await login({
          email: `ghost-${Date.now()}@example.com`,
          password: 'whatever-password',
        }).expect(401);
        expect(verify).toHaveBeenCalledTimes(1);
        // It verified against a real argon2id hash (the dummy), not a shortcut.
        expect(verify.mock.calls[0]?.[0]).toMatch(/^\$argon2id\$/);
        verify.mockClear();
        await login({ email, password: 'wrong-password-here' }).expect(401);
        expect(verify).toHaveBeenCalledTimes(1);
      } finally {
        verify.mockRestore();
      }
    });

    it('rejects malformed bodies and unknown fields with 400', async () => {
      await login({ email: 'not-an-email', password: PASSWORD }).expect(400);
      await login({ email }).expect(400);
      await login({ email, password: 123 }).expect(400);
      await login({ email, password: PASSWORD, remember: true }).expect(400);
    });
  });

  describe('AuthGuard', () => {
    it('returns the current user for a valid token', async () => {
      const { body } = await login({ email, password: PASSWORD }).expect(200);
      const res = await me(`Bearer ${body.accessToken}`).expect(200);
      expect(res.body).toEqual({ id: userId, email });
    });

    it('rejects a missing header', async () => {
      await me().expect(401);
    });

    it('rejects malformed headers', async () => {
      const { body } = await login({ email, password: PASSWORD }).expect(200);
      await me(`Basic ${body.accessToken}`).expect(401);
      await me(body.accessToken).expect(401);
      await me('Bearer').expect(401);
      await me('Bearer not.a.jwt').expect(401);
    });

    it('rejects an expired token', async () => {
      const expired = await tokenFor(userId, { expiresIn: '-10s' });
      await me(`Bearer ${expired}`).expect(401);
    });

    it('rejects a tampered token', async () => {
      const { body } = await login({ email, password: PASSWORD }).expect(200);
      const [header, payload, signature] = body.accessToken.split('.');
      const forgedPayload = Buffer.from(
        JSON.stringify({
          sub: '00000000-0000-0000-0000-000000000000',
          iat: 1,
          exp: 9999999999,
        }),
      ).toString('base64url');
      await me(`Bearer ${header}.${forgedPayload}.${signature}`).expect(401);
      await me(
        `Bearer ${header}.${payload}.${signature.slice(0, -2)}xx`,
      ).expect(401);
    });

    it('rejects a token signed with another secret and an unsigned (alg none) token', async () => {
      const wrongSecret = await jwt.signAsync(
        { sub: userId },
        { secret: 'x'.repeat(40) },
      );
      await me(`Bearer ${wrongSecret}`).expect(401);

      const none =
        Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
          'base64url',
        ) +
        '.' +
        Buffer.from(JSON.stringify({ sub: userId })).toString('base64url') +
        '.';
      await me(`Bearer ${none}`).expect(401);
    });

    it('rejects a valid token for a user that no longer exists', async () => {
      const ghost = await tokenFor('00000000-0000-0000-0000-000000000000');
      await me(`Bearer ${ghost}`).expect(401);
      await me(`Bearer ${await tokenFor('not-a-uuid')}`).expect(401);
    });

    it('protects any controller with the single @Auth() decorator', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/test-protected')
        .expect(401);
      const { body } = await login({ email, password: PASSWORD }).expect(200);
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-protected')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
      expect(res.body).toEqual({ email });
    });
  });

  it('documents login, /me and bearer auth in Swagger', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(
      res.body.paths['/api/v1/auth/login'].post.responses['200'],
    ).toBeDefined();
    expect(res.body.paths['/api/v1/auth/me'].get.security).toEqual([
      { bearer: [] },
    ]);
    expect(res.body.components.securitySchemes.bearer.type).toBe('http');
  });
});
