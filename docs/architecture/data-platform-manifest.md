# Data Platform Manifest

## Durable systems

- PostgreSQL 16+/Supabase: all business records, audit evidence, external-effect intents, webhook receipts, exports, deletion plans, schedules, and file metadata.
- Supabase Storage: private binary objects and generated artifacts.
- Redis: disposable cache, limits, queue dispatch, locks, and short-lived sessions only.

## Search

- Three `vector(1536)` fields: agent memory, current knowledge, and knowledge versions.
- Partial HNSW cosine indexes exclude null embeddings and tombstones.
- Full-text GIN expression indexes cover clients, communications, projects, tasks, current/versioned knowledge, CRM/sourced leads, and SOPs.
- Vector queries use `<=>` and the same cosine operator class as the indexes.

## Safety guarantees

- UUID primary keys and timezone-aware timestamps.
- Decimal money/cost fields with nonnegative checks.
- One live primary contact per client.
- One active owner.
- One active deletion request per entity.
- Agency/client scope consistency.
- Typed graph registry with referential edges.
- Connection-scoped webhook deduplication.
- Transactional audit + outbox helper.
- Seven-day deletion timeline checks.
- Private signed Storage policy and Vault-reference-only credential metadata.

See `support-entity-rationale.md`, `data-dictionary.md`, `er-overview.md`, and ADR-002 for details.
