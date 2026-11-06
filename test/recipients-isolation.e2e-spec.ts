import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { createUser, deleteUsers } from './recipients-helpers.js';

// Two users must never see or change each other's recipients (ADR 0005):
// another user's record behaves exactly like a missing one (404).
describe('Recipients: cross-user isolation (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const emails: string[] = [];
  let alice: Awaited<ReturnType<typeof createUser>>;
  let bob: Awaited<ReturnType<typeof createUser>>;
  let alicesRecipient: { id: string; name: string };

  const http = () => request(app.getHttpServer());
  const as = (user: { auth: string }) => ({ Authorization: user.auth });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get(DataSource);

    alice = await createUser(app, 'alice');
    bob = await createUser(app, 'bob');
    emails.push(alice.email, bob.email);

    const created = await http()
      .post('/api/v1/recipients')
      .set(as(alice))
      .send({ name: 'Alices Recipient', country: 'NG', notes: 'private' })
      .expect(201);
    alicesRecipient = created.body;
    await http()
      .post('/api/v1/recipients')
      .set(as(bob))
      .send({ name: 'Bobs Recipient', country: 'GH' })
      .expect(201);
  });

  afterAll(async () => {
    await deleteUsers(dataSource, emails);
    await app.close();
  });

  it("does not list another user's recipients", async () => {
    const mine = await http()
      .get('/api/v1/recipients')
      .set(as(bob))
      .expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].name).toBe('Bobs Recipient');
    expect(JSON.stringify(mine.body)).not.toContain('Alices');
  });

  it("returns 404 when reading another user's recipient", async () => {
    const res = await http()
      .get(`/api/v1/recipients/${alicesRecipient.id}`)
      .set(as(bob))
      .expect(404);
    // The same response as for a recipient that does not exist at all.
    const missing = await http()
      .get('/api/v1/recipients/00000000-0000-4000-8000-000000000000')
      .set(as(bob))
      .expect(404);
    expect(res.body).toEqual(missing.body);
    expect(JSON.stringify(res.body)).not.toContain('private');
  });

  it("returns 404 and changes nothing when updating another user's recipient", async () => {
    await http()
      .patch(`/api/v1/recipients/${alicesRecipient.id}`)
      .set(as(bob))
      .send({ name: 'Hijacked', notes: 'pwned' })
      .expect(404);
    const still = await http()
      .get(`/api/v1/recipients/${alicesRecipient.id}`)
      .set(as(alice))
      .expect(200);
    expect(still.body).toMatchObject({
      name: 'Alices Recipient',
      notes: 'private',
    });
  });

  it("returns 404 and deletes nothing when deleting another user's recipient", async () => {
    await http()
      .delete(`/api/v1/recipients/${alicesRecipient.id}`)
      .set(as(bob))
      .expect(404);
    await http()
      .get(`/api/v1/recipients/${alicesRecipient.id}`)
      .set(as(alice))
      .expect(200);
  });

  it('cannot create a recipient for someone else by sending a userId', async () => {
    await http()
      .post('/api/v1/recipients')
      .set(as(bob))
      .send({ name: 'Sneaky', country: 'NG', userId: alice.id })
      .expect(400);
    const list = await http()
      .get('/api/v1/recipients')
      .set(as(alice))
      .expect(200);
    expect(list.body.map((r: { name: string }) => r.name)).not.toContain(
      'Sneaky',
    );
  });

  it('keeps recipients with their owner after both users act', async () => {
    const aliceList = await http()
      .get('/api/v1/recipients')
      .set(as(alice))
      .expect(200);
    const bobList = await http()
      .get('/api/v1/recipients')
      .set(as(bob))
      .expect(200);
    expect(aliceList.body.map((r: { name: string }) => r.name)).toEqual([
      'Alices Recipient',
    ]);
    expect(bobList.body.map((r: { name: string }) => r.name)).toEqual([
      'Bobs Recipient',
    ]);
  });
});
