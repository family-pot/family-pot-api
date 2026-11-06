import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { RefreshToken } from './../src/auth/refresh-token.entity.js';
import { buildCliDataSource } from './../src/database/data-source.js';
import { Recipient } from './../src/recipients/recipient.entity.js';
import { Transfer } from './../src/transfers/transfer.entity.js';
import { User } from './../src/users/user.entity.js';
import { DestructiveActionBlockedError } from './../src/database/destructive-guard.js';
import { seedDatabase } from './../src/database/seed.js';
import { runSeed } from './../src/database/seed-cli.js';
import {
  DEMO_RECIPIENTS,
  DEMO_TRANSFERS,
  DEMO_USER,
} from './../src/database/seed-data.js';
import { createUser, deleteUsers } from './recipients-helpers.js';

// Requires Postgres at DATABASE_URL_TEST with migrations applied.
describe('pnpm seed (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const emails: string[] = [];
  const http = () => request(app.getHttpServer());

  const counts = async () => {
    const [row] = await dataSource.query(
      `SELECT
         (SELECT count(*) FROM users WHERE email = $1)::int AS users,
         (SELECT count(*) FROM recipients r JOIN users u ON u.id = r."userId" WHERE u.email = $1)::int AS recipients,
         (SELECT count(*) FROM transfers t JOIN users u ON u.id = t."userId" WHERE u.email = $1)::int AS transfers`,
      [DEMO_USER.email],
    );
    return row as { users: number; recipients: number; transfers: number };
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
    await deleteUsers(dataSource, [DEMO_USER.email]); // start from a clean slate
  });

  afterAll(async () => {
    await deleteUsers(dataSource, [DEMO_USER.email, ...emails]);
    await app.close();
  });

  it('creates the demo user, recipients and transfers', async () => {
    const result = await seedDatabase(dataSource);
    expect(result).toEqual({
      user: 'created',
      passwordReset: false,
      recipientsCreated: DEMO_RECIPIENTS.length,
      transfersCreated: DEMO_TRANSFERS.length,
    });
    expect(await counts()).toEqual({
      users: 1,
      recipients: DEMO_RECIPIENTS.length,
      transfers: DEMO_TRANSFERS.length,
    });
  });

  it('is idempotent: running it again changes nothing', async () => {
    const before = await counts();
    const second = await seedDatabase(dataSource);
    const third = await seedDatabase(dataSource);

    for (const result of [second, third]) {
      expect(result).toEqual({
        user: 'existing',
        passwordReset: false,
        recipientsCreated: 0,
        transfersCreated: 0,
      });
    }
    expect(await counts()).toEqual(before);
    // The same rows, not recreated ones.
    const ids = await dataSource.query(
      'SELECT count(DISTINCT t.id)::int AS n FROM transfers t JOIN users u ON u.id = t."userId" WHERE u.email = $1',
      [DEMO_USER.email],
    );
    expect(ids[0].n).toBe(DEMO_TRANSFERS.length);
  });

  it('completes missing records without duplicating existing ones', async () => {
    await dataSource.query(
      `DELETE FROM transfers WHERE id IN (SELECT t.id FROM transfers t JOIN users u ON u.id = t."userId" WHERE u.email = $1 ORDER BY t."transferDate" LIMIT 3)`,
      [DEMO_USER.email],
    );
    const result = await seedDatabase(dataSource);
    expect(result.transfersCreated).toBe(3);
    expect((await counts()).transfers).toBe(DEMO_TRANSFERS.length);
  });

  it('lets the demo user log in and see the seeded data through the API', async () => {
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: DEMO_USER.email, password: DEMO_USER.password })
      .expect(200);
    const auth = `Bearer ${login.body.accessToken}`;

    const recipients = await http()
      .get('/api/v1/recipients')
      .set('Authorization', auth)
      .expect(200);
    expect(recipients.body.map((r: { name: string }) => r.name).sort()).toEqual(
      DEMO_RECIPIENTS.map((r) => r.name).sort(),
    );

    const page = await http()
      .get('/api/v1/transfers')
      .query({ limit: 100 })
      .set('Authorization', auth)
      .expect(200);
    expect(page.body.data).toHaveLength(DEMO_TRANSFERS.length);

    // Amounts came through the money module and round-trip exactly.
    const first = DEMO_TRANSFERS[0]!;
    const match = page.body.data.find(
      (t: {
        transferDate: string;
        provider: string;
        sent: { amount: string };
      }) =>
        t.transferDate === first.transferDate && t.provider === first.provider,
    );
    expect(match.sent).toEqual({
      ...first.sent.toWire(),
      provenance: 'user-entered',
    });
    expect(match.fee.amount).toBe(first.fee.toWire().amount);
    expect(match.exchangeRate.value).toBe(first.exchangeRate);
  });

  it('restores the documented demo password if it was changed', async () => {
    await dataSource.query(
      `UPDATE users SET "passwordHash" = 'not-a-valid-hash' WHERE email = $1`,
      [DEMO_USER.email],
    );
    await http()
      .post('/api/v1/auth/login')
      .send({ email: DEMO_USER.email, password: DEMO_USER.password })
      .expect(401);

    const result = await seedDatabase(dataSource);
    expect(result.passwordReset).toBe(true);
    await http()
      .post('/api/v1/auth/login')
      .send({ email: DEMO_USER.email, password: DEMO_USER.password })
      .expect(200);
  });

  it("never touches other users' data", async () => {
    const other = await createUser(app, 'bystander');
    emails.push(other.email);
    await http()
      .post('/api/v1/recipients')
      .set('Authorization', other.auth)
      .send({ name: 'Mine', country: 'NG' })
      .expect(201);

    await seedDatabase(dataSource);
    const list = await http()
      .get('/api/v1/recipients')
      .set('Authorization', other.auth)
      .expect(200);
    expect(list.body.map((r: { name: string }) => r.name)).toEqual(['Mine']);
  });

  describe('the seed command and its guard', () => {
    it('runs against a local database', async () => {
      // The real command loads compiled entities from dist/; here we pass the classes.
      const result = await runSeed(
        { DATABASE_URL: process.env.DATABASE_URL },
        (url) =>
          buildCliDataSource(url, {
            entities: [User, Recipient, Transfer, RefreshToken],
          }),
      );
      expect(result.user).toBe('existing');
      expect(result.transfersCreated).toBe(0);
    });

    it('refuses a non-local host without the override, naming the host but never the password', async () => {
      const url = 'postgres://user:hunter2@db.fake-remote.example:5432/prod';
      const error = await runSeed({ DATABASE_URL: url }).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(DestructiveActionBlockedError);
      expect((error as Error).message).toContain(
        'db.fake-remote.example:5432/prod',
      );
      expect((error as Error).message).toContain('ALLOW_REMOTE_DB_RESET=true');
      expect((error as Error).message).not.toContain('hunter2');
    });

    it('refuses when the override is anything but exactly "true"', async () => {
      const url = 'postgres://u:p@db.fake-remote.example/prod';
      for (const ALLOW_REMOTE_DB_RESET of ['false', '1', 'yes', 'TRUE', '']) {
        await expect(
          runSeed({ DATABASE_URL: url, ALLOW_REMOTE_DB_RESET }),
        ).rejects.toBeInstanceOf(DestructiveActionBlockedError);
      }
    });

    it('does not even try to connect when refused (the guard runs first)', async () => {
      // Port 1 on a remote-looking host: a connection attempt would hang or error differently.
      const started = Date.now();
      await expect(
        runSeed({ DATABASE_URL: 'postgres://u:p@203.0.113.7:1/x' }),
      ).rejects.toBeInstanceOf(DestructiveActionBlockedError);
      expect(Date.now() - started).toBeLessThan(500);
    });

    it('needs a DATABASE_URL', async () => {
      await expect(runSeed({})).rejects.toThrow('DATABASE_URL must be set');
    });
  });
});
