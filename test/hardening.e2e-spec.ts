import {
  Body,
  Controller,
  Get,
  INestApplication,
  Module,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';

// Lower limits for this file's app. They are read when the app modules are
// first imported, hence the dynamic imports below.
process.env.RATE_LIMIT_GLOBAL_LIMIT = '40';
process.env.RATE_LIMIT_AUTH_LIMIT = '3';
process.env.REQUEST_BODY_LIMIT = '1kb';

@Controller({ path: 'test-hardening', version: '1' })
class TestHardeningController {
  @Post('echo')
  echo(@Body() body: Record<string, unknown>) {
    return { received: Object.keys(body).length };
  }

  @Get('boom')
  boom(): never {
    throw new Error('internal secret: db password hunter2');
  }
}

@Module({ controllers: [TestHardeningController] })
class TestHardeningModule {}

describe('Security hardening (e2e)', () => {
  let app: INestApplication<App>;
  let AppModule: typeof import('./../src/app.module.js').AppModule;
  let configureApp: typeof import('./../src/app.setup.js').configureApp;
  let AppConfigService: typeof import('./../src/config/app-config.service.js').AppConfigService;
  const http = () => request(app.getHttpServer());

  async function createApp(nodeEnv?: 'production') {
    let builder = Test.createTestingModule({
      imports: [AppModule, TestHardeningModule],
    });
    if (nodeEnv) {
      // Same configuration, but the app believes it runs in production.
      builder = builder.overrideProvider(AppConfigService).useFactory({
        inject: [ConfigService],
        factory: (config: ConfigService) => {
          const real = new AppConfigService(config as never);
          return new Proxy(real, {
            get: (target, prop) =>
              prop === 'nodeEnv' ? nodeEnv : Reflect.get(target, prop, target),
          });
        },
      });
    }
    const moduleFixture: TestingModule = await builder.compile();
    const created =
      moduleFixture.createNestApplication<INestApplication<App>>();
    configureApp(created);
    await created.init();
    return created;
  }

  beforeAll(async () => {
    ({ AppModule } = await import('./../src/app.module.js'));
    ({ configureApp } = await import('./../src/app.setup.js'));
    ({ AppConfigService } =
      await import('./../src/config/app-config.service.js'));
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('security headers', () => {
    it('sets helmet headers and hides x-powered-by', async () => {
      const res = await http().get('/api/v1/health').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toContain('max-age=');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['content-security-policy']).toContain(
        "default-src 'self'",
      );
      // Scripts may only come from this origin. (Helmet's default style-src
      // allows inline styles; only the Swagger UI needs inline scripts.)
      expect(res.headers['content-security-policy']).toMatch(
        /script-src 'self'(;|$)/,
      );
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('relaxes the CSP for the Swagger UI only', async () => {
      const docs = await http().get('/api/docs').expect(200);
      expect(docs.headers['content-security-policy']).toContain(
        "script-src 'self' 'unsafe-inline'",
      );
      expect(docs.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('request validation and size', () => {
    it('rejects unknown properties in bodies', async () => {
      // A fresh app, so this does not spend attempts of the rate-limit tests below.
      const fresh = await createApp();
      try {
        const unknown = await request(fresh.getHttpServer())
          .post('/api/v1/auth/register')
          .send({
            email: 'a@example.com',
            password: 'a-long-enough-password',
            admin: true,
          })
          .expect(400);
        expect(JSON.stringify(unknown.body.message)).toContain('admin');
      } finally {
        await fresh.close();
      }
    });

    it('rejects malformed JSON with 400', async () => {
      await http()
        .post('/api/v1/test-hardening/echo')
        .set('Content-Type', 'application/json')
        .send('{"broken":')
        .expect(400);
    });

    it('rejects a body over the configured limit with 413 and accepts one under it', async () => {
      await http()
        .post('/api/v1/test-hardening/echo')
        .send({ data: 'x'.repeat(2000) })
        .expect(413);
      const ok = await http()
        .post('/api/v1/test-hardening/echo')
        .send({ data: 'x'.repeat(200) });
      expect(ok.status).toBe(201);
      expect(ok.body).toEqual({ received: 1 });
    });
  });

  describe('rate limiting', () => {
    const body = {
      email: 'nobody@example.com',
      password: 'a-long-enough-password',
    };

    it('limits login after the configured number of attempts, with Retry-After', async () => {
      for (let i = 0; i < 3; i++) {
        await http().post('/api/v1/auth/login').send(body).expect(401);
      }
      const limited = await http()
        .post('/api/v1/auth/login')
        .send(body)
        .expect(429);
      // Named throttlers suffix the header with their name.
      expect(limited.headers['retry-after-auth']).toBeDefined();
      expect(limited.body.statusCode).toBe(429);
    });

    it('limits register and refresh independently', async () => {
      for (let i = 0; i < 3; i++) {
        await http()
          .post('/api/v1/auth/register')
          .send({ email: 'bad', password: 'x' })
          .expect(400);
        await http().post('/api/v1/auth/refresh').expect(401);
      }
      await http()
        .post('/api/v1/auth/register')
        .send({ email: 'bad', password: 'x' })
        .expect(429);
      await http().post('/api/v1/auth/refresh').expect(429);
    });

    it('does not apply the strict limit to other routes', async () => {
      for (let i = 0; i < 6; i++) {
        await http().get('/api/v1/health').expect(200);
      }
      // Logout is not a strictly limited route either.
      for (let i = 0; i < 6; i++) {
        await http().post('/api/v1/auth/logout').expect(204);
      }
    });

    it('applies the looser global limit to everything', async () => {
      let limitedAt = 0;
      for (let i = 1; i <= 60 && !limitedAt; i++) {
        const res = await http()
          .get('/api/v1/test-hardening/boom')
          .catch((e: unknown) => e as never);
        if ((res as { status?: number }).status === 429) limitedAt = i;
      }
      // The global limit is 40 per window: request 41 is the first one refused.
      expect(limitedAt).toBe(41);
    });
  });

  describe('error responses', () => {
    it('gives unexpected errors a generic body with no internals in production', async () => {
      const prod = await createApp('production');
      try {
        const res = await request(prod.getHttpServer())
          .get('/api/v1/test-hardening/boom')
          .expect(500);
        expect(res.body).toEqual({
          statusCode: 500,
          message: 'Internal server error',
        });
        expect(res.text).not.toMatch(
          /hunter2|stack|\.ts:|node_modules|at .*\(/,
        );
      } finally {
        await prod.close();
      }
    });

    it('includes detail outside production to ease debugging', async () => {
      const dev = await createApp(); // NODE_ENV=test
      try {
        const res = await request(dev.getHttpServer())
          .get('/api/v1/test-hardening/boom')
          .expect(500);
        expect(res.body.message).toBe('Internal server error');
        expect(res.body.detail).toContain('internal secret');
      } finally {
        await dev.close();
      }
    });

    it('keeps normal HTTP errors intact in production', async () => {
      const prod = await createApp('production');
      try {
        await request(prod.getHttpServer()).get('/api/v1/nope').expect(404);
        const bad = await request(prod.getHttpServer())
          .post('/api/v1/auth/register')
          .send({ email: 'x' })
          .expect(400);
        expect(Array.isArray(bad.body.message)).toBe(true);
      } finally {
        await prod.close();
      }
    });
  });
});
