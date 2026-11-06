import { VersioningType, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppConfigService } from './config/app-config.service.js';

export const API_PREFIX = 'api';
export const DOCS_PATH = `${API_PREFIX}/docs`;

/**
 * Everything that must be identical in production and in e2e tests: the
 * `/api` prefix, URI versioning (`/api/v1/...`), CORS and the Swagger docs.
 * Call it on the app before `listen()` / `init()`.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfigService);

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
