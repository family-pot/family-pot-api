import { readdirSync } from 'node:fs';
import { Test } from '@nestjs/testing';
import { DataSource, type MigrationInterface } from 'typeorm';
import { AppConfigService } from '../src/config/app-config.service.js';
import { AppConfigModule } from '../src/config/app-config.module.js';
import { buildCliDataSource } from '../src/database/data-source.js';
import {
  DatabaseConnectionError,
  DatabaseModule,
} from '../src/database/database.module.js';
import { assertDestructiveAllowed } from '../src/database/destructive-guard.js';

// Requires a reachable Postgres at DATABASE_URL_TEST (see .env.example).
//
// E2E files share one database and run one after another (see
// vitest.config.e2e.ts). This suite wipes the database to prove migrations work
// from scratch, and always leaves it fully migrated for the suites that follow.

/** Every migration class in src/database/migrations, loaded from the TS sources. */
async function loadMigrations(): Promise<(new () => MigrationInterface)[]> {
  const dir = new URL('../src/database/migrations/', import.meta.url);
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.ts'))
    .sort();
  const classes: (new () => MigrationInterface)[] = [];
  for (const file of files) {
    const module = (await import(
      `../src/database/migrations/${file}`
    )) as Record<string, unknown>;
    classes.push(
      ...(Object.values(module).filter(
        (value) => typeof value === 'function',
      ) as (new () => MigrationInterface)[]),
    );
  }
  return classes;
}

describe('Database (integration)', () => {
  let dataSource: DataSource;
  let migrations: (new () => MigrationInterface)[];

  beforeAll(async () => {
    const url = process.env.DATABASE_URL!;
    // This test wipes the schema, so it uses the same guard as the scripts.
    assertDestructiveAllowed({
      action: 'e2e:database',
      databaseUrl: url,
      allowRemote: process.env.ALLOW_REMOTE_DB_RESET === 'true',
    });
    migrations = await loadMigrations();
    dataSource = buildCliDataSource(url, { migrations });
    await dataSource.initialize();
  });

  afterAll(async () => {
    // Leave the shared test database migrated for the other suites.
    await dataSource.runMigrations();
    await dataSource.destroy();
  });

  it('connects', async () => {
    await expect(dataSource.query('SELECT 1 AS ok')).resolves.toEqual([
      { ok: 1 },
    ]);
  });

  it('runs every migration on a clean database and reverts them all', async () => {
    await dataSource.dropDatabase();

    const applied = await dataSource.runMigrations();
    expect(applied).toHaveLength(migrations.length);
    expect(applied.map((m) => m.name)).toContain('Baseline1700000000000');
    await expect(
      dataSource.query("SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'"),
    ).resolves.toHaveLength(1);

    for (let i = 0; i < migrations.length; i++) {
      await dataSource.undoLastMigration();
    }
    await expect(dataSource.query('SELECT * FROM migrations')).resolves.toEqual(
      [],
    );
  });

  it('fails with a clear error when the database is unreachable', async () => {
    const moduleRef = Test.createTestingModule({
      imports: [AppConfigModule, DatabaseModule],
    })
      .overrideProvider(AppConfigService)
      .useValue({
        databaseUrl: 'postgres://u:secretpw@127.0.0.1:1/nope',
        databaseSsl: false,
      })
      .compile();

    const error = await moduleRef.then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DatabaseConnectionError);
    expect((error as Error).message).toContain('127.0.0.1:1/nope');
    expect((error as Error).message).not.toContain('secretpw');
  }, 20_000);
});
