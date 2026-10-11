# AI Automation Agency OS - Architecture, Quality, and Release Gates

**Applies to:** All 12 implementation parts  
**Source authority:** SRS-AIOS-2026-001  
**Rule:** A recommended addition may strengthen an SRS requirement but never replace or weaken it.

## 1. Architectural baseline

### 1.1 System shape

Use the SRS-defined modular monolith: one Next.js application with clear domain packages for clients, graph, agents, chatbots, workflows, content, leads, CRM, finance, knowledge, notifications, and reporting. Keep HTTP handlers thin. Domain services own business rules, repositories own persistence, adapters own third-party behavior, and workers own asynchronous execution.

The deployment unit may be one application, but the dependency graph must remain explicit:

`UI → application/API → domain service → repository/adapter → PostgreSQL/Redis/external service`

Domain code must not import UI code or a provider SDK directly. Cross-domain communication should use typed service interfaces or durable domain events.

### 1.2 Required technology alignment

Retain the SRS choices unless an ADR proves a necessary compatibility substitution: Next.js 14+ App Router, React 18+, TypeScript 5+, Tailwind CSS 3+, shadcn/ui, TanStack Query 5+, Zustand, Framer Motion, React Hook Form, Zod, D3.js or Vis.js, Prisma 5+, PostgreSQL 16+/Supabase, pgvector, Upstash Redis, BullMQ, LangChain.js where useful, OpenAI SDK, Anthropic SDK, n8n/Make.com adapters, Stripe SDK, Supabase Storage/Realtime/Auth, Vercel, GitHub Actions, Sentry, and centralized logging.

Pin exact production dependency versions in the lockfile. “14+” and “latest” in the SRS mean compatible supported releases, not unbounded upgrades.

### 1.3 Domain module contract

Every domain module must have, as applicable:

- domain types and invariants;
- Zod command/query schemas;
- application services/use cases;
- repository interfaces and Prisma implementations;
- API route handlers under `/api/v1`;
- authorization and ownership guard;
- audit event emission;
- tests and fixtures;
- OpenAPI definitions;
- observability fields and error taxonomy;
- graph projection mapping when the entity is graph-visible.

### 1.4 Adapter contract

All external integrations use a unified adapter boundary with methods for connection test, credential reference, request, timeout, retry classification, idempotency, normalized errors, health status, and telemetry. Never spread provider SDK calls through page components or route handlers.

**Recommended Addition:** Maintain contract tests against provider sandboxes and deterministic fake adapters for automated tests. Fakes are allowed in tests, but production execution paths must use configured real adapters or return an explicit “integration not configured” state.

## 2. Data architecture and lifecycle

### 2.1 Source of truth

PostgreSQL is the durable source of truth. pgvector holds embeddings. Redis is disposable infrastructure for caching, rate limits, queue state, and short-lived locks; it must not be the only location of business records. Supabase Storage holds files, exports, templates, media, logos, receipts, and generated PDFs.

### 2.2 Schema rules

- UUID primary keys and timezone-aware timestamps.
- Explicit enums matching the SRS.
- Decimal/numeric types for money and token cost; never IEEE floating point for accounting.
- Foreign keys and indexes for every common relationship/filter.
- Immutable ledger/event records for payment reconciliation, API cost, and audit history.
- Soft-deletion timestamps where archival/recovery is required.
- Version records for proposals and knowledge entries.
- Scope keys on agent memory to prevent cross-client leakage.
- Structured JSONB only where the SRS permits flexible configuration; query-critical fields remain relational.

### 2.3 Migration gate

Every migration must include purpose, forward migration, rollback or forward-fix strategy, index/lock impact, data backfill plan, and verification query. Run migrations first in an ephemeral database, then preview/staging, then production. Back up production before destructive changes.

### 2.4 Destructive action gate

The UI and API must distinguish archive, recovery, and permanent deletion. All SRS destructive actions support a seven-day undo/recovery window. Permanent deletion requires explicit confirmation and delayed execution. Deleting client data must cascade through an approved deletion plan while preserving legally required audit metadata without retaining the deleted content.

### 2.5 Export and portability gate

At any time, the owner can export supported data as JSON and CSV; documents/reports remain downloadable in their generated formats. Configurations use JSON/YAML. A release fails if restoration on a standard PostgreSQL host is undocumented or if essential records only exist in a proprietary provider.

### 2.6 Data classification

