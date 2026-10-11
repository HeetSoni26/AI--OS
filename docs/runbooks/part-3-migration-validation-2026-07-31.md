# Part 3 Migration Validation Record - 2026-07-31

## Artifact

- Migration: `packages/data/prisma/migrations/20260731000300_part_3_client_operations/migration.sql`
- SHA-256: `a61862327778bd04ddea73106725124424a4b27e0d1a6aadec7f208dbfc9d7ef`
- Prisma: 7.9.1
- Target: the migrated Part 2 PostgreSQL 16+ schema with `pgvector`
- Purpose: client-operation relational hardening, Gmail ingestion state, graph projections, idempotency, work/time invariants, and delivery enforcement

## Live upgrade evidence

The migration was applied to the configured Supabase PostgreSQL project as a forward migration. On 2026-07-31 the following passed against that live database:

- `npm run db:status`: both repository migrations applied; schema up to date.
- `npm run db:validate`: Prisma schema valid.
- `npm run db:seed` rerun behavior: deterministic fixtures remained idempotent.
- `npm run test:integration`: 15 tests passed across the platform and Part 3 client-operation suites.
- Live checks covered extension/index inventory, 1,536-dimensional vector cosine queries, full-text planning, partial uniqueness, money precision, referential constraints, webhook deduplication, transaction rollback, primary-contact serialization, stable client cursors, trigram typo search, filtered totals, project delivery gating, manual-time exclusion, derived agent-run time, Gmail deduplication, graph projections, audit/outbox records, and seven-day deletion recovery expiry.

The related Supabase Storage migration `supabase/migrations/20260731000400_client_logo_policy.sql` was also applied and verified to keep `client-logos` private while limiting it to 5 MiB PNG/JPEG/WebP objects.

## Expand and backfill review

The migration uses expand/backfill/tighten sequencing:

1. Add nullable compatibility columns and new tables.
2. Backfill normalized contact email, communication participants, project status history, owner identities, and client/contact graph projections.
3. Create supporting indexes.
4. Add compound foreign keys and reviewed uniqueness/check/exclusion constraints.
5. Add derived-hours, delivery-gate, email-normalization, and update-time triggers.

Backfills are idempotent where replay is possible (`ON CONFLICT DO NOTHING` or `NOT EXISTS`). Existing project hours are recomputed from durable time entries.

## Lock and capacity considerations

This migration performs ordinary index creation and table updates on existing Part 2 tables. Those statements may take `SHARE` or row/table locks and are suitable for the current single-owner pre-production dataset. Before applying the same change pattern to a materially larger production dataset:

- measure row counts and dead tuples;
- split high-volume backfills into bounded batches;
- create trigram and other large indexes with reviewed `CREATE INDEX CONCURRENTLY` forward migrations where PostgreSQL transaction rules permit;
- set statement and lock timeouts;
- pause mutation workers during final constraint validation;
- verify disk headroom for index build and WAL growth.

## Recovery and forward fixes

No destructive down migration is provided. Before future production migration, verify Supabase PITR/backup recency and stop workers that could consume new schema state. Prefer a reviewed forward fix for constraint, trigger, or index defects. If restoration is unavoidable, restore through Supabase PITR, then verify:

- audit/outbox ordering and unprocessed claims;
- deletion and Gmail checkpoints;
- graph projection/source-record consistency;
- Storage metadata/object consistency;
- migration table status before workers resume.
