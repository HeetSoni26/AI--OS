# Database Migration Runbook

## Connection roles

- `DATABASE_URL`: pooled application connection, typically the Supabase pooler/PgBouncer URL.
- `DIRECT_URL`: direct PostgreSQL connection used by Prisma migrations, seed, owner bootstrap, and administrative checks.

Prisma CLI reads untracked root `.env`; Next.js reads untracked `apps/web/.env.local`. Never run production migration from an untrusted preview deployment or print either URL.

## Commands

```bash
npm run db:format
npm run db:validate
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run db:status
npm run test:integration
```

`db:migrate:dev` is local-development-only. It may create a shadow database and must never target production.

## Local or ephemeral validation

1. Provision PostgreSQL 16+ with pgvector available.
2. Copy `.env.example` to untracked root `.env`; set both database URLs to the ephemeral database.
3. Run `npm ci`, `npm run db:validate`, and `npm run db:migrate:deploy`.
4. Run `npm run db:seed` twice; both runs must succeed.
5. Run `npm run db:migrate:deploy` again and `npm run db:status`; the second deploy must be a no-op/current state.
6. Set `TEST_DATABASE_URL` and run `npm run test:integration`.
7. Verify vector extension/query, full-text query, FKs, one-primary-contact, one-active-owner, nonnegative values, money precision, webhook dedupe, outbox atomicity, and seed inventory.
8. Destroy the ephemeral database after evidence is recorded.

CI performs this sequence with `pgvector/pgvector:pg16` in the `database` job.

## Supabase Storage

After the Prisma baseline and owner bootstrap are ready, apply `supabase/migrations/20260731000200_private_storage.sql` using the Supabase migration pipeline. This script is Supabase-specific because it references `auth.uid()` and `storage.*`.

## Production sequence

1. Confirm backup/PITR and review the exact migration hash.
2. Rehearse on a current-size staging clone.
3. Review extension permissions, locks, backfills, and indexes.
4. Pause workers that dispatch external effects.
5. Apply with `DIRECT_URL` using `npm run db:migrate:deploy` from a controlled migration job.
6. Run `npm run db:status` and nonsensitive readiness checks.
7. Apply compatible Supabase migrations where required.
8. Deploy the compatible application version.
9. Resume workers and monitor errors, latency, saturation, outbox lag, and webhook failures.

Do not let arbitrary preview deployments run migrations. The Vercel workflow requires a separately configured and reviewed migration stage before production promotion.

## Index/backfill/lock policy

The baseline targets an empty database, so GIN/HNSW indexes are created normally. Later large-table indexes use separate reviewed migrations and `CREATE INDEX CONCURRENTLY` when appropriate. New required fields follow expand → backfill → validate → contract. Do not combine an unbounded row rewrite with an application deployment.

## Recovery

Prefer a forward fix. If an uncommitted migration fails in an ephemeral database, recreate it. The baseline has no destructive down migration. Production restore requires Supabase PITR/backup and verification of audit, outbox, webhook, and external-provider reconciliation before work resumes.

See `migration-validation-2026-07-31.md` for the current artifact hash and local/live evidence boundary.
