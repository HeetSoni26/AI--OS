# ADR-002: PostgreSQL, pgvector, durable events, and API platform

- **Status:** Accepted
- **Date:** 2026-07-31
- **SRS scope:** Sections 2.5, 3.1-3.5, 7, 8.1, 9, 11; NFR-PO; NFR-M; SEC-Z/E/API/C

## Context

The product requires portable relational data, semantic search, realtime graph projections, asynchronous agents, external webhooks, complete exports, delayed deletion, and owner-only access. Redis is required for queues, caching, sessions, and rate limiting but may not be the only durable location of business state.

## Decision

PostgreSQL 16+ is the durable system of record and Prisma manages typed access and migration history. The `vector` extension stores 1,536-dimensional embeddings. Flexible provider metadata may use JSONB, while status, money, dates, ownership, and query-critical values remain typed relational columns.

Business mutations, redacted audit evidence, and external-effect intents use one transaction with an outbox record. Webhook provider event IDs are unique within each integration connection and remain replay-auditable. Credentials are represented only by Vault references; raw secrets are never persisted in ordinary application tables. AES-256-GCM is the documented application-level fallback for values a deployment cannot store in Vault.

Public application APIs use `/api/v1`, Supabase bearer authentication, Zod validation, cursor pagination, `{ data, meta }` success envelopes, `{ error }` errors, correlation IDs, request limits, and an OpenAPI 3.1 contract. Archive and deletion are separate: archival is reversible; permanent deletion is delayed for seven days and executed from an auditable plan.

## Consequences

- `DATABASE_URL` targets the pooled application connection; `DIRECT_URL` targets migrations, seed, owner bootstrap, and administrative checks.
- The initial migration enables `vector`/`pgcrypto`, creates 65 tables and 60 enums, and applies partial/functional indexes and database constraints that Prisma cannot express.
- A graph-node registry gives every edge a referential endpoint, including virtual tool, human, decision, and hub nodes.
- One active `OwnerAccount` binds the permitted Supabase auth UUID to database and Storage policy checks.
- Vector fields use Prisma's `Unsupported("vector(1536)")` representation and raw SQL for similarity operations.
- Migrations must be tested in an isolated PostgreSQL/pgvector environment before production.
- A database outage can disable writes, but Redis is never used to fabricate or reconstruct committed business truth.
- Live migration verification is blocked until a PostgreSQL/pgvector URL is provided or a local database runtime is available; static schema validation does not substitute for that release gate.
