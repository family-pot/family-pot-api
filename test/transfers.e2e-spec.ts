import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { createUser, deleteUsers } from './recipients-helpers.js';

const isoDay = (offsetDays = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

describe('Transfers (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const emails: string[] = [];
  let auth: string;
  let recipientId: string;

  const http = () => request(app.getHttpServer());
  const base = (overrides: Record<string, unknown> = {}) => ({
    recipientId,
    transferDate: isoDay(-1),
    sent: { amount: '15000', currency: 'GBP' },
    fee: { amount: '350', currency: 'GBP' },
    receivingCurrency: 'NGN',
    exchangeRate: '1950.5',
    provider: 'Wise',
    purpose: 'Family support',
    status: 'completed',
    notes: 'Rent',
    ...overrides,
  });
  const create = (body: Record<string, unknown>, token = auth) =>
    http().post('/api/v1/transfers').set('Authorization', token).send(body);
  const errorsOf = (res: request.Response) =>
    (res.body.errors as { field: string; messages: string[] }[]).map(
      (e) => e.field,
    );

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);

    const user = await createUser(app, 'transfers');
    emails.push(user.email);
    auth = user.auth;
    const res = await http()
      .post('/api/v1/recipients')
      .set('Authorization', auth)
      .send({ name: 'Amara Okafor', country: 'NG' })
      .expect(201);
    recipientId = res.body.id;
  });

  afterAll(async () => {
    await deleteUsers(dataSource, emails);
    await app.close();
  });

  it('requires authentication on every endpoint', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    await http().get('/api/v1/transfers').expect(401);
    await http().post('/api/v1/transfers').send(base()).expect(401);
    await http().get(`/api/v1/transfers/${id}`).expect(401);
    await http()
      .patch(`/api/v1/transfers/${id}`)
      .send({ notes: 'x' })
      .expect(401);
    await http().delete(`/api/v1/transfers/${id}`).expect(401);
  });

  describe('POST /transfers', () => {
    it('creates a transfer and returns exactly what was entered, with provenance', async () => {
      const res = await create(base()).expect(201);
      expect(res.body).toMatchObject({
        recipientId,
        transferDate: isoDay(-1),
        sent: { amount: '15000', currency: 'GBP', provenance: 'user-entered' },
        fee: { amount: '350', currency: 'GBP', provenance: 'user-entered' },
        receivingCurrency: 'NGN',
        exchangeRate: { value: '1950.5', provenance: 'user-entered' },
        provider: 'Wise',
        purpose: 'Family support',
        status: 'completed',
        notes: 'Rent',
      });
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body.userId).toBeUndefined();

      const again = await http()
        .get(`/api/v1/transfers/${res.body.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(again.body).toEqual(res.body); // a re-read changes nothing
    });

    it('round-trips precise values without float error', async () => {
      const cases: [string, string][] = [
        ['9007199254740993', '0.1'], // beyond Number.MAX_SAFE_INTEGER
        ['1', '0.000000000001'], // smallest rate step
        ['10', '1.000000000001'],
        ['9223372036854775807', '123456789012.123456789012'], // bigint maximum
        ['30', '0.3'], // the classic 0.1 + 0.2 trap
      ];
      for (const [amount, rate] of cases) {
        const res = await create(
          base({
            sent: { amount, currency: 'GBP' },
            fee: undefined,
            exchangeRate: rate,
          }),
        ).expect(201);
        expect(res.body.sent.amount).toBe(amount);
        expect(res.body.exchangeRate.value).toBe(rate);
        const read = await http()
          .get(`/api/v1/transfers/${res.body.id}`)
          .set('Authorization', auth)
          .expect(200);
        expect(read.body.sent.amount).toBe(amount);
        expect(read.body.exchangeRate.value).toBe(rate);
      }
    });

    it('stores the rate without trailing zeros, so a re-read equals the response', async () => {
      const res = await create(base({ exchangeRate: '1950.500' })).expect(201);
      expect(res.body.exchangeRate.value).toBe('1950.5');
      const whole = await create(base({ exchangeRate: '2000.000' })).expect(
        201,
      );
      expect(whole.body.exchangeRate.value).toBe('2000');
    });

    it('defaults status to pending and the fee to zero in the sending currency', async () => {
      const res = await create(
        base({
          fee: undefined,
          status: undefined,
          purpose: undefined,
          notes: undefined,
        }),
      ).expect(201);
      expect(res.body.status).toBe('pending');
      expect(res.body.fee).toEqual({
        amount: '0',
        currency: 'GBP',
        provenance: 'user-entered',
      });
      expect(res.body.purpose).toBeNull();
      expect(res.body.notes).toBeNull();
    });

    it('accepts every status and rejects others', async () => {
      for (const status of ['pending', 'completed', 'failed', 'cancelled']) {
        expect((await create(base({ status }))).status, status).toBe(201);
      }
      const bad = await create(base({ status: 'done' })).expect(400);
      expect(errorsOf(bad)).toContain('status');
    });

    it('normalizes currencies to uppercase and trims the provider', async () => {
      const res = await create(
        base({
          sent: { amount: '100', currency: 'gbp' },
          fee: undefined,
          receivingCurrency: 'ngn',
          provider: '  Wise  ',
        }),
      ).expect(201);
      expect(res.body.sent.currency).toBe('GBP');
      expect(res.body.receivingCurrency).toBe('NGN');
      expect(res.body.provider).toBe('Wise');
    });

    it('rejects unsupported and malformed currencies with field-level errors', async () => {
      const res = await create(
        base({
          sent: { amount: '100', currency: 'XXX' },
          fee: undefined,
          receivingCurrency: 'JPY',
        }),
      ).expect(400);
      expect(errorsOf(res)).toEqual(
        expect.arrayContaining(['sent.currency', 'receivingCurrency']),
      );
      await create(base({ receivingCurrency: 123 })).expect(400);
      await create(base({ receivingCurrency: undefined })).expect(400);
    });

    it('rejects zero, negative, decimal and non-string sent amounts', async () => {
      for (const amount of [
        '0',
        '-5',
        '1.5',
        '01',
        '',
        1500,
        null,
        '9223372036854775808',
      ]) {
        const res = await create(
          base({ sent: { amount, currency: 'GBP' }, fee: undefined }),
        );
        expect(res.status, JSON.stringify(amount)).toBe(400);
        expect(errorsOf(res)).toContain('sent.amount');
      }
    });

    it('accepts a zero fee but rejects a negative or malformed one', async () => {
      await create(base({ fee: { amount: '0', currency: 'GBP' } })).expect(201);
      for (const amount of ['-1', '0.5', 5, '']) {
        const res = await create(base({ fee: { amount, currency: 'GBP' } }));
        expect(res.status, JSON.stringify(amount)).toBe(400);
        expect(errorsOf(res)).toContain('fee.amount');
      }
    });

    it('requires the fee to be in the sending currency', async () => {
      const res = await create(
        base({ fee: { amount: '350', currency: 'USD' } }),
      ).expect(400);
      expect(errorsOf(res)).toEqual(['fee.currency']);
      expect(res.body.errors[0].messages[0]).toContain('GBP');
    });

    it('rejects invalid exchange rates', async () => {
      for (const exchangeRate of [
        '0',
        '0.0',
        '-1',
        'abc',
        '1e3',
        '',
        '1.0000000000001',
        1950,
        null,
      ]) {
        const res = await create(base({ exchangeRate }));
        expect(res.status, JSON.stringify(exchangeRate)).toBe(400);
        expect(errorsOf(res)).toContain('exchangeRate');
      }
    });

    it('applies the date rule: real date, from 2000, at most 1 day ahead (UTC)', async () => {
      for (const transferDate of [
        isoDay(0),
        isoDay(1),
        isoDay(-400),
        '2000-01-01',
      ]) {
        expect(
          (await create(base({ transferDate }))).status,
          transferDate,
        ).toBe(201);
      }
      for (const transferDate of [
        isoDay(2),
        '2999-01-01',
        '1999-12-31',
        '2026-02-30',
        '2026-13-01',
        'tomorrow',
        '',
        20261105,
      ]) {
        const res = await create(base({ transferDate }));
        expect(res.status, String(transferDate)).toBe(400);
        expect(errorsOf(res)).toContain('transferDate');
      }
    });

    it('validates provider, purpose and notes lengths', async () => {
      await create(base({ provider: '' })).expect(400);
      await create(base({ provider: 'p'.repeat(101) })).expect(400);
      await create(base({ provider: 'p'.repeat(100) })).expect(201);
      await create(base({ purpose: 'p'.repeat(201) })).expect(400);
      await create(base({ notes: 'n'.repeat(501) })).expect(400);
      await create(base({ provider: undefined })).expect(400);
    });

    it('reports several problems at once, per field, and keeps the flat message list', async () => {
      const res = await create({
        recipientId: 'nope',
        sent: { amount: '-1', currency: 'XXX' },
        exchangeRate: 'x',
      }).expect(400);
      expect(errorsOf(res)).toEqual(
        expect.arrayContaining([
          'recipientId',
          'transferDate',
          'sent.amount',
          'sent.currency',
          'receivingCurrency',
          'exchangeRate',
          'provider',
        ]),
      );
      expect(Array.isArray(res.body.message)).toBe(true);
      expect(
        res.body.message.every((m: unknown) => typeof m === 'string'),
      ).toBe(true);
      expect(
        res.body.errors.every(
          (e: { messages: string[] }) => e.messages.length > 0,
        ),
      ).toBe(true);
    });

    it('rejects unknown fields, including userId and calculated figures', async () => {
      await create(
        base({ userId: '00000000-0000-4000-8000-000000000000' }),
      ).expect(400);
      await create(base({ receivedAmount: '1' })).expect(400);
      await create(
        base({ sent: { amount: '1', currency: 'GBP', extra: 1 } }),
      ).expect(400);
    });
  });

  describe('recipient ownership', () => {
    it('rejects a recipient that belongs to someone else exactly like a missing one', async () => {
      const other = await createUser(app, 'other-owner');
      emails.push(other.email);
      const theirs = await http()
        .post('/api/v1/recipients')
        .set('Authorization', other.auth)
        .send({ name: 'Theirs', country: 'GH' })
        .expect(201);

      const foreign = await create(
        base({ recipientId: theirs.body.id }),
      ).expect(400);
      const missing = await create(
        base({ recipientId: '00000000-0000-4000-8000-000000000000' }),
      ).expect(400);
      expect(errorsOf(foreign)).toEqual(['recipientId']);
      expect(foreign.body).toEqual(missing.body);
      // Nothing was created for either user.
      const list = await http()
        .get('/api/v1/transfers')
        .set('Authorization', other.auth)
        .expect(200);
      expect(list.body).toEqual([]);
    });
  });

  describe('GET /transfers', () => {
    it('lists only own transfers, newest date first with a stable tiebreak', async () => {
      const user = await createUser(app, 'lister');
      emails.push(user.email);
      const r = await http()
        .post('/api/v1/recipients')
        .set('Authorization', user.auth)
        .send({ name: 'R', country: 'KE' })
        .expect(201);
      for (const transferDate of [
        isoDay(-10),
        isoDay(-1),
        isoDay(-5),
        isoDay(-1),
      ]) {
        await create(
          base({ recipientId: r.body.id, transferDate }),
          user.auth,
        ).expect(201);
      }
      const res = await http()
        .get('/api/v1/transfers')
        .set('Authorization', user.auth)
        .expect(200);
      expect(
        res.body.map((t: { transferDate: string }) => t.transferDate),
      ).toEqual([isoDay(-1), isoDay(-1), isoDay(-5), isoDay(-10)]);
      const again = await http()
        .get('/api/v1/transfers')
        .set('Authorization', user.auth)
        .expect(200);
      expect(again.body.map((t: { id: string }) => t.id)).toEqual(
        res.body.map((t: { id: string }) => t.id),
      );
    });
  });

  describe('GET, PATCH and DELETE /transfers/:id', () => {
    it('returns 404 for a missing or non-UUID id', async () => {
      await http()
        .get('/api/v1/transfers/00000000-0000-4000-8000-000000000000')
        .set('Authorization', auth)
        .expect(404);
      await http()
        .get('/api/v1/transfers/not-a-uuid')
        .set('Authorization', auth)
        .expect(404);
      await http()
        .patch('/api/v1/transfers/00000000-0000-4000-8000-000000000000')
        .set('Authorization', auth)
        .send({ notes: 'x' })
        .expect(404);
      await http()
        .delete('/api/v1/transfers/00000000-0000-4000-8000-000000000000')
        .set('Authorization', auth)
        .expect(404);
    });

    it('updates only the provided fields', async () => {
      const { body } = await create(base()).expect(201);
      const res = await http()
        .patch(`/api/v1/transfers/${body.id}`)
        .set('Authorization', auth)
        .send({ status: 'failed', exchangeRate: '1960.25', notes: null })
        .expect(200);
      expect(res.body).toMatchObject({
        id: body.id,
        status: 'failed',
        exchangeRate: { value: '1960.25' },
        notes: null,
        provider: 'Wise',
        sent: body.sent,
        fee: body.fee,
      });
    });

    it('replaces sent and fee whole and keeps the fee currency in step', async () => {
      const { body } = await create(base()).expect(201);
      const patch = (data: Record<string, unknown>) =>
        http()
          .patch(`/api/v1/transfers/${body.id}`)
          .set('Authorization', auth)
          .send(data);

      const ok = await patch({
        sent: { amount: '20000', currency: 'GBP' },
      }).expect(200);
      expect(ok.body.sent.amount).toBe('20000');
      expect(ok.body.fee.amount).toBe('350');

      // Changing the sending currency without restating the fee would silently
      // re-label it, so it is refused.
      const refused = await patch({
        sent: { amount: '100', currency: 'USD' },
      }).expect(400);
      expect(errorsOf(refused)).toEqual(['fee']);
      const both = await patch({
        sent: { amount: '100', currency: 'USD' },
        fee: { amount: '5', currency: 'USD' },
      }).expect(200);
      expect(both.body.sent.currency).toBe('USD');
      expect(both.body.fee.currency).toBe('USD');

      const mismatch = await patch({
        fee: { amount: '5', currency: 'GBP' },
      }).expect(400);
      expect(errorsOf(mismatch)).toEqual(['fee.currency']);
    });

    it('validates patches like creation and rejects an empty body', async () => {
      const { body } = await create(base()).expect(201);
      const patch = (data: Record<string, unknown>) =>
        http()
          .patch(`/api/v1/transfers/${body.id}`)
          .set('Authorization', auth)
          .send(data);
      await patch({}).expect(400);
      await patch({ sent: { amount: '0', currency: 'GBP' } }).expect(400);
      await patch({ exchangeRate: '0' }).expect(400);
      await patch({ transferDate: isoDay(5) }).expect(400);
      await patch({ status: 'nope' }).expect(400);
      await patch({ userId: '00000000-0000-4000-8000-000000000000' }).expect(
        400,
      );
    });

    it("can move a transfer to another of the user's recipients, but not to a foreign one", async () => {
      const { body } = await create(base()).expect(201);
      const second = await http()
        .post('/api/v1/recipients')
        .set('Authorization', auth)
        .send({ name: 'Second', country: 'GH' })
        .expect(201);
      const moved = await http()
        .patch(`/api/v1/transfers/${body.id}`)
        .set('Authorization', auth)
        .send({ recipientId: second.body.id })
        .expect(200);
      expect(moved.body.recipientId).toBe(second.body.id);

      const stranger = await createUser(app, 'stranger');
      emails.push(stranger.email);
      const foreign = await http()
        .post('/api/v1/recipients')
        .set('Authorization', stranger.auth)
        .send({ name: 'F', country: 'GH' })
        .expect(201);
      const refused = await http()
        .patch(`/api/v1/transfers/${body.id}`)
        .set('Authorization', auth)
        .send({ recipientId: foreign.body.id })
        .expect(400);
      expect(errorsOf(refused)).toEqual(['recipientId']);
    });

    it('deletes a transfer', async () => {
      const { body } = await create(base()).expect(201);
      await http()
        .delete(`/api/v1/transfers/${body.id}`)
        .set('Authorization', auth)
        .expect(204);
      await http()
        .get(`/api/v1/transfers/${body.id}`)
        .set('Authorization', auth)
        .expect(404);
    });
  });

  describe('cross-user isolation', () => {
    it("returns 404 for another user's transfer on read, update and delete, and changes nothing", async () => {
      const { body } = await create(base()).expect(201);
      const intruder = await createUser(app, 'intruder');
      emails.push(intruder.email);
      const as = { Authorization: intruder.auth };

      const read = await http()
        .get(`/api/v1/transfers/${body.id}`)
        .set(as)
        .expect(404);
      const missing = await http()
        .get('/api/v1/transfers/00000000-0000-4000-8000-000000000000')
        .set(as)
        .expect(404);
      expect(read.body).toEqual(missing.body);
      await http()
        .patch(`/api/v1/transfers/${body.id}`)
        .set(as)
        .send({ notes: 'pwned', status: 'cancelled' })
        .expect(404);
      await http().delete(`/api/v1/transfers/${body.id}`).set(as).expect(404);

      const intact = await http()
        .get(`/api/v1/transfers/${body.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(intact.body).toEqual(body);
      const theirList = await http()
        .get('/api/v1/transfers')
        .set(as)
        .expect(200);
      expect(theirList.body).toEqual([]);
    });
  });

  describe('deleting a recipient that has transfers (API-10 rule)', () => {
    it('is rejected with a clear 409 until the transfers are gone', async () => {
      const r = await http()
        .post('/api/v1/recipients')
        .set('Authorization', auth)
        .send({ name: 'Busy', country: 'NG' })
        .expect(201);
      const t = await create(base({ recipientId: r.body.id })).expect(201);
      await create(base({ recipientId: r.body.id })).expect(201);

      const refused = await http()
        .delete(`/api/v1/recipients/${r.body.id}`)
        .set('Authorization', auth)
        .expect(409);
      expect(refused.body.message).toContain('still used by 2 transfers');

      await http()
        .delete(`/api/v1/transfers/${t.body.id}`)
        .set('Authorization', auth)
        .expect(204);
      const still = await http()
        .delete(`/api/v1/recipients/${r.body.id}`)
        .set('Authorization', auth)
        .expect(409);
      expect(still.body.message).toContain('1 transfers');
    });

    it('is also enforced by the database, even if the application check were bypassed', async () => {
      const r = await http()
        .post('/api/v1/recipients')
        .set('Authorization', auth)
        .send({ name: 'Guarded', country: 'NG' })
        .expect(201);
      await create(base({ recipientId: r.body.id })).expect(201);
      await expect(
        dataSource.query('DELETE FROM recipients WHERE id = $1', [r.body.id]),
      ).rejects.toThrow(/foreign key/i);
    });
  });

  it('enforces money rules in the database too', async () => {
    const { body } = await create(base()).expect(201);
    await expect(
      dataSource.query(
        'UPDATE transfers SET "sentAmountMinor" = 0 WHERE id = $1',
        [body.id],
      ),
    ).rejects.toThrow(/check constraint/i);
    await expect(
      dataSource.query('UPDATE transfers SET "feeMinor" = -1 WHERE id = $1', [
        body.id,
      ]),
    ).rejects.toThrow(/check constraint/i);
    await expect(
      dataSource.query(`UPDATE transfers SET status = 'done' WHERE id = $1`, [
        body.id,
      ]),
    ).rejects.toThrow(/check constraint/i);
  });

  it('is documented in Swagger with an example and the status values', async () => {
    const res = await http().get('/api/docs-json').expect(200);
    const post = res.body.paths['/api/v1/transfers'].post;
    expect(post.security).toEqual([{ bearer: [] }]);
    expect(
      post.requestBody.content['application/json'].examples.typical.value.sent,
    ).toEqual({ amount: '15000', currency: 'GBP' });
    expect(
      res.body.components.schemas.TransferResponse.properties.status.enum,
    ).toEqual(['pending', 'completed', 'failed', 'cancelled']);
    for (const method of ['get', 'patch', 'delete'] as const) {
      expect(res.body.paths['/api/v1/transfers/{id}'][method]).toBeDefined();
    }
  });
});
