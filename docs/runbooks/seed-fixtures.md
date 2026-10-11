# Synthetic Seed Fixtures

## Purpose

`npm run db:seed` creates deterministic development/test records only. Names use “Synthetic,” email uses the reserved `.invalid` domain, money/cost values are zero, and no record claims actual business performance.

## Preconditions

1. Copy root `.env.example` to untracked `.env`.
2. Set `DIRECT_URL` to an isolated PostgreSQL 16+/pgvector database.
3. Run `npm run db:migrate:deploy`.

## Run

```bash
npm run db:seed
npm run db:seed
```

The second run must succeed without increasing deterministic fixture counts.

## Coverage

Fixtures include:

- active client and one primary contact;
- planning project and todo task;
- idle analyst agent and config version;
- searchable knowledge with a synthetic 1,536-dimensional unit vector;
- SOP, draft zero-value invoice, new CRM lead, and low-priority notification;
- unconfigured integration and connection-scoped webhook receipt;
- audit event, pending outbox intent, export job, and future deletion request;
- exactly one `GraphNode` for each SRS type: client, agent, tool, SOP, human, task, decision, knowledge, finance, and hub;
- nine reference edges from the synthetic hub.

The fixture does not create a production owner, credentials, provider tokens, external effects, invoices with revenue, or real client data.

## Owner bootstrap

Create the Supabase user first, then set the user UUID and email in the untracked root `.env`:

```text
AIOS_OWNER_AUTH_SUBJECT=<Supabase auth.users.id UUID>
AIOS_OWNER_EMAIL=<owner email>
AIOS_OWNER_DISPLAY_NAME=<display name>
```

Run:

```bash
npm run db:bootstrap-owner
```

The database enforces only one active owner. The development bypass identity must never be bootstrapped.

## Removal

Fixtures use fixed UUID prefixes `10000000-...` for domain records and `20000000-...` for graph nodes. Remove them only in an isolated development database using a reviewed cleanup migration/script; never run ad hoc deletion against production.
