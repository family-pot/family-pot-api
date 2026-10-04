# Contributing to family-pot-api

This is the backend repo. Shared contribution rules (branching, commits, financial-code rules,
Drips Wave sizing, which repo an issue belongs in) are in
[family-pot-docs/CONTRIBUTING.md](https://github.com/family-pot/family-pot-docs/blob/main/CONTRIBUTING.md) —
read that first.

## This repo, specifically

- NestJS, TypeScript, PostgreSQL, REST (OpenAPI/Swagger at `/api/docs`).
- Owns the database and all business logic. Owns Stellar read/verify calls from milestone M4.

## Rules for financial code (strict in this repo)

- Never use floating point for money or exchange rates.
- Every financial calculation needs tests, including rounding and edge cases.
- No fabricated exchange rates, fees, savings, or transaction statuses.
- Every value returned by the API carries a provenance: `user-entered`, `calculated`,
  `estimated`, or `verified`.
- Never request, store, or log a Stellar secret key. Build unsigned transactions only; signing
  happens in the user's own wallet.

## Local setup

\`\`\`bash
git clone https://github.com/family-pot/family-pot-api.git
cd family-pot-api
pnpm install
cp .env.example .env.local
docker compose up -d db
pnpm start:dev
\`\`\`

Before opening a PR:

\`\`\`bash
pnpm check   # format:check, lint, typecheck, test, build
\`\`\`

## Scope reminder

If your change needs a new UI or changes how something is displayed, that work belongs in
`family-pot-web` as a separate, linked issue — not in this repo.
