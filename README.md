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

\`\`\`bash
git clone https://github.com/family-pot/family-pot-api.git
cd family-pot-api
pnpm install
cp .env.example .env.local
docker compose up -d db
pnpm start:dev        # http://localhost:4000
\`\`\`

Run everything CI runs:

\`\`\`bash
pnpm check   # format:check, lint, typecheck, test, build
\`\`\`

API docs available at `/api/docs` (Swagger) once the server is running.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the shared guidelines in family-pot-docs. Issues are
sized for Drips Wave (Trivial 100 / Medium 150 / High 200 points).

## Security

See [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).
