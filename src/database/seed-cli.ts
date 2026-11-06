import { pathToFileURL } from 'node:url';
import type { DataSource } from 'typeorm';
import { buildCliDataSource } from './data-source.js';
import { assertDestructiveAllowed } from './destructive-guard.js';
import { loadEnvFiles } from './load-env.js';
import { seedDatabase, type SeedResult } from './seed.js';
import { DEMO_USER } from './seed-data.js';

/**
 * `pnpm seed`. Runs the same destructive-script guard as migration:revert and
 * the test reset (ADR 0003) BEFORE connecting: it refuses unless the host is
 * localhost, 127.0.0.1 or ::1, or ALLOW_REMOTE_DB_RESET=true.
 */
export async function runSeed(
  env: NodeJS.ProcessEnv = process.env,
  // Overridable so tests can supply entity classes instead of compiled files.
  createDataSource: (url: string) => DataSource = buildCliDataSource,
): Promise<SeedResult> {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to seed the database.');
  }
  assertDestructiveAllowed({
    action: 'seed',
    databaseUrl,
    allowRemote: env.ALLOW_REMOTE_DB_RESET === 'true',
  });

  const dataSource = createDataSource(databaseUrl);
  await dataSource.initialize();
  try {
    return await seedDatabase(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

// Run only when executed directly (node dist/database/seed-cli.js), not when imported by tests.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  loadEnvFiles();
  try {
    const result = await runSeed();
    console.log(
      `Seeded: user ${result.user}${result.passwordReset ? ' (demo password reset)' : ''}, ` +
        `${result.recipientsCreated} recipients and ${result.transfersCreated} transfers created.`,
    );
    console.log(
      `Demo login (development only): ${DEMO_USER.email} / ${DEMO_USER.password}`,
    );
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
