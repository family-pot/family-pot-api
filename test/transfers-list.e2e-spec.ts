import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { createUser, deleteUsers } from './recipients-helpers.js';

interface Seeded {
  id: string;
  transferDate: string;
  recipient: 'r1' | 'r2';
  provider: string;
  status: string;
}

const day = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

describe('GET /transfers: filters and pagination (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const emails: string[] = [];
  let auth: string;
  let r1: string;
  let r2: string;
  const seeded: Seeded[] = [];

  const http = () => request(app.getHttpServer());
  const list = (params: Record<string, string | number> = {}, token = auth) =>
    http().get('/api/v1/transfers').query(params).set('Authorization', token);
  const ids = (res: request.Response) =>
    (res.body.data as { id: string }[]).map((t) => t.id);

  /** The seeded set in the order the API must return it. */
  const expected = (filter: (s: Seeded) => boolean = () => true) =>
    seeded
      .filter(filter)
      .sort((a, b) =>
        a.transferDate === b.transferDate
          ? a.id < b.id
            ? 1
            : -1
          : a.transferDate < b.transferDate
            ? 1
            : -1,
      )
      .map((s) => s.id);

  async function add(
    recipientId: string,
    recipient: Seeded['recipient'],
    transferDate: string,
    provider: string,
    status: string,
  ) {
    const res = await http()
      .post('/api/v1/transfers')
      .set('Authorization', auth)
      .send({
        recipientId,
        transferDate,
        sent: { amount: '1000', currency: 'GBP' },
        receivingCurrency: 'NGN',
        exchangeRate: '1950.5',
        provider,
        status,
      })
      .expect(201);
    seeded.push({ id: res.body.id, transferDate, recipient, provider, status });
    return res.body.id as string;
  }

  /** Walks every page with the given filters and returns the ids in order. */
  async function walk(
    params: Record<string, string | number>,
    onPage?: (page: number) => Promise<void>,
  ) {
    const all: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 100; page++) {
      const res = await list({
        ...params,
        ...(cursor ? { cursor } : {}),
      }).expect(200);
      all.push(...ids(res));
      if (onPage) await onPage(page);
      cursor = res.body.pagination.nextCursor ?? undefined;
      if (!cursor) return all;
    }
    throw new Error('pagination did not terminate');
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);

    const user = await createUser(app, 'listing');
    emails.push(user.email);
    auth = user.auth;
    r1 = (
      await http()
        .post('/api/v1/recipients')
        .set('Authorization', auth)
        .send({ name: 'One', country: 'NG' })
        .expect(201)
    ).body.id;
    r2 = (
      await http()
        .post('/api/v1/recipients')
        .set('Authorization', auth)
        .send({ name: 'Two', country: 'GH' })
        .expect(201)
    ).body.id;

    // 26 transfers: dates are clustered so several share a date (the id tiebreak
    // matters), with a mix of recipients, providers (different letter case) and statuses.
    const plan: [string, number, string, string][] = [
      ['r1', 0, 'Wise', 'completed'],
      ['r1', 0, 'wise', 'pending'],
      ['r2', 0, 'Remitly', 'completed'],
      ['r1', 1, 'Wise', 'completed'],
      ['r2', 1, 'Wise', 'failed'],
      ['r1', 1, 'Remitly', 'completed'],
      ['r2', 1, 'WISE', 'cancelled'],
      ['r1', 2, 'Western Union', 'completed'],
      ['r2', 2, 'Wise', 'completed'],
      ['r1', 5, 'Wise', 'pending'],
      ['r1', 5, 'Remitly', 'completed'],
      ['r2', 5, 'Remitly', 'failed'],
      ['r2', 5, 'Wise', 'completed'],
      ['r1', 9, 'Wise', 'completed'],
      ['r2', 9, 'Wise', 'completed'],
      ['r1', 10, 'Remitly', 'completed'],
      ['r2', 10, 'Western Union', 'pending'],
      ['r1', 20, 'Wise', 'completed'],
      ['r2', 20, 'Wise', 'cancelled'],
      ['r1', 20, 'Remitly', 'completed'],
      ['r2', 30, 'Wise', 'completed'],
      ['r1', 30, 'Wise', 'failed'],
      ['r2', 40, 'Remitly', 'completed'],
      ['r1', 50, 'Wise', 'completed'],
      ['r2', 60, 'Wise', 'pending'],
      ['r1', 60, 'Remitly', 'completed'],
    ];
    for (const [who, ago, provider, status] of plan) {
      await add(
        who === 'r1' ? r1 : r2,
        who as 'r1' | 'r2',
        day(ago),
        provider,
        status,
      );
    }
  });

  afterAll(async () => {
    await deleteUsers(dataSource, emails);
    await app.close();
  });

  describe('response shape and ordering', () => {
    it('returns data plus pagination metadata, newest first with the id as tiebreak', async () => {
      const res = await list().expect(200);
      expect(Object.keys(res.body).sort()).toEqual(['data', 'pagination']);
      expect(res.body.pagination).toEqual({
        limit: 20,
        hasMore: true,
        nextCursor: expect.any(String),
      });
      expect(ids(res)).toEqual(expected().slice(0, 20));
    });

    it('returns everything with no cursor when it fits on one page', async () => {
      const res = await list({ limit: 100 }).expect(200);
      expect(ids(res)).toEqual(expected());
      expect(res.body.pagination).toEqual({
        limit: 100,
        hasMore: false,
        nextCursor: null,
      });
    });

    it('is stable: the same request returns the same page', async () => {
      const first = await list({ limit: 5 }).expect(200);
      const second = await list({ limit: 5 }).expect(200);
      expect(second.body).toEqual(first.body);
      const next = await list({
        limit: 5,
        cursor: first.body.pagination.nextCursor,
      }).expect(200);
      const nextAgain = await list({
        limit: 5,
        cursor: first.body.pagination.nextCursor,
      }).expect(200);
      expect(nextAgain.body).toEqual(next.body);
    });
  });

  describe('pagination', () => {
    it.each([1, 2, 3, 7, 25, 26, 27, 100])(
      'walks every page with limit %i: no duplicates, no gaps, right order',
      async (limit) => {
        const all = await walk({ limit });
        expect(all).toHaveLength(26);
        expect(new Set(all).size).toBe(26);
        expect(all).toEqual(expected());
      },
    );

    it('marks the last page: hasMore false and a null cursor, including on an exact boundary', async () => {
      // 26 items with limit 13: the second page is exactly full but is the last one.
      const first = await list({ limit: 13 }).expect(200);
      expect(first.body.pagination.hasMore).toBe(true);
      const second = await list({
        limit: 13,
        cursor: first.body.pagination.nextCursor,
      }).expect(200);
      expect(second.body.data).toHaveLength(13);
      expect(second.body.pagination).toEqual({
        limit: 13,
        hasMore: false,
        nextCursor: null,
      });
    });

    it('returns an empty page when the cursor is past the end of the data', async () => {
      // The oldest seeded transfer is on the last page; paging past it gives nothing.
      const all = await walk({ limit: 100 });
      expect(all.at(-1)).toBe(expected().at(-1));
      const beyond = Buffer.from(
        JSON.stringify(['2000-01-01', '00000000-0000-4000-8000-000000000000']),
      ).toString('base64url');
      const res = await list({ cursor: beyond }).expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination).toEqual({
        limit: 20,
        hasMore: false,
        nextCursor: null,
      });
    });

    it('stays correct when transfers are added and removed between pages', async () => {
      // Remember the original set, walk it page by page, and mutate it as we go.
      const original = new Set(expected());
      const added: string[] = [];
      const removedUnseen: string[] = [];
      const collected: string[] = [];
      let cursor: string | undefined;
      let page = 0;
      do {
        const res = await list({
          limit: 5,
          ...(cursor ? { cursor } : {}),
        }).expect(200);
        collected.push(...ids(res));
        cursor = res.body.pagination.nextCursor ?? undefined;
        if (page === 0) {
          // A brand-new, newest-of-all transfer arrives after page one was read.
          added.push(await add(r1, 'r1', day(0), 'Late Arrival', 'pending'));
          // An item that has not been paged yet is deleted.
          const victim = expected()
            .filter((id) => original.has(id) && !collected.includes(id))
            .at(-1)!;
          await http()
            .delete(`/api/v1/transfers/${victim}`)
            .set('Authorization', auth)
            .expect(204);
          seeded.splice(
            seeded.findIndex((s) => s.id === victim),
            1,
          );
          original.delete(victim);
          removedUnseen.push(victim);
        }
        page++;
      } while (cursor);

      expect(new Set(collected).size).toBe(collected.length); // no duplicates
      // Every original item still present was returned exactly once (no gaps)...
      for (const id of original) expect(collected).toContain(id);
      // ...the deleted one never appears...
      for (const id of removedUnseen) expect(collected).not.toContain(id);
      // ...and the late arrival, which sorts before everything already paged, is not injected mid-walk.
      expect(collected).not.toContain(added[0]);

      // Clean up the extra row so later tests see the original seed set.
      await http()
        .delete(`/api/v1/transfers/${added[0]}`)
        .set('Authorization', auth)
        .expect(204);
      seeded.splice(
        seeded.findIndex((s) => s.id === added[0]),
        1,
      );
    });

    it('rejects an invalid limit and an invalid or tampered cursor', async () => {
      for (const limit of ['0', '-1', '101', '1.5', 'abc', '']) {
        const res = await list({ limit });
        expect(res.status, `limit=${limit}`).toBe(400);
      }
      for (const cursor of [
        'garbage',
        '!!!',
        Buffer.from('["2026-02-30","x"]').toString('base64url'),
      ]) {
        const res = await list({ cursor }).expect(400);
        expect(
          res.body.errors.map((e: { field: string }) => e.field),
        ).toContain('cursor');
      }
      await list({ cursor: 'x'.repeat(201) }).expect(400);
    });
  });

  describe('filters', () => {
    it('filters by recipient', async () => {
      expect(await walk({ recipientId: r1 })).toEqual(
        expected((s) => s.recipient === 'r1'),
      );
      expect(await walk({ recipientId: r2 })).toEqual(
        expected((s) => s.recipient === 'r2'),
      );
    });

    it('filters by date range with inclusive boundaries', async () => {
      const from = day(5);
      const to = day(1);
      expect(await walk({ dateFrom: from })).toEqual(
        expected((s) => s.transferDate >= from),
      );
      expect(await walk({ dateTo: to })).toEqual(
        expected((s) => s.transferDate <= to),
      );
      const range = await walk({ dateFrom: from, dateTo: to });
      expect(range).toEqual(
        expected((s) => s.transferDate >= from && s.transferDate <= to),
      );
      expect(range.length).toBeGreaterThan(0);
      // A single day: both bounds equal.
      expect(await walk({ dateFrom: day(2), dateTo: day(2) })).toEqual(
        expected((s) => s.transferDate === day(2)),
      );
    });

    it('filters by provider, exact and case-insensitive', async () => {
      const wise = expected((s) => s.provider.toLowerCase() === 'wise');
      expect(wise.length).toBeGreaterThan(5);
      for (const provider of ['Wise', 'wise', 'WISE', ' wise ']) {
        expect(await walk({ provider })).toEqual(wise);
      }
      expect(await walk({ provider: 'Western Union' })).toEqual(
        expected((s) => s.provider === 'Western Union'),
      );
      expect(await walk({ provider: 'Wis' })).toEqual([]); // exact, not a prefix
    });

    it('filters by status', async () => {
      for (const status of ['pending', 'completed', 'failed', 'cancelled']) {
        expect(await walk({ status })).toEqual(
          expected((s) => s.status === status),
        );
      }
    });

    it('combines filters', async () => {
      expect(await walk({ recipientId: r2, status: 'completed' })).toEqual(
        expected((s) => s.recipient === 'r2' && s.status === 'completed'),
      );
      expect(
        await walk({
          provider: 'wise',
          status: 'completed',
          dateFrom: day(30),
          dateTo: day(1),
        }),
      ).toEqual(
        expected(
          (s) =>
            s.provider.toLowerCase() === 'wise' &&
            s.status === 'completed' &&
            s.transferDate >= day(30) &&
            s.transferDate <= day(1),
        ),
      );
      expect(
        await walk({
          recipientId: r1,
          provider: 'Remitly',
          status: 'completed',
          dateFrom: day(60),
          dateTo: day(0),
          limit: 2,
        }),
      ).toEqual(
        expected(
          (s) =>
            s.recipient === 'r1' &&
            s.provider === 'Remitly' &&
            s.status === 'completed',
        ),
      );
    });

    it('returns an empty page, not an error, when nothing matches', async () => {
      const res = await list({ status: 'failed', provider: 'Nobody' }).expect(
        200,
      );
      expect(res.body).toEqual({
        data: [],
        pagination: { limit: 20, hasMore: false, nextCursor: null },
      });
      const future = await list({ dateFrom: day(-30) }).expect(200);
      expect(future.body.data).toEqual([]);
    });

    it('rejects invalid filters and unknown parameters with 400', async () => {
      const bad: Record<string, string>[] = [
        { recipientId: 'not-a-uuid' },
        { status: 'done' },
        { status: '' },
        { dateFrom: '2026-02-30' },
        { dateFrom: 'yesterday' },
        { dateTo: '2026/01/01' },
        { dateFrom: day(1), dateTo: day(5) }, // from after to
        { provider: 'p'.repeat(101) },
        { unknown: '1' },
        { userId: '00000000-0000-4000-8000-000000000000' },
      ];
      for (const params of bad) {
        const res = await list(params);
        expect(res.status, JSON.stringify(params)).toBe(400);
      }
    });

    it('reports the reversed date range on the right field', async () => {
      const res = await list({ dateFrom: day(1), dateTo: day(5) }).expect(400);
      expect(res.body.errors).toEqual([
        { field: 'dateFrom', messages: ['dateFrom must not be after dateTo.'] },
      ]);
    });
  });

  describe('cross-user isolation', () => {
    it("never returns another user's transfers, whatever the filters or cursor", async () => {
      const other = await createUser(app, 'other-lister');
      emails.push(other.email);
      const theirs = await http()
        .post('/api/v1/recipients')
        .set('Authorization', other.auth)
        .send({ name: 'Theirs', country: 'KE' })
        .expect(201);
      const mine = await http()
        .post('/api/v1/transfers')
        .set('Authorization', other.auth)
        .send({
          recipientId: theirs.body.id,
          transferDate: day(0),
          sent: { amount: '5', currency: 'USD' },
          receivingCurrency: 'KES',
          exchangeRate: '129',
          provider: 'Wise',
          status: 'completed',
        })
        .expect(201);

      // Their own view contains exactly their one transfer.
      const own = await list({}, other.auth).expect(200);
      expect(ids(own)).toEqual([mine.body.id]);

      // Mine never contains theirs, with or without filters.
      const variants: Record<string, string | number>[] = [
        {},
        { provider: 'Wise' },
        { status: 'completed' },
        { limit: 100 },
      ];
      for (const params of variants) {
        expect(ids(await list(params).expect(200))).not.toContain(mine.body.id);
      }
      // Filtering by their recipient id from my account leaks nothing and is not an error.
      const probe = await list({ recipientId: theirs.body.id }).expect(200);
      expect(probe.body.data).toEqual([]);

      // A cursor taken from my listing, used by them, only ever yields their own rows.
      const myPage = await list({ limit: 3 }).expect(200);
      const theirPage = await list(
        { cursor: myPage.body.pagination.nextCursor },
        other.auth,
      ).expect(200);
      expect(ids(theirPage).every((id) => id === mine.body.id)).toBe(true);
    });
  });

  it('is documented in Swagger: query parameters and the paged response', async () => {
    const res = await http().get('/api/docs-json').expect(200);
    const parameters = res.body.paths['/api/v1/transfers'].get.parameters.map(
      (p: { name: string }) => p.name,
    );
    expect(parameters.sort()).toEqual([
      'cursor',
      'dateFrom',
      'dateTo',
      'limit',
      'provider',
      'recipientId',
      'status',
    ]);
    expect(
      res.body.components.schemas.TransferPage.properties.pagination,
    ).toBeDefined();
    expect(
      res.body.components.schemas.PaginationMeta.properties.nextCursor,
    ).toBeDefined();
  });

  it('uses the indexes: the user-scoped, sorted query does not need a sort step', async () => {
    const [{ id: userId }] = await dataSource.query(
      'SELECT id FROM users WHERE email = $1',
      [emails[0]],
    );
    await dataSource.query('SET enable_seqscan = off'); // the table is tiny; ask the planner for the index path
    const plan = (await dataSource.query(
      `EXPLAIN SELECT * FROM transfers WHERE "userId" = $1 ORDER BY "transferDate" DESC, id DESC LIMIT 21`,
      [userId],
    )) as { 'QUERY PLAN': string }[];
    await dataSource.query('RESET enable_seqscan');
    const text = plan.map((row) => row['QUERY PLAN']).join('\n');
    expect(text).toMatch(/Index.*Scan.*IDX_transfers_user_date/);
    expect(text).not.toMatch(/\bSort\b/);
  });
});