**Recommended Addition:** Classify fields as public, internal, confidential-client, financial-sensitive, credential, or regulated. Apply redaction in logs, minimum retention, scoped access, and export/delete behavior per class. Never log raw secrets, full auth tokens, payment details, sensitive prompts, or uploaded client documents.

## 3. API and event quality gates

### 3.1 API contract

All SRS application endpoints use:

- `/api/v1/...` resource-oriented URLs;
- Supabase JWT bearer authentication except a minimal public health check;
- response `{ data, meta: { total, cursor, hasMore } }` where applicable;
- error `{ error: { code, message, details } }`;
- cursor pagination for large collections;
- Zod validation and sanitized inputs;
- 100 requests/minute per authenticated user/session;
- 10 MB standard request limit and 100 MB upload limit;
- documented OpenAPI operation, examples, and error responses.

### 3.2 Idempotency and concurrency

**Recommended Addition:** Mutation endpoints that create invoices, send email, publish content, deploy workflows, or trigger agents accept idempotency keys. Use optimistic concurrency/version fields for edited documents and agent configurations. Stripe and webhook handlers must be replay-safe.

### 3.3 Outbox and durable events

**Recommended Addition:** Write business mutations and outbox events in one PostgreSQL transaction. Workers publish graph updates, notifications, email, reports, and external effects from the outbox. Failed jobs move to a dead-letter state with owner-visible replay controls.

### 3.4 Webhook gate

Each inbound webhook must have raw-body signature verification, timestamp/replay protection, provider event ID deduplication, schema validation, durable receipt record, safe retry behavior, correlation ID, normalized outcome, and no secret data in logs. Webhooks respond quickly and defer substantial work to BullMQ.

### 3.5 Realtime gate

Supabase Realtime events carry minimal typed payloads. A reconnect performs authoritative refetch so dropped messages cannot leave the UI incorrect. Realtime is an enhancement to consistency, never the sole persistence mechanism.

## 4. AI and automation safety gates

### 4.1 Provider abstraction

OpenAI and Anthropic calls flow through a model gateway that records provider, model, tokens, estimated/actual cost, latency, retry count, run ID, client scope, and redacted error. Model names are configuration, not scattered constants.

### 4.2 Human-in-the-loop

Owner approval is mandatory before:

- sending lead outreach;
- client-visible content publishing when the SRS approval state requires it;
- executing a workflow after draft/review unless explicitly pre-approved;
- taking over or escalating chatbot conversations;
- consequential external API actions generated by an agent.

Approvals are immutable records linking actor, artifact version, timestamp, and action. Editing an approved artifact invalidates approval.

### 4.3 Cost control

Enforce daily token budget per agent before dispatch and during chains. Track input/output tokens, cost per run, cumulative cost, cost by client, and cost by model. Generate threshold alerts. A failed or retried run records each billable attempt.

**Recommended Addition:** Add global, client, and workflow cost budgets; model fallback policies; quality evaluation samples; and anomaly alerts for sudden token growth.

### 4.4 Memory isolation

Agent memory is partitioned by agent and client scope. Cross-client linking is explicit, owner-approved, and audited. Summarization retains source references. Deleting client data removes associated memory and embeddings.

### 4.5 Prompt and ingestion defense

**Recommended Addition:** Treat uploaded files, websites, emails, and knowledge text as untrusted data. Separate instructions from retrieved content, label sources, limit tool permissions, reject embedded secret requests, scan uploads, sanitize active content, and require approval for high-impact tools. Record provenance for generated artifacts.

### 4.6 Agent reliability

Runs persist state transitions: queued, running, success, failed, and timeout. Save partial outputs. Apply no more than three exponential-backoff retries for retryable failures. Non-retryable validation/auth errors fail immediately. Chained runs use a depth limit and cycle detection.

## 5. Security release gate

A release cannot proceed until all applicable SRS security IDs pass evidence-based verification.

### Authentication and session

- Supabase Auth email/password with minimum eight characters and complexity rules.
- Google and GitHub OAuth.
- One-hour JWT and 30-day refresh token policy.
- Session invalidation after password change.
- Five login attempts per 15 minutes per IP.

### Authorization and secrets

- Owner-only initial access; no public client records.
- Valid bearer token on all non-health APIs.
- External API keys encrypted at rest using Supabase Vault/AES-256.
- Secrets in platform environment management, never source or ordinary database fields.
- Application-level encryption for sensitive financial fields.

### Web and API defense

