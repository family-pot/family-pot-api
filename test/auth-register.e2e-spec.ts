import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

// Requires Postgres at DATABASE_URL_TEST with migrations applied.
const PASSWORD = 'a-long-enough-password';

describe('POST /api/v1/auth/register (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const createdEmails: string[] = [];

  const uniqueEmail = (prefix = 'user') => {
    const email = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    createdEmails.push(email.toLowerCase());
    return email;
  };
  const register = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/auth/register').send(body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM users WHERE email = ANY($1)', [
      createdEmails,
    ]);
    await app.close();
  });

  it('registers a user and returns only id and email', async () => {
    const email = uniqueEmail();
    const res = await register({ email, password: PASSWORD }).expect(201);

    expect(Object.keys(res.body).sort()).toEqual(['email', 'id']);
    expect(res.body.email).toBe(email.toLowerCase());
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i);
  });

  it('stores an argon2id hash, not the password', async () => {
    const email = uniqueEmail();
    await register({ email, password: PASSWORD }).expect(201);

    const [row] = await dataSource.query(
      'SELECT "passwordHash" FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    expect(row.passwordHash).not.toContain(PASSWORD);
    expect(row.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await argon2.verify(row.passwordHash, PASSWORD)).toBe(true);
    expect(await argon2.verify(row.passwordHash, 'some-other-password')).toBe(
      false,
    );
  });

  it('stores the email lowercase and treats emails case-insensitively', async () => {
    const email = uniqueEmail('mixed');
    const mixed = email.replace('mixed', 'MiXeD');
    await register({ email: mixed, password: PASSWORD }).expect(201);

    const [row] = await dataSource.query(
      'SELECT email FROM users WHERE email = $1',
      [email],
    );
    expect(row.email).toBe(email.toLowerCase());

    await register({ email: email.toUpperCase(), password: PASSWORD }).expect(
      409,
    );
  });

  it('rejects a duplicate email with a generic error', async () => {
    const email = uniqueEmail();
    await register({ email, password: PASSWORD }).expect(201);
    const res = await register({
      email,
      password: 'a-different-password',
    }).expect(409);

    expect(res.body.message).toBe('Registration could not be completed.');
    // Does not confirm the account exists.
    expect(JSON.stringify(res.body)).not.toMatch(
      /exist|already|taken|registered/i,
    );
  });

  it('rejects weak passwords (too short, too long, not a string)', async () => {
    await register({ email: uniqueEmail(), password: 'short-pass' }).expect(
      400,
    ); // 10
    await register({ email: uniqueEmail(), password: 'a'.repeat(11) }).expect(
      400,
    );
    await register({ email: uniqueEmail(), password: 'a'.repeat(129) }).expect(
      400,
    );
    await register({ email: uniqueEmail(), password: 123456789012 }).expect(
      400,
    );
    await register({ email: uniqueEmail() }).expect(400);
    // The boundaries are accepted.
    await register({ email: uniqueEmail(), password: 'a'.repeat(12) }).expect(
      201,
    );
    await register({ email: uniqueEmail(), password: 'a'.repeat(128) }).expect(
      201,
    );
  });

  it('rejects invalid emails', async () => {
    for (const email of [
      '',
      'not-an-email',
      'a@',
      '@example.com',
      'a b@example.com',
      42,
    ]) {
      await register({ email, password: PASSWORD }).expect(400);
    }
    await register({ password: PASSWORD }).expect(400);
    await register({
      email: `${'a'.repeat(250)}@example.com`,
      password: PASSWORD,
    }).expect(400);
  });

  it('rejects unknown fields', async () => {
    await register({
      email: uniqueEmail(),
      password: PASSWORD,
      isAdmin: true,
    }).expect(400);
  });

  it('never writes the password to the logs', async () => {
    const secret = 'super-secret-password-value';
    const chunks: string[] = [];
    const collect = (chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    };
    const stdout = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(collect);
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(collect);
    try {
      const email = uniqueEmail();
      await register({ email, password: secret }).expect(201);
      await register({ email, password: secret }).expect(409); // error path
      await register({ email: 'nope', password: secret }).expect(400); // validation path
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
    expect(chunks.join('')).not.toContain(secret);
  });

  it('is documented in Swagger', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    const operation = res.body.paths['/api/v1/auth/register'].post;
    expect(operation.responses['201']).toBeDefined();
    expect(operation.responses['409']).toBeDefined();
  });
});
