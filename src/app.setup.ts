import { VersioningType, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppConfigService } from './config/app-config.service.js';

export const API_PREFIX = 'api';
export const DOCS_PATH = `${API_PREFIX}/docs`;

// Swagger UI needs inline scripts and styles, which the strict default policy
// forbids. Relax the policy for the docs pages only, never for the API.
const docsHelmet = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
});
const apiHelmet = helmet();

/**
 * Everything that must be identical in production and in e2e tests: security
 * headers, the body size limit, the `/api` prefix, URI versioning
 * (`/api/v1/...`), CORS and the Swagger docs. Call it on the app before
 * `listen()` / `init()`.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfigService);

  // Behind a reverse proxy (Render) the client IP is in X-Forwarded-For. Rate
  // limiting is per IP, so it must know how many proxies to trust.
  if (config.trustProxy > 0) {
    (app as NestExpressApplication).set('trust proxy', config.trustProxy);
  }

  app.use((request: { path: string }, response: unknown, next: () => void) =>
    (request.path.startsWith(`/${DOCS_PATH}`) ? docsHelmet : apiHelmet)(
      request as never,
      response as never,
      next,
    ),
  );

  // Registered before Nest's own parsers, which then skip already-parsed
  // bodies. A body over the limit is rejected with 413 before any handler runs.
  app.use(json({ limit: config.requestBodyLimit }));
  app.use(urlencoded({ extended: true, limit: config.requestBodyLimit }));

  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Only the configured origins get CORS access. With no origins configured,
  // `false` disables CORS entirely (Nest would otherwise allow every origin).
  // Credentials are enabled for the cookie-based refresh token (ADR 0005).
  const origins = config.corsOrigins;
  app.enableCors({
    origin: origins.length > 0 ? origins : false,
    credentials: true,
  });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Family Pot API')
      .setDescription(
        'REST API for tracking money sent home. Money values are strings; see ADR 0004.',
      )
      .setVersion('1')
      .addBearerAuth()
      .build(),
  );
  // Registered under /api/docs; Swagger paths are not affected by the global prefix.
  SwaggerModule.setup(DOCS_PATH, app, document);
}
