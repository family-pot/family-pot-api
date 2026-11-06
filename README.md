# Family Pot — API

Backend for [Family Pot](https://github.com/family-pot). A REST API built with NestJS that
handles recipients, transfers, recurring-transfer reminders, cost-comparison calculations, and
(from milestone M4) read-only Stellar verification.

Shared product docs, architecture, roadmap and ADRs live in
[family-pot-docs](https://github.com/family-pot/family-pot-docs) — read that first.

## Status

Early scaffold. Features are built incrementally through GitHub issues. See the roadmap in
family-pot-docs.

## Tech stack

- NestJS, TypeScript
- PostgreSQL
- REST (OpenAPI/Swagger docs generated from the API)
- Vitest or Jest for tests, ESLint, Prettier
- Stellar JS SDK, read-only Horizon access — from milestone M4

There is no Soroban/Rust contract in this repo. See
[family-pot-contracts](https://github.com/family-pot/family-pot-contracts) and ADR 0001 in
family-pot-docs for why, and when that could change.

## Rules for financial code

- Never use floating point for money or exchange rates.
- Every calculation has tests, including rounding and edge cases.
- No fabricated exchange rates, fees, savings, or transaction statuses.
- Every value returned by the API carries a provenance: `user-entered`, `calculated`,
  `estimated`, or `verified`.
- This service never requests, stores, or logs a Stellar secret key. Signing happens in the
  user's own wallet; this API only builds unsigned transactions and verifies submitted ones.

## Quick start

Requirements: Node 22+, pnpm, Docker (for Postgres).

```bash
git clone https://github.com/family-pot/family-pot-api.git
cd family-pot-api
pnpm install
cp .env.example .env.local
docker compose up -d db
pnpm start:dev        # http://localhost:4000
```

Run everything CI runs:

```bash
pnpm check   # format:check, lint, typecheck, test, build
```

`pnpm check` is the same command CI runs; the GitHub Actions workflow uses a frozen
lockfile on Node 22.

Once the server is running (default port `4000`):

| URL | What |
|---|---|
| `http://localhost:4000/api/v1/health` | Health check, returns `{ "status": "ok" }` |
| `http://localhost:4000/api/docs` | Swagger UI (JSON at `/api/docs-json`) |

All endpoints live under the `/api/v1` prefix. Browsers may only call the API from the origins listed in `CORS_ORIGIN` (credentials are allowed for those origins; with an empty list no cross-origin access is granted).

## Environment variables

Configuration is loaded from `.env.local` and `.env` (in that order), validated once at
startup, and exposed through the typed `AppConfigService`. The process exits non-zero and
lists every invalid variable before it starts listening.

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `4000` | HTTP port, an integer from 1 to 65535 |
| `NODE_ENV` | No | `development` | `development`, `test` or `production` |
| `DATABASE_URL` | Yes | — | Postgres URL, for example `postgres://user:password@localhost:5432/family_pot` |
| `DATABASE_URL_TEST` | No | — | Postgres URL used by integration tests |
| `DATABASE_SSL` | No | `false` | `true` to require TLS for the database connection |
| `CORS_ORIGIN` | No | empty | Comma-separated allowed browser origins such as `http://localhost:3000` |
| `JWT_ACCESS_SECRET` | Yes | — | At least 32 characters; generate a random value and keep it secret |
| `JWT_ACCESS_TTL` | No | `15m` | Access-token lifetime such as `30s`, `15m`, `1h` or `7d` |
| `REFRESH_TOKEN_TTL_DAYS` | No | `7` | Refresh-token lifetime in whole days (1–365) |
| `REFRESH_COOKIE_SAME_SITE` | No | `strict` | `strict`, `lax` or `none`. See "Refresh token transport" below |
| `ALLOW_REMOTE_DB_RESET` | No | `false` | Allows destructive resets outside local development |

For local Postgres, the `DATABASE_URL` usually looks like
`postgres://family_pot:family_pot@localhost:5432/family_pot`. Never commit `.env*` files;
only `.env.example` belongs in the repository.

## Database and migrations

The API uses TypeORM with Postgres. `synchronize` is permanently off: schema changes only happen through migrations.

### Create a local database

1. Install Postgres 16 or newer locally (Docker is optional).
2. Create a role and an empty database, with `psql` or pgAdmin:
   - **psql:** `createuser --pwprompt family_pot` then `createdb -O family_pot family_pot` and `createdb -O family_pot family_pot_test`
   - **pgAdmin:** right-click *Login/Group Roles* > *Create* (name `family_pot`, set a password, enable *Can login*); right-click *Databases* > *Create* (name `family_pot`, owner `family_pot`). Repeat for `family_pot_test`.
3. Build the URL as `postgres://<user>:<password>@<host>:<port>/<database>` and put it in `.env.local`:

```bash
DATABASE_URL=postgres://family_pot:your-password@localhost:5432/family_pot
DATABASE_URL_TEST=postgres://family_pot:your-password@localhost:5432/family_pot_test
```

For Neon or Render use the connection string from their dashboard and set `DATABASE_SSL=true`.
If the database is unreachable the app stops at startup with a message naming the host and database (never the password).

### Migrations

| Command | What it does |
|---|---|
| `pnpm migration:run` | Apply pending migrations |
| `pnpm migration:generate src/database/migrations/<Name>` | Generate a migration from entity changes |
| `pnpm migration:revert` | Undo the last migration (guarded) |
| `pnpm db:test:reset` | Drop everything in `DATABASE_URL_TEST` and re-migrate (guarded) |

Entities live in `*.entity.ts` files and extend `AppBaseEntity` (uuid `id`, `createdAt`, `updatedAt`). Commit an entity and its migration together, and never edit a merged migration.

### Destructive-script guard

`migration:revert`, `db:test:reset` and any seed script refuse to run unless the database host is `localhost`, `127.0.0.1` or `::1`, or `ALLOW_REMOTE_DB_RESET=true`. A seed script must run `node dist/database/guard-cli.js seed &&` first (or call `assertDestructiveAllowed`).

### Tests

Tests never read `DATABASE_URL`: `test/setup.ts` replaces it with `DATABASE_URL_TEST`. `pnpm test:e2e` needs Postgres reachable there; CI runs it against a Postgres 16 service container (`.github/workflows/integration.yml`).

## Authentication

### `POST /api/v1/auth/register`

Body `{ "email": "...", "password": "..." }`; returns `201` with `{ "id", "email" }` only. Documented in Swagger at `/api/docs`.

Password policy and handling:

- Length **12 to 128** characters. The maximum stops a huge password from being used to burn CPU and memory while hashing.
- Hashed with **argon2id** (the `argon2` package) at the OWASP minimum configuration: 19 MiB memory, 2 iterations, 1 lane. The parameters are encoded in each stored hash, so they can be raised later and old hashes keep verifying.
- Only the hash is stored (`users.passwordHash`). Passwords and hashes are never returned or logged.
- Emails are trimmed and stored lowercase, and are unique, so registration is case-insensitive.
- A duplicate email returns `409` with the same generic message as any other registration conflict (`Registration could not be completed.`), and the password is hashed before the lookup so a duplicate costs the same time as a new account.
- Unknown request fields are rejected with `400`.

### `POST /api/v1/auth/login` and `GET /api/v1/auth/me`

`POST /api/v1/auth/login` with `{ "email", "password" }` returns `200` with `{ "accessToken", "tokenType": "Bearer", "expiresIn" }`. The access token is a JWT (HS256) signed with `JWT_ACCESS_SECRET`, valid for `JWT_ACCESS_TTL` (default `15m`), carrying only the user id as `sub`. Refresh tokens are a separate issue.

A wrong password and an unknown email return the identical `401` (`Invalid email or password.`). Both paths run one argon2 verification (an unknown email verifies against a throwaway hash), so the response time does not reveal whether an email is registered.

`GET /api/v1/auth/me` returns `{ id, email }` for the bearer token in the `Authorization` header. In Swagger, click **Authorize** and paste the token.

### Protecting an endpoint

Import `AuthModule` in the module that declares your controller and add one decorator:

```ts
@Auth()
@Controller({ path: 'recipients', version: '1' })
export class RecipientsController {
  @Get()
  list(@CurrentUser() user: AuthUser) {
    // user.id is the authenticated user
  }
}
```

`@Auth()` can go on a controller or on a single route. Without a valid token the response is `401`. Missing, malformed, expired, tampered or wrongly signed tokens (including `alg: none`), and tokens for users that no longer exist, are all rejected the same way. The secret is read only from configuration (`AppConfigService`), and the algorithm is pinned to HS256.

### Auth flow: refresh and logout (ADR 0005)

1. `POST /api/v1/auth/login` returns a short-lived **access token** in the JSON body (keep it in memory) and sets a **refresh token** in an `httpOnly` cookie (`refresh_token`, `Path=/api/v1/auth`, `Secure` in production, lifetime `REFRESH_TOKEN_TTL_DAYS`). Each login starts a new token *family*.
2. When the access token expires, `POST /api/v1/auth/refresh` (the cookie is sent automatically) returns a new access token and **rotates** the refresh token: a new cookie replaces the old one, and the old token is marked as replaced. A refresh token therefore works **once**.
3. **Reuse detection:** presenting a token that was already rotated means it was probably stolen or replayed, so the **whole family is revoked**: the session ends everywhere it was copied, including the newest legitimate token. The caller gets a `401` and must log in again.
4. `POST /api/v1/auth/logout` revokes the whole family of the cookie's token, clears the cookie and always returns `204` (it reveals nothing about whether a token was valid).
5. Only a SHA-256 hash of the token is stored (`refresh_tokens.tokenHash`); raw tokens are never stored or logged. Unknown, expired, revoked and reused tokens all get the same generic `401`. Expired and revoked rows are not pruned yet.

**Concurrent refresh with the same token (chosen behaviour):** requests are serialized on the token's row. The first one rotates the token; the second then presents an already-rotated token, which counts as reuse, so it gets `401` and the family is revoked. Two tabs refreshing at the very same moment can therefore log the user out; the web app should serialize its refresh calls. This strict behaviour is covered by a test. A short grace window for the previous token would be friendlier but weakens reuse detection, so it is not implemented.

#### Refresh token transport

ADR 0005 recommends an httpOnly `Secure` cookie for the refresh token, with Vercel proxying `/api/*` to this API so the cookie is first-party. That is what is implemented. The maintainer decision on transport is still open in the ADR, and the details of the proxy have not been verified. The cookie's `SameSite` is configurable for that reason: `strict` (default) suits the first-party proxy; `lax` also allows top-level navigations; `none` is for a cross-site API and is always sent with `Secure` (needs HTTPS and a matching `CORS_ORIGIN`, which already allows credentials). Because the refresh and logout endpoints rely on a cookie, `SameSite` is also the CSRF protection for them.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the shared guidelines in family-pot-docs. Issues are
sized for Drips Wave (Trivial 100 / Medium 150 / High 200 points).

## Security

See [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).