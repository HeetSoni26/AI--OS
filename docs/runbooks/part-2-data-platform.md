# Part 2 Data/API Platform Operations

## Environment boundaries

- Root `.env` (untracked): Prisma CLI, migration, seed, and owner bootstrap.
- `apps/web/.env.local` (untracked): Next.js runtime.
- `DATABASE_URL`: pooled application connection.
- `DIRECT_URL`: direct migration/admin/seed connection.
- Never print either URL or commit either environment file.

## Clean setup

```bash
npm ci
copy .env.example .env
copy apps\web\.env.example apps\web\.env.local
npm run db:validate
npm run db:migrate:deploy
npm run db:seed
npm run db:bootstrap-owner
npm run test:integration
npm run check
```

Apply `supabase/migrations/20260731000200_private_storage.sql` through the Supabase migration pipeline after the owner table exists. Do not apply the Supabase-specific Storage migration to plain PostgreSQL.

## API surface

- Public liveness: `GET /api/health`
- Public OpenAPI 3.1: `GET /api/openapi`
- Owner readiness: `GET /api/v1/health`
- Cookie-session logout: `POST /api/auth/logout`

Owner APIs accept a Supabase bearer token or server cookie session. Bearer tokens are validated with Supabase `getUser(token)`. Production requires `AIOS_OWNER_EMAIL`; a valid non-owner account is rejected. Cookie-authenticated mutations also require a trusted origin.

All `/api/v1` handlers must use `withAuthenticatedApi`, which enforces CORS, auth, per-session 100/minute throttling, request/correlation IDs, a 10 MiB default body limit, no-store responses, and normalized errors. Explicit upload routes use the 100 MiB contract and must stream directly to scanning/storage rather than buffer the full file.

## Health interpretation

Readiness returns only booleans for auth, database, rate limit, and platform security. It does not expose URLs, credentials, bucket names, versions, or raw connection errors. A degraded response is expected until live dependencies and secrets are configured.

## Required live services

- Supabase project with Auth, PostgreSQL 16+, pgvector, Vault, and Storage.
- Upstash Redis for production login/API throttling; later queue parts may use a Redis endpoint compatible with BullMQ.
- `APPLICATION_ENCRYPTION_KEY` and `WEBHOOK_SIGNING_SECRET`, each at least 32 random characters.
- Provider APIs are not required for Part 2 acceptance; configure them only in their owning vertical slice.
