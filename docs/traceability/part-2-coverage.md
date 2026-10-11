# Part 2 SRS Coverage Record

## Scope implemented

Part 2 covers SRS Section 7 data model/relationships, Section 7.4 storage strategy, Section 8.1 API principles, and Section 11.2 environment contract. It establishes the shared controls required by NFR-PO-001-004, NFR-M-002/003/006, SEC-Z-003-005, SEC-E-002-004, SEC-API-001-004, and SEC-C-001/003.

| Requirement area | Evidence |
|---|---|
| Relational SRS entities and support records | `packages/data/prisma/schema.prisma`, generated data dictionary, support-entity rationale |
| PostgreSQL 16+, UUID, timestamptz, Decimal, FKs, checks | Reviewed initial migration and static/live database suites |
| pgvector and semantic search | Three `vector(1536)` fields, HNSW indexes, `findSimilarKnowledge` |
| Full-text search | Nine GIN expression indexes and live query integration test |
| Storage and Redis boundaries | `storage-and-redis.md`, `storage.ts`, Storage policy migration |
| Owner-only access and credentials | `OwnerAccount`, production allowlist guard, Vault references, AES-256-GCM fallback |
| API v1, auth, validation, envelopes, pagination | `packages/contracts/src/api.ts`, `apps/web/src/lib/api/*` |
| Rate/body/CORS/CSRF limits | Authenticated API wrapper and route-level unit/E2E tests |
| OpenAPI drift | `/api/openapi`, route registry, `npm run openapi:validate` |
| Audit and correlation | `AuditEvent`, redacted drafts, append protection, durable transaction helper |
| Outbox/idempotency/replay | `OutboxEvent`, operation fingerprints, atomic integration test |
| Webhook deduplication and retention | Connection-scoped unique key, signature helper, payload scrubber |
| Archive/recovery/deletion | Seven-day clock helpers, `DeletionRequest`, timeline/active-request checks |
| Export portability | Export manifest, JSON/CSV helpers, `ExportJob` |
| Synthetic graph fixtures | Deterministic seed with all ten graph node types |
| Migration safety | Migration runbook, lock file, checksum record, CI pgvector job |

## Evidence boundary

All static, unit, contract, build, browser, accessibility, audit, and bundle checks are local evidence. Live PostgreSQL/pgvector and Supabase Storage evidence remains credential/runtime dependent and is explicitly gated in CI/runbooks; it is not marked locally passed.