- TLS 1.3/HTTPS enforcement.
- Parameterized Prisma queries.
- XSS sanitization and strict Content Security Policy.
- SameSite cookies plus CSRF tokens for form submissions.
- CORS allowlist restricted to verified frontend domains.
- HSTS, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy.
- Upload malware scanning before durable availability.
- Database SSL required.
- Dependabot/Snyk and weekly dependency scans.
- Cloudflare DDoS protection where Cloudflare is used.

### Compliance and audit

- Full export and deletion workflow.
- Provider data-processing agreements considered and documented.
- Audit trail for every data mutation with actor, action, entity, timestamp, correlation ID, and safe before/after summary.
- Cookie consent remains future work unless a client-facing portal introduces cookies.

## 6. Test strategy

### 6.1 Test pyramid

1. **Unit tests:** Domain invariants, calculations, state machines, scoring, validation, prompt rendering, cost calculation, and policies.
2. **Integration tests:** Prisma against PostgreSQL/pgvector, Redis/BullMQ, storage, API handlers, auth guards, outbox, webhooks, realtime projections.
3. **Contract tests:** OpenAI, Anthropic, Stripe, n8n, Make.com, email, social, Gmail, Slack, booking, and storage adapter expectations.
4. **Component tests:** Forms, data tables, Kanban, approval views, drawers, graph controls, error boundaries, and accessibility.
5. **End-to-end tests:** Primary owner journeys and cross-domain flows.
6. **Performance tests:** API p95, graph render, queue latency, dashboard, uploads, search, and realtime.
7. **Security tests:** Auth bypass, authorization, injection, XSS, CSRF, CORS, rate limiting, webhook replay/signature, upload handling, secret leakage.
8. **Recovery tests:** Queue retry/dead letter, provider outage degradation, backup restore, migration rollback/forward-fix.

### 6.2 Coverage gate

Meet or exceed SRS NFR-M-004: 70% coverage for core business logic and 50% for UI components. Coverage alone is not acceptance; tests must cover critical state transitions and negative paths.

### 6.3 Required end-to-end journeys

- authenticate, create a client, add contacts/project, and see graph updates;
- create/configure/run an agent, approve output, inspect memory/cost/logs;
- create and operate a client chatbot through escalation and reporting;
- generate, validate, test, deploy, and monitor a workflow;
- create/approve/schedule/publish content and ingest metrics;
- source/qualify/approve outreach and move a lead through both pipelines;
- create/send/pay/reconcile an invoice and verify MRR/P&L/profitability;
- create/version/search/link knowledge and execute/review an SOP;
- receive/configure/read/digest notifications;
- generate/export weekly, monthly, and client reports;
- export all data, perform recovery, and verify degraded non-AI operation.

## 7. Performance and scale gate

Prove the following SRS targets in a production-like environment:

| Area | Target |
|---|---|
| Initial page load | <2 seconds on broadband |
| Graph ≤100 nodes | <1 second |
| Graph 100-300 nodes | <3 seconds with Canvas fallback |
| CRUD API | <500 ms p95 |
| Queue trigger to execution | <5 seconds |
| Realtime DB-to-UI | <2 seconds |
| Full-text search | <1 second |
| Semantic search | <2 seconds |
| Full dashboard | <3 seconds |
| 10 MB upload | <10 seconds |
| Active clients | 50 without degradation |
| Concurrent agent runs | 30 |
| Knowledge entries | 10,000 with semantic search |
| Graph scale | Up to 500 nodes before pagination/filter requirement |
| Queue | 500 pending tasks without backlog |
| Storage planning | 50 GB PostgreSQL and 100 GB files in year one |

Capture dataset, environment, percentile, run count, and result. Do not use a developer laptop result as the only production acceptance evidence.

## 8. Reliability and degraded-mode gate

- 99.5% uptime target excluding documented third-party outages.
- Three-attempt exponential retry for external APIs.
- Partial agent results persisted.
- Non-AI features fully functional during LLM outage.
- Offline/read-only cache or previously loaded core data remains available when external APIs fail.
- React error boundaries isolate widget failures.
- Daily backups with 30-day retention and point-in-time recovery.
- RPO ≤24 hours and RTO ≤1 hour proven by a timed restore drill.

**Recommended Addition:** Define service-level indicators for auth success, API p95/error rate, queue age, agent success/cost, webhook lag, realtime lag, database saturation, and report completion. Attach alerts to owner-visible runbooks.

