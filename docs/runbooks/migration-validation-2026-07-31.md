# Part 2 Migration Validation Record - 2026-07-31

## Artifact

- Migration: `packages/data/prisma/migrations/20260731000100_initial_data_platform/migration.sql`
- SHA-256: `9c99204297c75f3b779f2a199bef26334de19671d8a071d7846391ab418b0e12`
- Prisma: 7.9.1
- Target: PostgreSQL 16+ with pgvector
- Inventory: 65 models/tables, 60 enums, 3 `vector(1536)` fields, 3 partial HNSW cosine indexes

## Completed without live credentials

- `prisma format`: passed.
- `prisma validate`: passed.
- `prisma generate`: passed.
- Static schema/migration manifest tests: passed.
- TypeScript and unit/contract tests: passed at the time of this record.
- Migration SQL review confirms extension setup, full-text indexes, vector indexes, primary-contact uniqueness, single-active-owner uniqueness, scope checks, money/range checks, lifecycle checks, database UUID/update defaults, and append-oriented audit protection.

## Credential/runtime-dependent gate

No `DATABASE_URL`/`DIRECT_URL`, Docker, Podman, or local `psql` runtime was available in the implementation environment. Therefore the following are **not represented as locally passed**:

- applying migration to a clean live PostgreSQL/pgvector database;
- seeding twice against that database;
- vector insert/cosine query;
- full-text query plan;
- live FK/check/partial-unique/decimal tests;
- migration deploy no-op on a seeded schema;
- Supabase Storage bucket/policy application.

The CI `database` job provisions `pgvector/pgvector:pg16` and executes clean migrate → seed twice → deploy again → status → integration tests. A release requires a successful run of that job or equivalent recorded evidence.

## Lock and backfill considerations

The initial migration creates a new schema and is intended for an empty database. HNSW and GIN index creation is non-concurrent because no production rows should exist yet. If these indexes are introduced to an already-populated environment, use a separate reviewed forward migration with `CREATE INDEX CONCURRENTLY`, capacity estimates, and no surrounding transaction where PostgreSQL requires it.

The baseline has no table-rewrite backfill. Later required-column additions use expand/backfill/validate/contract sequencing.

## Recovery

No destructive down migration is provided. Before production migration, verify backup and PITR. Prefer a forward fix. If the baseline fails before commit in an ephemeral database, recreate it. If production restore is necessary, restore through Supabase PITR and verify audit, outbox, and webhook consistency before workers resume.
