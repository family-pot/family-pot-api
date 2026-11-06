import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { RecipientUsageRegistry } from './../src/recipients/recipient-usage.registry.js';
import { createUser, deleteUsers } from './recipients-helpers.js';

describe('Recipients (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let registry: RecipientUsageRegistry;
  const emails: string[] = [];
  let auth: string;

  const http = () => request(app.getHttpServer());
  const create = (body: Record<string, unknown>, token = auth) =>
    http().post('/api/v1/recipients').set('Authorization', token).send(body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);
    registry = app.get(RecipientUsageRegistry);
    const user = await createUser(app, 'recipients');
    emails.push(user.email);
    auth = user.auth;
  });

  afterAll(async () => {
    await deleteUsers(dataSource, emails);
    await app.close();
  });

  describe('authentication', () => {
    it('requires a valid token on every endpoint', async () => {
      const id = '00000000-0000-4000-8000-000000000000';
      await http().get('/api/v1/recipients').expect(401);
      await http()
        .post('/api/v1/recipients')
        .send({ name: 'A', country: 'NG' })
        .expect(401);
      await http().get(`/api/v1/recipients/${id}`).expect(401);
      await http()
        .patch(`/api/v1/recipients/${id}`)
        .send({ name: 'B' })
        .expect(401);
      await http().delete(`/api/v1/recipients/${id}`).expect(401);
      await http()
        .get('/api/v1/recipients')
        .set('Authorization', 'Bearer nope')
        .expect(401);
    });
  });

  describe('POST /recipients', () => {
    it('creates a recipient, normalizing name and country', async () => {
      const res = await create({
        name: '  Amara Okafor  ',
        country: ' ng ',
        notes: 'Sister',
      }).expect(201);
      expect(res.body).toMatchObject({
        name: 'Amara Okafor',
        country: 'NG',
        notes: 'Sister',
      });
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(Object.keys(res.body).sort()).toEqual([
        'country',
        'createdAt',
        'id',
        'name',
        'notes',
        'updatedAt',
      ]); // no userId
    });

    it('returns null notes when omitted', async () => {
      const res = await create({ name: 'No Notes', country: 'GH' }).expect(201);
      expect(res.body.notes).toBeNull();
    });

    it('rejects empty and over-long names', async () => {
      for (const name of ['', '   ', 'n'.repeat(101), 42, undefined]) {
        await create({ name, country: 'NG' }).expect(400);
      }
      await create({ name: 'n'.repeat(100), country: 'NG' }).expect(201);
    });

    it('rejects invalid country codes', async () => {
      for (const country of [
        '',
        'XX',
        'NGA',
        'Nigeria',
        'U',
        12,
        null,
        undefined,
      ]) {
        const res = await create({ name: 'Bad Country', country });
        expect(res.status, JSON.stringify(country)).toBe(400);
      }
    });

    it('rejects over-long notes and unknown fields (including userId)', async () => {
      await create({ name: 'A', country: 'NG', notes: 'n'.repeat(501) }).expect(
        400,
      );
      await create({ name: 'A', country: 'NG', notes: 'n'.repeat(500) }).expect(
        201,
      );
      await create({ name: 'A', country: 'NG', extra: true }).expect(400);
      await create({
        name: 'A',
        country: 'NG',
        userId: '00000000-0000-4000-8000-000000000000',
      }).expect(400);
    });
  });

  describe('GET /recipients', () => {
    it("lists only the current user's recipients, sorted by name", async () => {
      const user = await createUser(app, 'lister');
      emails.push(user.email);
      for (const name of ['Charlie', 'alice', 'Bob']) {
        await create({ name, country: 'KE' }, user.auth).expect(201);
      }
      const res = await http()
        .get('/api/v1/recipients')
        .set('Authorization', user.auth)
        .expect(200);
      expect(res.body.map((r: { name: string }) => r.name)).toEqual([
        'alice',
        'Bob',
        'Charlie',
      ]);
    });

    it('returns an empty list for a new user', async () => {
      const user = await createUser(app, 'empty');
      emails.push(user.email);
      const res = await http()
        .get('/api/v1/recipients')
        .set('Authorization', user.auth)
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /recipients/:id', () => {
    it('returns one recipient', async () => {
      const { body } = await create({ name: 'Findable', country: 'IN' }).expect(
        201,
      );
      const res = await http()
        .get(`/api/v1/recipients/${body.id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(res.body).toEqual(body);
    });

    it('returns 404 for a missing id and for an id that is not a UUID', async () => {
      await http()
        .get('/api/v1/recipients/00000000-0000-4000-8000-000000000000')
        .set('Authorization', auth)
        .expect(404);
      await http()
        .get('/api/v1/recipients/not-a-uuid')
        .set('Authorization', auth)
        .expect(404);
    });
  });

  describe('PATCH /recipients/:id', () => {
    it('updates only the provided fields', async () => {
      const { body } = await create({
        name: 'Before',
        country: 'NG',
        notes: 'keep me',
      }).expect(201);
      const res = await http()
        .patch(`/api/v1/recipients/${body.id}`)
        .set('Authorization', auth)
        .send({ name: ' After ', country: 'gh' })
        .expect(200);
      expect(res.body).toMatchObject({
        id: body.id,
        name: 'After',
        country: 'GH',
        notes: 'keep me',
      });
      expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(body.updatedAt).getTime(),
      );
    });

    it('clears notes with null', async () => {
      const { body } = await create({
        name: 'Noted',
        country: 'NG',
        notes: 'x',
      }).expect(201);
      const res = await http()
        .patch(`/api/v1/recipients/${body.id}`)
        .set('Authorization', auth)
        .send({ notes: null })
        .expect(200);
      expect(res.body.notes).toBeNull();
    });

    it('validates the same rules as creation', async () => {
      const { body } = await create({ name: 'Valid', country: 'NG' }).expect(
        201,
      );
      const patch = (data: Record<string, unknown>) =>
        http()
          .patch(`/api/v1/recipients/${body.id}`)
          .set('Authorization', auth)
          .send(data);
      await patch({ name: '' }).expect(400);
      await patch({ name: '   ' }).expect(400);
      await patch({ country: 'ZZ' }).expect(400);
      await patch({ unknown: 1 }).expect(400);
      await patch({ userId: '00000000-0000-4000-8000-000000000000' }).expect(
        400,
      );
      await patch({}).expect(400); // nothing to update
    });

    it('returns 404 for a missing recipient', async () => {
      await http()
        .patch('/api/v1/recipients/00000000-0000-4000-8000-000000000000')
        .set('Authorization', auth)
        .send({ name: 'X' })
        .expect(404);
    });
  });

  describe('DELETE /recipients/:id', () => {
    it('deletes a recipient', async () => {
      const { body } = await create({ name: 'Doomed', country: 'NG' }).expect(
        201,
      );
      await http()
        .delete(`/api/v1/recipients/${body.id}`)
        .set('Authorization', auth)
        .expect(204);
      await http()
        .get(`/api/v1/recipients/${body.id}`)
        .set('Authorization', auth)
        .expect(404);
      await http()
        .delete(`/api/v1/recipients/${body.id}`)
        .set('Authorization', auth)
        .expect(404);
    });

    it('rejects deleting a recipient that is still in use, with a clear error', async () => {
      const { body } = await create({ name: 'In Use', country: 'NG' }).expect(
        201,
      );
      // Stand-in for the transfers module, which registers a check like this.
      registry.register('transfers', {
        count: async (_user, id) => (id === body.id ? 2 : 0),
      });

      const res = await http()
        .delete(`/api/v1/recipients/${body.id}`)
        .set('Authorization', auth)
        .expect(409);
      expect(res.body.message).toContain('still used by 2 transfers');
      // Still there.
      await http()
        .get(`/api/v1/recipients/${body.id}`)
        .set('Authorization', auth)
        .expect(200);

      // An unrelated recipient is unaffected.
      const other = await create({ name: 'Not In Use', country: 'NG' }).expect(
        201,
      );
      await http()
        .delete(`/api/v1/recipients/${other.body.id}`)
        .set('Authorization', auth)
        .expect(204);
    });
  });

  it('is documented in Swagger with bearer auth', async () => {
    const res = await http().get('/api/docs-json').expect(200);
    for (const [path, method] of [
      ['/api/v1/recipients', 'post'],
      ['/api/v1/recipients', 'get'],
      ['/api/v1/recipients/{id}', 'get'],
      ['/api/v1/recipients/{id}', 'patch'],
      ['/api/v1/recipients/{id}', 'delete'],
    ] as const) {
      expect(res.body.paths[path][method].security).toEqual([{ bearer: [] }]);
    }
  });
});