## 9. UI, responsive, and accessibility gate

Retain the SRS dark-only initial design, typography, neon accents, grid/noise treatment, layout dimensions, drawers, and responsive breakpoints. All primary actions must be reachable within two clicks from the dashboard. Implement Cmd/Ctrl+K and the specified keyboard shortcuts.

For WCAG 2.1 AA:

- keyboard access and logical focus order;
- visible focus indicators;
- semantic landmarks/headings;
- ARIA names for icon-only controls;
- accessible names/descriptions for graph nodes and a functionally equivalent list/table representation;
- sufficient contrast for text and interaction states;
- reduced-motion support;
- screen-reader announcements for realtime status and validation errors;
- table headers and captions;
- no information conveyed by color alone.

Test desktop ≥1280 px, tablet 768-1279 px, and mobile <768 px. Mobile uses a bottom tab bar, stacked cards, no persistent right sidebar, and a simplified graph list.

## 10. Observability gate

Every API request, job, webhook, and external call gets a correlation ID. Structured logs include timestamp, environment, domain, operation, result, latency, and safe entity IDs. Sentry captures unhandled errors and releases. Centralized logs support search by correlation/run/webhook ID.

Dashboards cover application errors, latency, database, storage, Redis, queue depth/age, failed jobs, provider availability, LLM cost, agent success, webhook failures, report schedules, and uptime. Critical alerts must link to a runbook.

## 11. CI/CD gate

On every push: formatting/lint, TypeScript, unit/integration tests, and production build. On each pull request: preview deployment and migration validation. On merge to main: approved database migration then production deployment. Weekly: dependency/security scan. Protect the production branch and require passing checks.

Do not run production migrations from unreviewed preview builds. Separate local, test, preview/staging, and production credentials. Production secrets remain in provider secret stores.

## 12. Release progression

### Developer-ready gate

Repository boots from documented commands, environment validation works, seed fixtures load, tests run, and no secret is committed.

### Feature-complete gate

All 246 numbered requirements and all unnumbered traceability categories are implemented or explicitly marked post-MVP by the original SRS. No “temporary” mock remains in a production path.

### Release-candidate gate

All automated suites pass; migrations and rollback/forward-fix are rehearsed; security review has evidence; load tests meet SRS targets; accessibility audit passes; integrations pass sandbox checks; backup restore succeeds.

### Production gate

Production configuration, domains, TLS, webhook endpoints, alerts, budgets, schedules, backups, and owner account are verified. Seed/demo data is absent. External effects are enabled deliberately. A go/no-go review records known residual risks and rollback owner.

### Post-release gate

Monitor intensively for 72 hours. Review errors, costs, queue age, provider failures, realtime lag, and business metric correctness. Conduct a week-one retrospective and update ADRs/runbooks.

## 13. Future-scope boundary

The following SRS Section 12.6 items remain post-MVP: client portal, white-label mode, multi-user/contractor access, marketplace, predictive analytics, voice interface, native mobile app/PWA, calendar integration, Slack bot interface, and custom integrations builder.

**Recommended Addition:** Add dormant extension seams and feature flags, but do not expose incomplete navigation, APIs, database access policies, or security promises. Future functionality requires a new threat model, authorization model, privacy review, and acceptance plan.

## 14. Final production checklist

- [ ] 246/246 numbered SRS requirements mapped and verified.
- [ ] Unnumbered SRS obligation checklist complete.
- [ ] OpenAPI represents all shipped endpoints.
- [ ] Schema/migrations reviewed and backup taken.
- [ ] Auth, authorization, secrets, webhook, upload, and web security tests pass.
- [ ] Human approval gates cannot be bypassed by UI or API.
- [ ] LLM cost budgets and alerts tested.
- [ ] Graph, API, queue, dashboard, search, upload, and realtime targets pass.
- [ ] 50-client/30-agent/10,000-knowledge/500-node/500-job scale tests pass.
- [ ] WCAG 2.1 AA and responsive audits pass.
- [ ] LLM outage leaves non-AI features operational.
- [ ] JSON/CSV export and client deletion tested.
- [ ] Daily backups, 30-day retention, PITR, RPO, and RTO verified.
- [ ] CI/CD, Sentry, logging, uptime, database, queue, and cost monitoring active.
- [ ] Internal module documentation and agency operating SOP complete.
- [ ] Month 6/month 12 success metrics instrumented without fabricating results.
- [ ] Post-MVP features remain gated and clearly labeled.
