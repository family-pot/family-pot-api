import { loadEnvFiles } from '../src/database/load-env.js';

// Tests only ever talk to DATABASE_URL_TEST. DATABASE_URL is overwritten so
// that nothing under test can reach the development or shared database.
loadEnvFiles();
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgres://family_pot:family_pot@localhost:5432/family_pot_test';
process.env.JWT_ACCESS_SECRET ??= 'test-secret-that-is-at-least-32-characters';
process.env.CORS_ORIGIN = 'http://localhost:3000';
// Generous limits so suites that log in many times do not trip rate limiting.
// test/hardening.e2e-spec.ts lowers them for its own app.
process.env.RATE_LIMIT_GLOBAL_LIMIT = '100000';
process.env.RATE_LIMIT_AUTH_LIMIT = '100000';
