# Part 4 Migration Validation - 20260801000100_part_4_graph_foundation

- **Applied:** against the already-configured Supabase PostgreSQL database (existing project workflow)
- **Artifact SHA-256:** `22d72b6445f1af9275589619a37eb34b01fb283851ec9332e99b6d17e2eefbe8`

## What the migration does

1. Creates `GraphEdgeProvenance` (`system_projection`, `owner_explicit`) and adds a required `provenance` column with `owner_explicit` default.
2. Backfills Part 3 projection edges (`metadata ? 'projectionVersion'`) as `system_projection`; other pre-existing rows become `owner_explicit` rather than being silently claimed by the system.
3. Documents the full-lifecycle natural key: soft-deleted owner edges are **restored in place** on recreate so the unique key is not violated.
4. Guards and provisions exactly nine deterministic hub nodes (UUIDv5, URL namespace, `hub:<slug>` stable keys, placement metadata). If any reserved ID or stable key is claimed by an unrelated row, the migration aborts instead of overwriting it.
5. Adds lifecycle indexes (`graph_nodes_lifecycle_idx`, `graph_edges_lifecycle_idx`, live endpoint lookups) and a partial GIN trigram index `graph_nodes_live_label_trgm_idx` on live labels only.

## Validation evidence

- Prisma `validate` passes (`npm run check`, 2026-08-03).
- `npm run db:status` - “Database schema is up to date!” with all three migrations on the configured Supabase database.
- `packages/data/src/graph/service.integration.test.ts` runs against the live database: hub materialization, enriched projections, directory/cursor/search/detail reads, owner-edge create/audit/outbox/soft-delete/restore, projected-edge delete rejection, drift detection, and projection rebuild - 4/4 passed within the 19-test integration run.
- `packages/data/src/database.integration.test.ts` verifies migrated schema, extensions, indexes, and fixture invariants - passed in the same run.

## Lock and index impact

- New enum + nullable→backfilled→NOT NULL column on `graph_edges` executed on a low-volume table; lock window was trivial on the current dataset. On a large table, the same pattern must be rehearsed on a staging clone per the generic runbook.
- All new indexes are small and non-concurrent by design for this low-volume state; future large-table index work must use `CREATE INDEX CONCURRENTLY`.

## Rollback / forward-fix guidance

There is no shipped down migration; recovery is forward-fix plus Supabase PITR/backup. If a hub row is ever damaged, re-running the deterministic upserts (or `rebuildCurrentDomainProjections`) restores hubs and current-domain projections without touching owner-explicit edges. Owner edges are never deleted by rebuild - only source-projection nodes/edges are reconciled.
