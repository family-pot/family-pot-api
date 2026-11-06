import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

/** Registers a user and logs in. Returns what a test needs to act as that user. */
export async function createUser(app: INestApplication, label: string) {
  const email = `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const password = 'a-long-enough-password';
  const http = request(app.getHttpServer());
  const registered = await http
    .post('/api/v1/auth/register')
    .send({ email, password })
    .expect(201);
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return {
    id: registered.body.id as string,
    email,
    auth: `Bearer ${login.body.accessToken as string}`,
  };
}

export async function deleteUsers(dataSource: DataSource, emails: string[]) {
  // Recipients (and anything else owned by the users) go with ON DELETE CASCADE.
  await dataSource.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
}
