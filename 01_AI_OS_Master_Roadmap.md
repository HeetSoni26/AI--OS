# AI Automation Agency OS - Master Implementation Roadmap

**Source:** SRS-AIOS-2026-001, Version 1.0, July 2026  
**Roadmap horizon:** 20 weeks to production readiness, followed by post-MVP evolution  
**Operating model:** Personal, single-owner agency operating system  
**Primary objective:** Enable one operator to manage 10-20 agency clients by using AI agents for up to 80% of production work without sacrificing control, security, cost visibility, or data ownership.

---

## 1. Executive roadmap

The AI Automation Agency OS is a modular web application that unifies client operations, AI-agent orchestration, four client service-delivery systems, finance, sales pipeline, agency marketing, knowledge management, notifications, reporting, and a live knowledge graph. The roadmap converts the SRS into 12 sequential, testable implementation parts while preserving the original six-phase, 20-week delivery intent.

The implementation strategy is **foundation first, vertical slices second, system hardening last**. Parts 1-2 create the platform contract. Part 3 establishes the first complete business domain. Part 4 makes every entity visible through the product's signature knowledge graph. Part 5 establishes the reusable AI runtime. Parts 6-10 deliver operational service and business domains. Part 11 completes knowledge, notification, and reporting loops. Part 12 proves the complete system against security, scale, recovery, accessibility, and production-operation requirements.

No roadmap part is considered complete because screens exist. Completion requires persisted data, secured/versioned APIs, domain rules, user experience, graph/realtime behavior where applicable, observability, documentation, and passing tests.

### 1.1 Product outcome

At production acceptance, the owner can:

- authenticate securely and operate from desktop, tablet, or critical mobile views;
- see the business as a realtime graph of clients, agents, tools, SOPs, people, tasks, decisions, knowledge, financial events, and hubs;
- manage clients, contacts, projects, deliverables, communications, time, and histories;
- create, schedule, chain, approve, monitor, and cost-control AI agents with scoped persistent memory;
- build and manage chatbots, workflows, client content, and client lead-generation services;
- manage the agency's own CRM, proposals, follow-ups, content, finance, knowledge, SOPs, alerts, and reports;
- export owned data, continue non-AI work during provider outages, and restore operations from backup;
- prove business and technical health through measurable dashboards rather than assumed success.

### 1.2 Scope boundary

The initial product is deliberately single-owner. Clients and contractors do not receive interactive access. Client portals, white-labeling, multi-user roles, a marketplace, predictive analytics, voice, native mobile/PWA, calendar integration, Slack bot commands, and a visual custom-integration builder remain SRS-defined post-MVP items. The initial architecture must not block them, but it must not expose incomplete or insecure versions.

### 1.3 Priorities retained from the SRS

- **P0/Core:** knowledge graph, clients, agents, chatbot builder, finance, knowledge base, and required foundations.
- **P1/High:** workflow automation, client content, CRM/pipeline, reporting/analytics, notifications, and operational extensions.
- **P2/Medium:** client lead generation, agency content, document/template management, advanced convenience and optimization.
- **P3/Future:** client and contractor access and the future capabilities in Section 12.6.

Priority determines delivery order, not whether an in-scope requirement is removed.

---

## 2. Delivery principles

### 2.1 SRS traceability is a release gate

Every feature branch, migration, API operation, test, and release note should reference one or more SRS IDs or an explicitly named unnumbered SRS design constraint. `03_SRS_Coverage_and_Traceability_Matrix.md` is the control document. A requirement may appear in more than one part, but it must have one accountable completion part.

### 2.2 Build walking skeletons, not disconnected layers

Each part should deliver thin, production-shaped vertical slices: schema → service → API → UI → events/jobs → tests → documentation. Avoid building all tables first and all screens later. The owner should be able to exercise each completed domain through realistic flows.

### 2.3 API-first, owner-only, provider-independent

All functionality that agents or automations may need is accessible through `/api/v1`. Supabase Auth protects every endpoint except a minimal health check. Third-party calls pass through typed adapters so OpenAI/Anthropic, n8n/Make, email, social, storage, and payment implementations can be tested and replaced without rewriting domain rules.

### 2.4 Durable data before external effects

Persist intended business state and an outbox event before sending email, deploying workflows, publishing content, charging through Stripe, or invoking chained agents. Make external operations idempotent and replay-safe.

**Recommended Addition:** Use transactional outbox, provider event deduplication, idempotency keys, dead-letter queues, and operator-visible replay tools. These strengthen the SRS reliability and audit requirements.

### 2.5 Human authority over consequential automation

The owner approves lead outreach, client-facing publication, workflow deployment/test promotion, and other consequential actions where the SRS specifies human-in-the-loop. Approval records bind to immutable artifact versions. An edited artifact returns to review.

### 2.6 Security and cost are functionality

Authentication, scoped memory, encrypted credentials, malware scanning, auditability, rate limits, budget enforcement, and cost reporting are built into domain flows rather than deferred to Part 12. Part 12 independently verifies and hardens them.

### 2.7 Honest environments and data

Use synthetic demo clients and deterministic fixtures. Provider sandboxes are used before production. Do not fabricate operating metrics or claim success values before observations exist. Month 6 and Month 12 SRS targets are instrumented as goals, not seeded as results.

---

## 3. Target architecture

### 3.1 Application layers

| Layer | Primary technologies | Responsibility |
|---|---|---|
| Presentation | Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, D3/Canvas, Framer Motion | Accessible UI, graph visualization, forms, owner workflows. |
| Application/API | Route handlers/server actions, TanStack Query, Zod, OpenAPI | Authentication, request validation, use-case orchestration, response contracts. |
| Domain services | TypeScript domain modules | State transitions, calculations, approval policies, business invariants. |
| AI/agent | Provider gateway, LangChain.js where appropriate, OpenAI/Anthropic SDKs | Model execution, prompts, memory retrieval, tools, chaining, evaluations. |
| Automation | BullMQ, n8n/Make adapters, scheduled jobs, webhooks | Durable asynchronous and external workflows. |
| Data | PostgreSQL/Supabase, Prisma, pgvector, Redis, Supabase Storage | Relational truth, embeddings, caching/rate limits/queues, files. |
| External | Stripe, Gmail/email, Slack, social, booking, lead, Notion, GitHub | Payment, communication, publishing, ingestion, synchronization. |
| Operations | Vercel, Supabase, Upstash, Railway/Render, GitHub Actions, Sentry, Axiom/Logtail | Deployment, monitoring, backup, logs, security scans. |

### 3.2 Suggested repository shape

```text
apps/web/
  app/                       # routes, pages, layouts, API v1, webhooks
  components/                # reusable UI primitives and composed views
  features/                  # UI feature modules by domain
packages/
  domain/                    # pure types, policies, state machines
  application/               # use cases and orchestration
  data/                      # Prisma repositories, migrations, projections
  integrations/              # provider adapters and normalized errors
  agents/                    # runtime, tools, memory, prompts, evaluations
  jobs/                      # BullMQ producers, workers, schedules, DLQ
  contracts/                 # Zod schemas, API DTOs, event contracts, OpenAPI
  observability/             # logger, tracing, metrics, Sentry helpers
prisma/
  schema.prisma
  migrations/
docs/
  specification/
  roadmap/
  adr/
  runbooks/
tests/
  integration/
  contract/
  e2e/
```

A single-package repository is acceptable if these boundaries remain clear. The deployed architecture remains a modular monolith.

### 3.3 Environments

- **Local:** local/test Supabase or isolated development project, local Redis, fake/sandbox adapters, synthetic data.
- **Test:** ephemeral PostgreSQL/pgvector and Redis; deterministic integration fixtures.
- **Preview/Staging:** Vercel preview/staging, sandbox provider accounts, migration rehearsal, realistic volume tests.
- **Production:** isolated Supabase/Vercel/Upstash/n8n, platform-managed secrets, real webhooks, backups, alerts, budgets, and explicit external-effect enablement.

### 3.4 Cross-cutting records

In addition to SRS core entities, use supporting records for contacts, communications, tasks, assignments, time entries, deliverables, expenses, content, approvals, proposal versions, chatbot conversations, workflows/executions, agent memory, knowledge versions, audit events, webhook receipts, outbox events, integration connections, scheduled jobs, report artifacts, exports, and deletion/recovery requests.

These supporting entities implement existing SRS behavior; they do not change product scope.

---

## 4. Schedule and release map

| Weeks | SRS phase | Dominant roadmap work | Milestone evidence |
|---|---|---|---|
| 1-2 | Foundation | Parts 1-2 | Secure shell, schema/API contracts, CI, migrations. |
| 3 | Foundation | Part 3 | Complete client operations vertical slice. |
| 4 | Foundation | Part 4 v1 | Clients/hubs visible in working graph with drawer/filter. |
| 5-7 | AI Agents Core | Part 5 | Configurable agents execute in queue with memory, cost, realtime status. |
| 8-9 | Agents/Services | Part 6 | Chatbot Builder v1 plus conversation operations. |
| 9-10 | Services | Part 7 | Workflow generation, validation, sandbox deployment, health. |
| 10-12 | Services & Finance | Part 10 and service stabilization | Stripe sandbox reconciliation, expenses, financial reports. |
| 13 | CRM/Content/Knowledge | Part 8 | Client and agency content loops. |
| 14 | CRM/Content/Knowledge | Part 9 | Lead service, agency CRM, proposals, follow-ups. |
| 15-16 | CRM/Content/Knowledge | Part 11 | Knowledge/SOPs, alerts, dashboards, scheduled reports. |
| 17-20 | Optimization & Scale | Part 12 | Cross-system E2E, security, performance, accessibility, deploy, restore. |
| Post-MVP | Future enhancements | Separate approved roadmaps | No incomplete future feature exposed in MVP. |

For a solo developer, preserve the sequence but extend the calendar rather than cutting requirements. Parallel work is safe only after Parts 1-2 establish contracts.

---

## Part 1 - Product Foundation, Secure Authentication, and Delivery Baseline

**Target window:** Week 1  
**Depends on:** Approved SRS and repository ownership  
**Accountable scope:** architecture and technology baseline; SEC-A-001-006; portions of SEC-Z-001-002, SEC-E-001/003, SEC-API-005-007, SEC-I-001/005; NFR-U-001-005; NFR-M-001/005/006; operating environments; UI design language and shell; CI/CD baseline.

### Objective

Create a secure, reproducible application skeleton that all later domains can extend without reorganizing the product. The owner must be able to authenticate, reach protected placeholder routes through the final navigation shell, use global search/notification entry points as disabled contracts, and deploy a preview through passing CI.

### Workstreams

#### Repository and runtime

- Initialize Next.js App Router with strict TypeScript, React, Tailwind, shadcn/ui, ESLint, formatting, and a lockfile.
- Pin supported versions compatible with the SRS; record substitutions in an ADR.
- Establish domain-oriented folders, path aliases, server/client boundaries, test directories, and import rules.
- Provide documented `dev`, `lint`, `typecheck`, `test`, `build`, and database commands.
- Add runtime environment validation that fails safely when required variables are absent and never sends server secrets to client bundles.

#### Authentication and sessions

- Configure Supabase Auth for email/password, Google OAuth, and GitHub OAuth.
- Enforce password minimum/complexity, five attempts per 15 minutes per IP, one-hour JWT intent, 30-day refresh policy, protected routes, and invalidation after password change.
- Implement owner bootstrap/onboarding without introducing general multi-user roles.
- Add login, callback, password reset/change, logout, expired-session, and unauthorized states.
- Keep a public health endpoint minimal; require JWT bearer auth on all other API placeholders.

#### Application shell and design system

- Implement 48 px top bar, 240 px collapsible left navigation, main content slot, 320 px contextual right-sidebar slot, and 480 px detail-drawer contract.
- Add Dashboard, Knowledge Graph, Clients, Agents, Services, Finance, Pipeline, Knowledge Base, Reports, and Settings navigation.
- Implement desktop, tablet icon-sidebar, and mobile bottom-tab foundations.
- Encode the SRS dark design tokens: void/surface colors, neon accents, typography (Space Grotesk and JetBrains Mono), radii, borders, glow behavior, grid, and subtle noise. Support reduced motion.
- Implement focus styling, semantic landmarks, skip link, accessible icon buttons, and reusable loading/empty/error/skeleton patterns.
- Install error boundaries so a failed widget does not crash the page.

#### Security and delivery baseline

- Add HTTPS-oriented security headers: CSP foundation, HSTS in production, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy.
- Establish SameSite cookie behavior, CSRF strategy for forms, and CORS allowlist configuration.
- Add structured logging and correlation ID foundation with automatic secret redaction.
- Configure GitHub Actions for lint, typecheck, unit tests, and production build on every push; define preview and production stages without embedding secrets.
- Create environment documentation for local, test, preview/staging, and production.

### Tests and evidence

- Unit-test environment parsing, navigation configuration, route authorization helpers, and redaction.
- Integration-test login callback/session refresh and protected route/API behavior.
- E2E-test login, invalid login throttling, logout, password-change invalidation, keyboard navigation, responsive shell, and a widget error boundary.
- Run automated accessibility checks on authentication and shell pages.
- Verify no secret value appears in client bundles, logs, test snapshots, or repository history.

### Risks and controls

- **Supabase policy mismatch:** document the exact JWT/session configuration and test expiry/refresh.
- **Dark neon contrast failures:** use contrast-tested semantic tokens; never convey status only by hue.
- **Premature multi-user design:** keep an owner identity field for auditing but no owner-editable roles or shared access.

### Exit criteria

- Fresh checkout reaches a working local application from documented commands.
- Email/password and both OAuth flows are configured; protected routes and APIs reject unauthenticated access.
- The final navigation shell works across all three breakpoints and is keyboard navigable.
- Push CI completes lint, typecheck, tests, and production build.
- Security headers, environment validation, logging/redaction, and error boundaries are active.
- ADR-001 records repository/architecture decisions and any version differences from the SRS.

### Handoff artifacts

Repository baseline, environment example without secrets, auth configuration guide, UI token catalog, CI workflow, initial ADR, and test report.

---

## Part 2 - Data Platform, API Standards, Auditability, and Core Shared Services

**Target window:** Week 2  
**Depends on:** Part 1  
**Accountable scope:** SRS Section 7 data strategy and all core entities/relationships; Section 8.1 API principles; Section 11.2 environment variables; NFR-PO-001-004; NFR-M-002/003/006; SEC-Z-003-005; SEC-E-002-004; SEC-API-001-004; SEC-C-001/003; foundations for NFR-R and all later domains.

### Objective

Create the durable platform contract: complete Prisma/PostgreSQL/pgvector model, safe migrations, storage and Redis boundaries, versioned API conventions, audit/history infrastructure, archival/recovery behavior, graph projection contracts, and provider adapter interfaces.

### Workstreams

#### Complete schema and relationships

- Model the SRS core entities exactly: clients, agents, agent runs, projects, invoices, knowledge entries, pipeline leads, graph edges, and notifications with stated fields, enum values, constraints, defaults, and relationships.
- Add normalized support entities needed by requirements: contacts, communications, deliverables, time entries, assignments, tasks, expenses, content artifacts/calendar entries, brand profiles, approvals, proposals/versions, workflows/executions, chatbot configs/conversations/messages, lead outreach events, memory entries/summaries, knowledge versions/links, SOP steps/executions, integrations, webhook receipts, audit events, outbox events, exports, files, deletion holds, and scheduled jobs.
- Enable pgvector for 1,536-dimensional knowledge embeddings while keeping provider/model metadata so future embedding changes are migratable.
- Add indexes for status/date/client/agent/category/tag, full-text search, vector search, graph source/target, unread notifications, due jobs, and idempotency keys.
- Express money as decimal and timestamps as timezone-aware. Add check/unique constraints for one primary contact, nonnegative amounts/costs, and valid state transitions where database support is appropriate.

#### Migrations, seed, and storage

- Create versioned Prisma migrations and an ephemeral-database migration test.
- Add synthetic seed data representing all node types without real client information.
- Define Supabase Storage buckets and signed-access policies for client files, logos, receipts, exports, templates, media, chatbot source documents, and reports.
- Define Upstash Redis namespaces for cache, rate limit, queue, locks, and sessions; no durable business truth lives only in Redis.
- Document database backup, migration rollback/forward-fix, and local reset procedures.

#### API platform

- Implement `/api/v1` helpers for bearer authentication, Zod input/output validation, normalized errors, cursor pagination, response envelope, correlation IDs, and ownership checks.
- Enforce 100 requests/minute per authenticated session, 10 MB standard requests, and 100 MB file uploads.
- Generate OpenAPI/Swagger documentation with security scheme, schemas, examples, errors, and pagination.
- Add base repository/service patterns without turning the code into a generic framework.
- Create health/readiness endpoints that expose no sensitive infrastructure data.

#### Audit, archive, recovery, export

- Record every mutation in an audit trail with owner, action, entity, time, correlation ID, and redacted change summary.
- Implement archive and seven-day recovery primitives; permanent deletion is a scheduled, confirmed operation.
- Implement export job infrastructure and manifest format for later JSON/CSV exports.
- Implement client data-deletion planning records so later domain data can be deleted completely and auditable metadata can be retained safely.

#### Integrations and durable events

- Define adapter interfaces for OpenAI, Anthropic, n8n, Make.com, Stripe, Gmail/Google, Slack, LinkedIn, X, WordPress, Mailchimp, SendGrid/Resend/SMTP, Twilio, Calendly/Cal.com, Notion, GitHub, lead providers, and malware scanning.
- Implement encrypted credential references using Supabase Vault; ordinary application tables store only connection metadata and secret references.
- Add a transactional outbox, webhook receipt/deduplication model, idempotency contract, normalized provider error classes, and dead-letter/replay state.

### Tests and evidence

- Migration up/down or forward-fix rehearsal on empty and seeded databases.
- Schema tests for every required enum, relationship, default, unique constraint, and archival field.
- API contract tests for auth, envelope, errors, validation, pagination, body limits, rate limit, and OpenAPI generation.
- Audit tests proving successful and failed/forbidden mutations behave correctly without secret leakage.
- Export round-trip skeleton and delayed-deletion/recovery clock tests.
- Vault/adapters tests that prove raw secrets are unavailable to UI and logs.

### Exit criteria

- The complete schema migrates into a clean PostgreSQL 16+/pgvector database and seed data loads.
- All SRS core entities and relationships are represented; supporting entities have documented rationale.
- API helpers and OpenAPI are reusable by all later modules.
- Audit, outbox, webhook receipt, archive/recovery, export job, storage, Redis, and Vault foundations pass integration tests.
- Data remains portable to standard PostgreSQL, JSON, CSV, and standard configuration formats.

### Handoff artifacts

Schema diagram, field dictionary, migration report, OpenAPI baseline, storage policy document, adapter contracts, data classification table, seed guide, and ADRs for outbox/idempotency and pgvector.

---

## Part 3 - Client Operations, Contacts, Projects, Deliverables, and Communications

**Target window:** Week 3  
**Depends on:** Parts 1-2  
**Accountable scope:** FR-CM-001-020; related project, task, graph, storage, Gmail, audit, and undo constraints; Clients page and client drawer specifications.

### Objective

Deliver the first complete daily-use business domain. The owner can create and manage a client from prospect through active service, organize people and projects, enforce deliverable readiness, account for time, log communications, and see graph-ready changes emitted in realtime.

### Workstreams

#### Client lifecycle

- Implement create/edit/archive/recover/permanent-delete flows for name, industry, primary contact, email, phone, website, notes, logo, MRR, revenue, dates, and SRS statuses.
- Permanent deletion requires explicit confirmation and a seven-day undo window; deletion jobs must include related client data added by later parts.
- Provide list/grid toggle, sorting by name/MRR/start date/status, filter tabs, search, pagination, and accessible table semantics.
- Validate URLs, email, phone, currency, and image type/size. Store logos with signed storage access.

#### Contacts and communication

- Support multiple contacts, exactly one optional primary contact, last-contact tracking, notes, and searchable contact history.
- Record manual communication entries for email, note, call summary, and Slack message with date, summary, and next action.
- Implement Gmail OAuth adapter contract and ingestion rule that auto-logs messages matching a client email, with deduplication and provider message reference.
- Expose communication history in chronological order in full client profile and graph drawer.

#### Projects, work, and delivery controls

- Implement project types and statuses exactly as specified.
- Assign agents and/or human-owned tasks through generic assignments that Part 5 will activate for agents.
- Support manual time entries and an aggregation contract for agent-run time.
- Implement ordered deliverable checklists and prevent `Delivered` until all required deliverables are complete.
- Record every status transition and override attempt in activity/audit history.

#### API and UI

- Implement all SRS client endpoints: list, detail, create, update, archive, projects, invoices relation stub, communications list/create; add version-consistent contact/project/time/deliverable endpoints.
- Return related summary counts without N+1 queries.
- Build Clients page, creation/edit forms, profile view, contextual right sidebar, and client detail drawer with quick actions. Unavailable later-domain quick actions are visibly disabled with no fake success.
- Publish typed node-created/updated/deleted events and graph projection data for clients and contacts.

### Tests and evidence

- Domain tests for statuses, primary contact, deliverable gate, time aggregation, MRR fields, archive/recovery, and delayed deletion.
- API tests for every endpoint, validation, auth, filtering, sorting, cursor pagination, and audit records.
- Storage tests for logo upload and access policy.
- Gmail contract tests for match, duplicate, malformed event, revoked OAuth, and retry.
- E2E flow: create client → contacts → project → assignments/time → deliverables → communication → archive → recover.
- Accessibility tests for sortable table, forms, dialogs, tabs, drawer focus trap, and status labels.

### Exit criteria

- FR-CM-001-020 pass mapped acceptance tests.
- Owner can manage clients, contacts, projects, time, deliverables, and communications from the UI and API.
- Client/contact graph events are durable and ready for Part 4.
- Archive/recovery/deletion and all mutations are auditable.
- SRS Phase 1 client-management capability is usable without mocks.

### Handoff artifacts

Client API/OpenAPI section, state diagrams, Gmail setup instructions, deletion impact registry, graph projection contract, screenshots/test evidence, and requirement completion report.

---

## Part 4 - Knowledge Graph Command Center and Realtime Business Map

**Target window:** Week 4 for v1; continue projections as modules arrive  
**Depends on:** Parts 1-3  
**Accountable scope:** SRS Section 4 in full; Section 8.2.3 graph APIs; Section 8.3 graph and finance/notification visual events; Section 10.3.2; NFR-P-002/003/006; NFR-S-004; relevant NFR-U and WCAG requirements.

### Objective

Make the knowledge graph the live command center promised by the SRS. Part 4 builds the rendering and interaction platform using hubs plus current client/contact entities. Later parts register new graph projections without changing graph architecture.

### Workstreams

#### Graph read model and APIs

- Build a typed normalized `NodeData`/`EdgeData` read model from source entities and explicit `graph_edges` relationships.
- Implement all graph endpoints: complete graph, filtered nodes, filtered edges, create/delete edge, node detail with connections, and fuzzy search.
- Support node types Client, AI Agent, Tool, SOP, Human/Contact, Task, Decision, Knowledge/Memory, Revenue/Finance, and Hub-even when some initially have zero instances.
- Implement ownership, assignment, data flow, dependency, trigger, reference, financial edge types with stated visual semantics.
- Create stable hub nodes for Command, Clients, Agents, Finance, Pipeline/CRM, Content, Knowledge, Automations, and Tools with summary/count contracts.

#### Renderer and performance

- Use D3 force simulation with SVG up to the validated threshold and Canvas fallback for larger views; maintain an accessible nonvisual list representation.
- Apply configurable charge, link distance, centering, parent-hub clustering, fixed hub/quadrant hints, zoom [0.1, 4], pan, fit/reset, and dragged-node positioning.
- Meet 60 fps interaction intent for normal views, <1 second for up to 100 nodes, <3 seconds for 100-300 nodes, and a documented filter/pagination strategy by 500 nodes.
- Avoid full simulation restart for minor updates; profile render, reconciliation, labels, and effects.

#### Complete interaction model

- Implement click selection/drawer, Shift+click and box multi-select, hover tooltip, drag, fullscreen, Escape/double-click reset, Cmd/Ctrl+K search, and right-click context menu: Open, Edit, Connect, Archive, Delete.
- Add keyboard equivalents and never require right-click/drag as the only route.
- Build LENS Entity, Function, and Action filters; combine filters, fade excluded nodes to 10%, show dismissible active tags, persist in URL, and clear all.
- Build the collapsible directory sidebar grouped by agents, clients, tools, recent tasks, and knowledge; include counts, statuses, search, collapse, graph centering, and permitted drag positioning.
- Add legend with node colors/counts and the exact node/edge visual treatment from the SRS.

#### Drawers and visual states

- Build configurable drawers for client, agent, and task/SOP/knowledge details with the SRS fields and quick-action slots.
- Apply void-black background, 40 px faint cyan grid, neon node colors, icons, radii, glow, Space Grotesk labels, animated data-flow edges, hover/selected states, and reduced-motion alternatives.
- Implement client/contact detail now; register typed placeholders for future domain renderers without showing fake data.

#### Realtime behavior

- Subscribe to Supabase channels and implement node/edge create/update/delete, agent status/run outcomes, payment, and notification event contracts.
- Implement entrance, pulse, deletion, edge draw/dissolve, running ring, completion check, error state, and payment glow with accessible announcements and reduced-motion alternatives.
- On reconnect, refetch authoritative data to recover missed events.

#### Responsive and accessible graph

- Desktop: full graph and right directory; tablet: collapsible panels; mobile: simplified searchable/filterable list instead of unusable force canvas.
- Expose node name/type/status/summary and connected entities to screen readers. Provide keyboard selection, focus management, and no color-only status.

### Tests and evidence

- Unit tests for projection, filters, hub clustering data, edge styles, and event reducers.
- API and realtime integration tests including reconnect/refetch.
- Component/E2E tests for every canvas control, LENS combination, URL sharing, directory centering, drawer, context actions, and mobile fallback.
- Accessibility audit of graph alternatives, focus, tooltips, menus, status announcements, and contrast.
- Performance benchmark datasets at 100, 300, and 500 nodes, recording renderer, browser, hardware, frame rate, and time.

### Exit criteria

- SRS Phase 1 graph exit criteria pass with client/hub nodes, detail, search, and entity filter.
- The full graph platform supports every SRS node, edge, hub, LENS, directory, drawer, visual, realtime, responsive, and accessibility contract.
- 100/300-node targets pass; 500-node behavior degrades through filter/pagination rather than failure.
- New domain projections can be registered without editing the core renderer.

### Handoff artifacts

Graph schema/contracts, visual legend, event catalog, projection extension guide, performance report, accessibility report, and Part 4 acceptance recording/screenshots.

---

## Part 5 - AI Agent Runtime, Memory, Scheduling, Cost Control, and Monitoring

**Target window:** Weeks 5-7  
**Depends on:** Parts 1-4  
**Accountable scope:** FR-AM-001-024; AI Agents API endpoints; agent realtime events; BullMQ/LangChain/provider architecture; agent node/drawer/page; portions of NFR-P-005, NFR-S-002/006, NFR-R-002/004/005, security and cost monitoring.

### Objective

Create one reusable, observable, cost-governed agent runtime that all service agents use. An agent is a configured, versioned domain entity-not a page-specific prompt call.

### Workstreams

#### Agent configuration and UI

- Implement all SRS agent types, models, parameters, system prompt rich editor, tool assignments, and manual/scheduled/event-triggered modes.
- Validate temperature, max tokens, top_p, frequency penalty, cron syntax, model availability, tool permissions, and budgets.
- Build Agents page cards with status, last run, total cost, success rate; detail/configuration views; last 20 runs; memory viewer/editor; errors; connected tools; assigned clients/hubs; Run/Pause/Resume actions.
- Add configuration versions so an execution records the exact prompt/model/tools used.

#### Queue and execution engine

- Use BullMQ producers/workers with persisted run records and status transitions: queued, running, success, failed, timeout.
- Begin execution within five seconds under target load, support up to 30 concurrent runs and 500 queued tasks, and make dispatch idempotent.
- Implement manual, cron, webhook, and chain triggers; chain cycle/depth protection; three retry attempts with exponential backoff for retryable failures.
- Persist partial output before failure and normalized error details. Move exhausted jobs to an operator-visible dead-letter/replay state.
- Implement human-in-the-loop checkpoints that pause before consequential tool execution and resume only an approved artifact version.

#### Provider and tool gateway

- Implement OpenAI and Anthropic adapters supporting required models through configurable identifiers.
- Normalize message/tool-call formats, timeout, usage, cost, errors, retries, and cancellation.
- Implement least-privilege tool registry for web search, file read/write, code execution, API calls, and email send. High-impact tools require explicit policy/approval.
- Record provider/model/tokens/cost/latency for every attempt and agent run.

#### Cost budgets

- Enforce daily token budget before dispatch and across retries/chains.
- Update cumulative cost, total runs, last run, and success rate transactionally.
- Display cost on agent node/dashboard and trigger threshold alerts through the Part 11-compatible event interface.
- Add cost by client and model for later profitability reporting.

#### Persistent memory

- Implement key/value and vector memory with agent scope plus optional client scope.
- Retrieve relevant memories per run; persist preferences, outputs, and approved learnings.
- Allow owner view/edit with audit/version history.
- Prevent cross-client retrieval unless explicitly linked and approved.
- Summarize older memory when token limits are approached while retaining provenance and deletion linkage.

#### Monitoring and graph

- Publish realtime running/idle/error/paused/scheduled state and run completed/failed events.
- Render agent nodes, status colors, pulsing ring, completion/error effects, cost metadata, assignments, and agent drawer.
- Implement dashboard filters by agent/date/status and output preview notifications that expand to full run detail.
- Deliver failure events for email, in-app, and optional Slack notification workers.

### Tests and evidence

- Unit tests for parameter/prompt versions, state machine, retries, chains, approval, budget, costs, memory scope/summarization, and success rate.
- BullMQ integration tests for concurrency, queued load, retry, timeout, partial save, dead letter, idempotency, and pause/resume.
- Provider contract tests with deterministic fixtures plus sandbox smoke tests.
- Security tests for cross-client memory, forbidden tools, prompt injection in retrieved text, secret redaction, and approval bypass.
- E2E: create agent → configure → run → approve → complete → inspect output/cost/log/memory → pause/resume.
- Load evidence for 30 concurrent runs, 500 pending jobs, and <5-second target queue latency.

### Exit criteria

- FR-AM-001-024 pass.
- Required agent endpoints, UI, realtime graph states, logs, cost, memory, schedules, chains, retries, and approval work end to end.
- Non-AI application domains remain operational during simulated LLM outage.
- Service agents can be added as typed strategies/tools rather than separate execution engines.

### Handoff artifacts

Agent SDK/strategy guide, tool security policy, provider setup, prompt version format, run/event contracts, cost table, memory isolation report, load results, and incident runbook.

---

## Part 6 - Chatbot Builder and Omnichannel Conversation Operations

**Target window:** Weeks 8-9  
**Depends on:** Part 5 and client/knowledge/storage foundations  
**Accountable scope:** FR-CB-001-017; Chatbot Builder Agent milestone; uploaded-file security; client/project/graph/report links.

### Objective

Deliver a managed chatbot service from source ingestion through deployment, live conversations, escalation, lead capture, reporting, and experimentation.

### Workstreams

#### Safe knowledge ingestion

- Accept FAQ documents, product documents, and approved website URLs for a selected client.
- Enforce file size/type, malware scan, safe parsing, URL allow/deny rules, fetch timeout, content sanitization, and source provenance.
- Chunk source material, generate structured Q&A pairs, embeddings, validation warnings, and owner review before chatbot publication.
- Keep chatbot knowledge and memory client-scoped; client deletion removes documents, chunks, embeddings, and conversations according to policy.

#### Chatbot configuration and deployment

- Configure name, brand voice, greeting, fallback, escalation rules, confidence threshold, platform, actions, and approved knowledge version.
- Support website embeddable JavaScript widget, Twilio WhatsApp adapter, Instagram DM adapter, and custom API.
- Generate versioned widget embed code with domain allowlist, secure conversation token, rate limit, CSP instructions, and rollback.
- Maintain a 10-message conversation context window while persisting full transcript for analysis.

#### Conversation behavior

- Ground FAQ answers in approved knowledge; below-threshold responses escalate instead of inventing certainty.
- Capture name/email/phone with consent-aware prompts; create/link lead records without duplicates.
- Integrate Calendly/Cal.com booking, context-based recommendations, and keyword custom actions such as pricing links.
- Log transcript, source references, intent classification, sentiment score, model usage, response time, confidence, escalation, and outcome.
- Provide human takeover with clear bot/owner state, owner identity, and return-to-bot control.

#### Operations, review, and reports

- Build all-chatbot conversation dashboard with client/bot/date/intent/sentiment/escalation filters.
- Add low-confidence review queue, transcript detail, manual takeover, lead and appointment links.
- Generate weekly metrics: conversations, resolution rate, leads captured, average response time, escalation, and cost.
- Implement prompt A/B versions, deterministic assignment, conversion/outcome attribution, minimum-sample caveat, and winner promotion requiring owner approval.
- Project chatbots/conversations or appropriate service/task nodes into graph relationships without exposing message content on the canvas.

### Tests and evidence

- Parsing tests for supported/invalid/malicious files and URLs; malware scanner and prompt-injection defenses.
- Grounding/confidence tests, context-window test, lead deduplication, booking and custom-action contract tests.
- Channel adapter tests for signature/auth, retries, duplicates, rate limits, and provider outages.
- E2E: ingest → approve Q&A/config → deploy widget → multi-turn chat → low-confidence escalation → lead capture → owner takeover → report.
- A/B allocation and metric-integrity tests.
- Performance tests for average response tracking and concurrent conversation isolation.

### Exit criteria

- FR-CB-001-017 pass across real application flows.
- Website widget works in an allowed test domain; other channel adapters pass sandbox/contract validation.
- No conversation or memory crosses client scope.
- Low-confidence and consequential paths escalate or await owner action.
- Weekly reports and A/B results use observed data and state limitations honestly.

### Handoff artifacts

Widget deployment guide, channel adapter guide, supported ingestion matrix, chatbot threat model, conversation schema, escalation runbook, metrics definitions, and client-service SOP.

---

## Part 7 - Workflow Automation Builder, Deployment, and Health Monitoring

**Target window:** Weeks 9-10  
**Depends on:** Part 5, adapter/outbox/webhook platform  
**Accountable scope:** FR-WA-001-015; n8n/Make integration; `/webhooks/n8n`; workflow graph/tool links; workflow templates and impact reports.

### Objective

Turn a natural-language automation request into a validated, owner-reviewed, tested, documented, deployed, and monitored n8n or Make.com workflow.

### Workstreams

#### Blueprint generation and editor

- Capture client, objective, trigger, systems, credentials needed, conditions, actions, failure behavior, data sensitivity, and expected output.
- Generate n8n-compatible JSON with nodes, triggers, connections, conditions, and actions through the agent runtime.
- Validate against a supported schema and detect missing connections, unreachable nodes, cycles/infinite loops, unhandled error paths, absent credentials, unsafe destructive actions, and unsupported node types.
- Build visual workflow editor with node/edge inspection, configuration forms, warnings, diff from generated version, undo, and version history.
- Seed templates for lead follow-up, review response, invoice reminder, and social cross-posting.

#### Credentials and deployment

- Reference credentials through Vault/integration connections; never expose secret values to generated JSON, UI, logs, or LLM prompts.
- Implement n8n create/update/activate/webhook/test operations and Make.com equivalent where API support permits.
- Require owner approval of a version, run a sandbox/test execution, show inputs/outputs and validation result, then allow activation.
- Generate client-facing documentation describing purpose, triggers, steps, expected outputs, dependencies, error behavior, owner contact, and version.
- Use idempotency and provider IDs so retries do not create duplicate workflows.

#### Monitoring and impact

- Ingest execution complete/failed events with HMAC/signature validation, deduplication, and fast queue handoff.
- Poll provider APIs when webhook data is insufficient.
- Track executions, success rate, average duration, last status, errors, and provider health.
- Build workflow health dashboard and graph projections linked to Automations hub, client, assigned agent, tools, and documentation.
- On failure, notify owner with normalized error, failed step, last safe state, and suggested fix clearly marked as a suggestion.
- Generate monthly impact report for hours saved, tasks automated, and errors prevented using configured/observed methodology; do not fabricate impact.

### Tests and evidence

- Generator/validator fixtures for valid flow, missing edge, unreachable step, loop, unhandled error, unsafe action, and missing credential.
- Editor tests for review, diff, undo, and accessible keyboard operation.
- n8n and Make contract/sandbox tests for create, test, activate, update, failure, retry, and duplicate prevention.
- Webhook signature/replay/deduplication tests.
- E2E: request → blueprint → edit → validate → approve → test → deploy → receive success/failure → documentation/report.

### Exit criteria

- FR-WA-001-015 pass.
- A real sandbox n8n workflow can be generated, edited, validated, tested, deployed, monitored, and documented.
- Make.com is implemented through the same domain interface with supported-operation differences documented rather than faked.
- Credentials never enter model context or generated artifacts.
- Health metrics and monthly impact calculations have traceable sources.

### Handoff artifacts

Supported node matrix, workflow JSON/version schema, credential policy, deployment/rollback SOP, provider capability comparison, health dashboard guide, webhook runbook, and impact methodology.

---

## Part 8 - Client Content Delivery and the Agency's Own Content Engine

**Target window:** Week 13  
**Depends on:** Parts 3, 5, 11-compatible scheduling/report contracts  
**Accountable scope:** FR-CG-001-015 and FR-CE-001-009; content calendars, publishing/social webhook, approvals, performance, client/agency reports, graph content links.

### Objective

Deliver two related but isolated content systems: client content production by brand and the agency owner's own marketing engine. Both use a common artifact/calendar/publishing platform while preserving tenant-like client separation and approval workflows.

### Workstreams

#### Brand and strategy profiles

- Store client brand voice: tone, vocabulary, audience, messages, prohibited claims, examples, channel rules, and approved version as persistent scoped memory.
- Store agency strategy: target audience, topics, brand voice, content pillars, offers, goals, and calendar gaps.
- Ensure a selected client/agency scope is mandatory in generation; never mix brand memory.

#### Generation and repurposing

- Generate LinkedIn, X, Instagram captions, newsletters, SEO blog articles with keywords/meta description/headings, and video scripts with hook/body/CTA.
- For agency content, support LinkedIn posts, X threads, blog, newsletter, and case studies.
- Implement source-based briefs and factuality/provenance fields; flag unsupported claims.
- Repurpose one source into at least five formats and preserve lineage so edits can be propagated intentionally.
- Support bulk week/month generation as queued jobs with budget forecast and cancellation.

#### Approval state machines

- Client content: Draft → Owner Review → Client Review → Approved → Scheduled/Published.
- Agency content: Draft → Review → Approve → Schedule → Publish.
- Capture reviewer, version, comment, and timestamp. Editing invalidates prior approval. Do not provide client login in MVP; client review is recorded by owner through an external-review workflow or status evidence.

#### Calendar and scheduling

- Provide per-client and agency monthly grid/list views, publish dates, platform, status, filters, drag/reschedule with keyboard alternative, timezone, and collision warnings.
- Recommend optimal posting times from configured or observed evidence; label recommendations and allow override.
- Queue approved content for scheduled publishing with idempotency and missed-schedule recovery.

#### Publishing and analytics

- Implement adapter operations for LinkedIn, X, WordPress, and Mailchimp; add channel-specific validation and preview.
- Ingest published/engagement updates through `/webhooks/social` and provider polling as needed.
- Track impressions, engagement, clicks, and conversions with source/time/attribution metadata.
- Generate monthly client performance reports, identify top agency content and suggest related topics, and generate agency content ROI with declared cost/revenue assumptions.
- Link brand knowledge, content artifacts, agents, clients, campaigns/tasks, and Content hub on the graph.

### Tests and evidence

- Scope-isolation tests across two clients plus agency profile.
- Content-type schema tests, SEO field tests, repurposing lineage, bulk job budget/cancel, and unsupported-claim flags.
- Approval authorization/version invalidation tests and state-machine tests.
- Calendar timezone/schedule/idempotency tests.
- Publishing adapter contract tests and social webhook replay/signature tests.
- E2E for one client artifact and one agency campaign from brief through observed performance report.

### Exit criteria

- FR-CG-001-015 and FR-CE-001-009 pass.
- Required content formats, calendars, approval states, repurposing, scheduling, publishing, and performance operate with scoped data.
- No unapproved artifact can publish through UI, API, worker, or retry path.
- Reports use provider-observed data or explicitly labeled unavailable metrics.

### Handoff artifacts

Content schemas/state diagrams, channel capability matrix, brand isolation test, publishing setup/rollback SOP, calendar/timezone policy, metric/ROI definitions, and content-operation SOP.

---

## Part 9 - Lead Generation, CRM Pipeline, Proposals, and Follow-up Automation

**Target window:** Week 14  
**Depends on:** Clients, agents, communications, content/email adapter, jobs  
**Accountable scope:** FR-LG-001-017 and FR-PM-001-013; pipeline APIs; `/webhooks/leads` and `/webhooks/email`; proposal PDF/versioning; human nodes and Pipeline hub.

### Objective

Build two linked but distinct flows: lead generation delivered to clients and the agency's own sales CRM. Both preserve source, consent/compliance constraints, deduplication, communication history, approval, and conversion evidence.

### Workstreams

#### Authorized lead sourcing

- Implement configurable adapters for LinkedIn, Google Maps, industry directories, Crunchbase, and Apollo.io subject to account authorization and provider terms.
- Prefer official APIs/authorized exports. Do not bypass controls, evade rate limits, or implement prohibited scraping.
- Capture industry, location, company size, job title, and technology criteria.
- Normalize and deduplicate by source ID, normalized email/domain/profile URL, and fuzzy company/person match.
- Store required identity/contact/source/date fields plus provenance and client scope.

#### Qualification and research

- Configure weighted fit criteria and calculate explainable 1-100 scores.
- Research approved public sources and produce a sourced brief; do not infer sensitive personal attributes.
- Categorize Hot/Warm/Cold, flag blocked domains and competitors, and allow owner override with reason.

#### Client outreach service

- Generate personalized three-to-five-email sequences from the research brief.
- Require owner approval before sending any message. LinkedIn output remains draft-only for manual sending.
- Send through SMTP/SendGrid/Resend adapters, record provider message IDs, and ingest delivered/opened/bounced/replied events.
- Advance client-service pipeline Sourced → Qualified → Outreach Sent → Replied → Meeting Booked → Converted based on verified events or owner action.
- Track conversion rates and generate weekly client lead report.

#### Agency CRM and proposals

- Capture leads through manual entry, `/webhooks/leads`, email inquiries, and social DM adapters.
- Build accessible drag/drop Kanban with keyboard stage controls: New → Contacted → Qualified → Proposal Sent → Negotiating → Won → Lost.
- Generate proposals from controlled templates with scope, deliverables, timeline, pricing, and terms.
- Store immutable v1/v2 versions and change summaries; generate branded PDF; track Draft/Sent/Viewed/Accepted/Rejected with honest viewed status only when tracking evidence exists.
- Generate context-aware follow-ups, schedule stage rules such as two days after first contact and five days after proposal, alert overdue items, and link communications.
- Project leads as Human nodes connected to Pipeline hub, proposals/tasks, communications, and converting client.

### Tests and evidence

- Source adapter terms/config tests, normalization/deduplication, blocked/competitor, score explanation, and scope isolation.
- Approval bypass tests across API/job retries; email webhook signature/replay/deduplication; bounce/reply stage tests.
- Kanban keyboard/accessibility and conversion calculation tests.
- Proposal version/diff/PDF/status and follow-up schedule tests.
- E2E client lead journey and agency CRM journey from capture to converted/won.

### Exit criteria

- FR-LG-001-017 and FR-PM-001-013 pass.
- No outreach sends without valid approval; LinkedIn remains owner-sent draft.
- Both pipelines are distinct, linked where appropriate, and have trustworthy conversion metrics.
- Proposals are versioned, exportable PDFs with observable statuses.
- Lead source use is authorized/configured and does not rely on evasion or prohibited access.

### Handoff artifacts

Source compliance/capability matrix, score configuration, deduplication rules, outreach approval proof, email event runbook, pipeline definitions, proposal template/version guide, and CRM SOP.

---

## Part 10 - Finance, Stripe, Expenses, Profitability, and Revenue Intelligence

**Target window:** Weeks 10-12  
**Depends on:** Clients, agent costs, jobs/outbox/webhooks  
**Accountable scope:** FR-FM-001-019; finance API endpoints; `/webhooks/stripe`; financial graph nodes; dashboard finance UI; Invoice Chaser milestone and financial report/export obligations.

### Objective

Create a trustworthy internal financial operating layer and Stripe reconciliation flow. Calculations must be deterministic, auditable, currency-safe, and traceable to invoices, payments, expenses, clients, services, time, and agent costs.

### Workstreams

#### Invoice lifecycle and Stripe

- Create invoice drafts with client, line items, service type, hours/amount/rate, due date, terms, currency, and one-time/recurring/usage type.
- Validate totals server-side using decimal arithmetic. Store Stripe customer/invoice references without treating local draft state as paid evidence.
- Send through Stripe-hosted payment pages and email; reconcile Draft/Sent/Paid/Overdue/Cancelled from signed webhooks plus periodic reconciliation.
- Deduplicate/replay Stripe events, handle out-of-order events, record immutable payment timeline, and surface mismatches.
- Schedule 3/7/14-day overdue reminders. Use Invoice Chaser Agent to draft/send according to configured approval policy and log communication.

#### Revenue and projection

- Calculate MRR from active retainer/recurring clients, total revenue from settled/recognized sources, revenue by client/service, and month-over-month change.
- Build 12-month MRR area chart and financial dashboard views.
- Project revenue from pipeline value and configured expected close probabilities; clearly label projections and assumptions.
- Create graph finance nodes and financial edges linking client → invoice → payment/finance hub; trigger realtime payment glow.

#### Expenses and cost ingestion

- Track API, tools, hosting, domain, and other categories.
- Automatically write OpenAI/Anthropic run costs into the expense/usage ledger without double counting retries.
- Support manual amount/category/date/notes/receipt upload with malware scan and signed storage access.
- Reconcile subscriptions/tools through manual records initially unless a supported provider adapter exists.

#### Profitability and reports

- Calculate `(Revenue - Expenses) / Revenue × 100` with defined zero-revenue behavior.
- Generate monthly/quarterly/yearly P&L, client profitability (client revenue minus API and attributable time/cost), cost per agent, and tax-ready income/expense CSV.
- Include source drill-down and generation timestamp in every report; PDFs/CSVs are immutable artifacts once shared.
- Implement finance endpoints for invoices, send, dashboard, P&L, client profitability, expenses list/create.

### Tests and evidence

- Decimal/rounding/currency, recurring MRR, statuses, due dates, reminder schedule, projection, margin-zero, P&L, attribution, and CSV tests.
- Stripe contract/sandbox tests for create/send/pay/fail/cancel, signature, replay, duplicate/out-of-order event, retry, and reconciliation.
- Receipt storage/security tests and API cost double-count prevention.
- E2E: draft invoice → send → sandbox pay → webhook → graph/dashboard → P&L/profitability/export; overdue alternative flow.
- Access tests proving finance data is owner-only and sensitive fields are encrypted/redacted.

### Exit criteria

- FR-FM-001-019 pass.
- Stripe is the verified external payment state; local and Stripe mismatches are visible and recoverable.
- MRR, revenue, expenses, profit margin, P&L, client profitability, and agent cost are reproducible from source records.
- Finance graph and realtime events work.
- Tax CSV is structurally valid but is not falsely represented as tax advice.

### Handoff artifacts

Accounting definitions, Stripe event/state map, reconciliation runbook, reminder policy, report samples, calculation test evidence, sensitive-data policy, and finance operating SOP.

---

## Part 11 - Knowledge Base, SOPs, Notifications, Reports, and Analytics

**Target window:** Weeks 15-16  
**Depends on:** All operational domains  
**Accountable scope:** FR-KB-001-014, FR-NA-001-004, FR-RA-001-008; all SRS notification trigger defaults/channels/priorities; dashboard and reports pages; knowledge APIs; notification APIs; reporting/export schedules; Weekly Reporter milestone.

### Objective

Close the learning and management loops. Operational activity becomes connected knowledge; knowledge improves agents and decisions; important events become configurable alerts; complete business data becomes dashboards and scheduled/shareable reports.

### Workstreams

#### Knowledge entries, search, and versions

- Implement Markdown entries with title, category, content, tags, links, version, access counts, and timestamps.
- Support SOP, Template, Brand Voice, Client Data, Industry Research, Lesson Learned, Decision, Meeting Note, and other categories.
- Sanitize Markdown for display; version every update, show diff/history, and allow audited revert by creating a new version.
- Generate embeddings and full-text indexes; expose keyword search under one second and semantic search under two seconds at target volume.
- Link entries to clients, agents, projects, SOPs, and decisions; show links in entity drawers.
- Suggest related knowledge by embedding similarity with threshold/explanation; allow dismiss/feedback.
- Let agents propose learnings after significant runs, but require policy/owner review before sensitive shared knowledge is created.

#### SOP operations

- Store ordered steps, materials, expected outcome, last tested date, usage count, and execution history.
- Link SOP versions to agents as operating procedures; an agent run records the exact SOP version.
- Update usage/last execution and flag SOPs unused for more than 30 days for review.
- Build SOP execution/checklist UI and graph nodes/edges.

#### Notification service

- Implement all SRS triggers with exact default channel/priority: agent error, overdue invoice, new lead, client reply, task due/overdue, cost threshold, weekly report, contract renewal, content schedule, and knowledge suggestion.
- Add owner toggles per type, quiet-hour timezone window, and daily digest for low-priority notifications.
- Build bell/unread count, list/unread-first, mark read, read all, toast, related-entity navigation, delivery attempts, and channel preferences.
- Quiet hours must not suppress durable critical records; defer configured channels and document critical override policy.
- Implement email and optional Slack delivery adapters with retries and deduplication.

#### Dashboard and reports

- Build configurable/reorderable widget dashboard: MRR, active clients, active/running agents, open tasks, pipeline value, 7/30-day sparklines, 12-month revenue, last ten runs, pipeline stages, unread notifications, and quick actions.
- Generate weekly summary: revenue, new clients, tasks, agent performance, pipeline changes.
- Generate monthly business review: P&L, retention, agent cost, content performance.
- Generate client-branded project/deliverable/metric PDF, protecting internal-only data.
- Export reports as PDF and CSV, store immutable artifacts, schedule generation, notify completion, and make them accessible from Reports.
- Implement Weekly Reporter Agent as an orchestrator over verified metrics, not a source of invented values.

### Tests and evidence

- Markdown sanitization, version/revert, embeddings, full-text/semantic relevance, related threshold, link, access count, and 10,000-entry performance tests.
- Cross-client knowledge/memory isolation and deletion tests.
- SOP version/execution/30-day flag tests.
- Table-driven tests for every notification trigger, default, toggle, quiet hour, digest, retry, duplicate, unread count, and channel failure.
- Dashboard widget order/persistence/data correctness and under-three-second load benchmark.
- Scheduled report, PDF/CSV content, branding, authorization, and no-fabrication tests.
- E2E: create/version/search/link knowledge → run SOP → event triggers notification → weekly report generated/exported.

### Exit criteria

- FR-KB-001-014, FR-NA-001-004, and FR-RA-001-008 pass.
- Every specified notification trigger/default works and can be independently configured.
- Knowledge search and dashboard meet performance targets at realistic volume.
- Scheduled weekly/monthly/client reports are reproducible from source metrics and export correctly.
- The graph displays knowledge/SOP links and relevant notification navigation.

### Handoff artifacts

Knowledge taxonomy, embedding/reindex procedure, search benchmark, SOP version policy, notification catalog/default matrix, dashboard metric definitions, report data dictionary/templates, and operations runbooks.

---

## Part 12 - System Integration, Hardening, Performance, Accessibility, Deployment, and Operations

**Target window:** Weeks 17-20  
**Depends on:** Parts 1-11 feature complete  
**Accountable scope:** NFR-P-001-010, NFR-S-001-006, NFR-R-001-006, NFR-U-001-006, NFR-PO-001-004, NFR-M-001-006; SEC-A/Z/E/API/I/C in full; deployment Sections 11.1-11.5; complete UI/responsive/accessibility validation; external integrations, realtime/webhook catalog, success metrics, documentation, and post-MVP seams.

### Objective

Turn feature-complete software into a verified operating system for the agency. This part resolves cross-domain gaps, removes production mocks, proves every SRS quality/security target, deploys monitored infrastructure, validates recovery, and delivers operating documentation.

### Workstreams

#### Cross-domain acceptance

- Execute all primary journeys across clients, graph, agents, four service systems, CRM, content, finance, knowledge, notifications, reports, export, and deletion.
- Verify every entity projects correctly into graph hubs/edges/drawers and realtime state survives reconnect.
- Verify audit, outbox, idempotency, approval, deletion, and cost behavior cannot be bypassed through alternate APIs, workers, retries, webhooks, or direct UI routes.
- Complete OpenAPI and compare shipped routes/events/webhooks with the SRS matrix.

#### Performance and scale

- Optimize bundles, SSR/data waterfalls, TanStack caching, Prisma indexes/queries, connection use, Redis caches, graph simulation/reconciliation, report jobs, and worker concurrency.
- Prove initial page <2 seconds; CRUD p95 <500 ms; graph targets; queue <5 seconds; realtime <2 seconds; search targets; dashboard <3 seconds; 10 MB upload <10 seconds.
- Prove 50 active clients, 30 concurrent agents, 10,000 knowledge entries, 500 graph nodes with planned filtering/pagination, 50 GB/100 GB capacity plan, and 500 pending jobs.
- Record production-like environment, dataset, run count, percentiles, failures, and headroom.

#### Reliability and degraded mode

- Apply three-attempt retry classification to every external adapter.
- Simulate OpenAI/Anthropic outage and verify all non-AI features remain fully functional and core cached data is read-only accessible where promised.
- Simulate Stripe, n8n, email, social, Redis worker, database, and realtime interruption; prove no lost/duplicated consequential action.
- Verify partial agent results and React widget error isolation.
- Define uptime SLI and alerting for the 99.5% target.

#### Security and privacy review

- Complete auth/session tests, owner-only authorization, Vault encryption, TLS, at-rest/application encryption, malware scan, body limits, Zod, ORM parameterization, XSS/CSP, CSRF, CORS, security headers, database SSL, dependency scans, backups/PITR, and Cloudflare protections.
- Threat-model uploads, retrieval/prompt injection, tool use, webhooks, SSRF, OAuth tokens, widget/public surfaces, exports, and deletion.
- Verify logs, Sentry, reports, analytics, and notifications redact secrets and sensitive content.
- Document provider data-processing agreements and full client export/deletion process.

#### Usability, responsive, and accessibility

- Verify primary actions are within two clicks, shortcuts work, terminology/statuses are consistent, destructive actions support seven-day undo, and a new operator can discover flows.
- Complete desktop/tablet/mobile audits, including mobile dashboard, notifications, client list, bottom tabs, stacked cards, and graph list fallback.
- Conduct WCAG 2.1 AA keyboard, screen reader, focus, labels, errors, contrast, reduced motion, tables, and graph-equivalence audit.

#### Deployment and operations

- Deploy frontend/API to Vercel, database/Auth/Realtime/Storage to Supabase, Redis to Upstash, and n8n to Railway/Render as specified.
- Configure Cloudflare domain/DNS/CDN/DDoS where used, Stripe and all enabled webhooks, provider secrets, environment allowlists, scheduled jobs, and budgets.
- Implement GitHub Actions push checks, PR preview, main deployment/migration, and weekly security scan.
- Activate Sentry, Vercel analytics, Axiom/Logtail, UptimeRobot, database health, queue/agent dashboards, and API cost alerts.
- Enable daily database backup with 30-day retention/PITR and storage versioning. Perform a timed restore proving RPO ≤24 hours and RTO ≤1 hour.
- Keep encrypted platform secrets outside Git; document secret inventory/recovery references rather than storing values in repository configuration.

#### Documentation and operating readiness

- Complete module docs, API docs, architecture diagrams, ADRs, environment guide, agency operating SOP, incident response, provider outage, webhook replay, failed job, billing reconciliation, migration, rollback, restore, export/delete, and key-rotation runbooks.
- Instrument Month 6/12 target metrics: active clients, MRR, operational agents, success rate, API cost, owner hours/client/week, uptime, knowledge count, and profit margin.
- Add feature flags and dormant extension seams for SRS post-MVP items; do not expose incomplete future functionality.

### Required final tests

- Unit/domain coverage ≥70% core logic and ≥50% UI components, plus critical-path quality review.
- Complete integration, contract, E2E, load, fault-injection, security, accessibility, responsive, migration, export/delete, and backup/restore suites.
- Sandbox smoke tests for every enabled external integration and explicit “not configured” behavior for optional integrations.
- Production smoke test after deployment without seed/demo records or real external effects beyond controlled verification.

### Exit criteria

- Traceability reports 246/246 numbered requirements covered and all unnumbered obligation categories checked.
- All performance, scalability, reliability, usability, portability, maintainability, security, accessibility, RPO, and RTO targets have passing evidence or a documented no-go.
- CI/CD, monitoring, alerts, budgets, backups, and runbooks are active.
- No production path depends on mocks, hard-coded secrets, unapproved consequential actions, or unverified external state.
- SRS Phase 5 exit criteria hold: production-ready for a 10-15 client agency, optimized costs, complete documentation, and repeatable operations.
- A signed go/no-go record names release owner, rollback method, residual risks, and 72-hour monitoring plan.

### Handoff artifacts

Production release record, complete test/security/performance/accessibility reports, OpenAPI, architecture/ER diagrams, deployment inventory, restore evidence, monitoring links, incident runbooks, owner operating manual, success-metric dashboard, and prioritized post-MVP backlog.

---

## 5. Dependency graph and parallelization

The strict dependency chain is:

`Part 1 → Part 2 → Part 3 → Part 4 → Part 5 → service/business parts → Part 11 → Part 12`

After Part 5, Parts 6, 7, 8, 9, and 10 can be developed in parallel by separate teams if they share contract versions and integration environments. Part 8 depends on report contracts but can define artifacts before Part 11. Part 10 should begin early enough for Stripe webhook observation before release. Part 11 requires stable events/metrics from all domains. Part 12 is never parallelized away; it is a whole-system acceptance period.

Use feature flags for incomplete modules, migrations compatible with the currently deployed version, and contract tests to avoid integration-day surprises.

---

## 6. Risk register

| Risk | Impact | Early indicator | Mitigation | Owner gate |
|---|---|---|---|---|
| Scope density exceeds 20 weeks for one developer | Quality cuts or unfinished requirements | Part exits repeatedly slip | Extend calendar, parallelize after Part 5, preserve vertical slices; do not remove SRS scope silently | Weekly scope/quality review |
| Graph performance/ease of use fails at scale | Signature feature becomes unusable | Frame drops, labels overlap, owner avoids graph | SVG/Canvas switching, incremental simulation, LENS, list fallback, 100/300/500-node benchmarks | Part 4 and 12 |
| LLM output is unreliable or expensive | Client harm and margin erosion | Low success rate, retries, rising tokens | Grounding, approval, budgets, model routing, evaluation samples, cost dashboards | Parts 5-12 |
| Cross-client data leakage | Critical confidentiality failure | Retrieval or reports contain wrong client | Scope keys, RLS/owner checks, query tests, deletion linkage, redaction | Every AI/data part |
| Third-party API changes/outages | Broken production services | Contract failures, webhook lag | Adapters, version pinning, retries, health, reconciliation, degraded mode | Parts 2 and 12 |
| Duplicate external effects | Duplicate invoice/email/publication/workflow | Replayed webhook/job creates action | Idempotency, provider IDs, outbox, webhook receipt, locks | Every external action |
| “Scraping” violates provider terms | Account/legal/reputation risk | CAPTCHA/rate blocks or ToS conflict | Official APIs, authorized exports, per-source compliance review; no evasion | Part 9 |
| Financial metrics disagree | Owner decisions and reports unreliable | Stripe/local mismatch, unexplained totals | Immutable ledger, decimal arithmetic, reconciliation, drill-down, calculation tests | Part 10 |
| OAuth/secrets leak | Account compromise | Tokens in logs/client payload | Vault, server-only adapters, redaction, key rotation, scans | Parts 1, 2, 12 |
| Backups exist but restore fails | Prolonged data loss | No recent restore evidence | Timed restore drills, documented dependencies, RPO/RTO monitoring | Part 12 |
| Accessibility added too late | Major UI rework | Keyboard/reader failures across modules | Accessible primitives and tests in each part, final audit | Every UI part |
| Future features contaminate owner-only model | Authorization gaps | Role logic/public routes appear without threat model | Feature flags and dormant seams only; separate future roadmap | Part 12 |

---

## 7. SRS phase exits translated into product demonstrations

### Foundation demonstration

Login; create an active client with contact/project; view it as a graph node; open detail; apply filter; archive and recover it. This preserves the original Phase 1 exit criteria.

### Agent-core demonstration

Create/configure an agent; select model/tools/schedule/budget; run in BullMQ; observe graph status; approve a paused action; inspect output, cost, logs, memory, and retry behavior. This preserves Phase 2 exit criteria.

### Services and finance demonstration

Use at least four operational agents across chatbot, workflow, lead/content/report/invoice work; create/send/reconcile an invoice; capture API expenses; inspect MRR, margin, P&L, client profitability, and finance graph. This preserves Phase 3 exit criteria.

### Full business-management demonstration

Move an agency lead through CRM and proposal; produce/schedule content; search/link knowledge and execute an SOP; configure notifications; use all three LENS filters; generate weekly/monthly reports. This preserves Phase 4 exit criteria.

### Production-scale demonstration

Run production-like load/security/accessibility/failure tests, export data, restore backup, operate mobile critical views, verify monitoring/cost controls, and follow the documented agency SOP. This preserves Phase 5 exit criteria.

---

## 8. Post-MVP roadmap guardrails

After stable production operation, evaluate SRS future enhancements in this order:

1. **Authorization foundation and client portal:** design true multi-user/RLS/tenant boundaries before any shared view.
2. **Contractor roles:** least-privilege project access, audit, invitation, offboarding.
3. **White-labeling:** theme/domain/email/report isolation and commercial configuration.
4. **Calendar and Slack interfaces:** command authorization, confirmations, rate limits, and audit.
5. **Predictive analytics:** data quality and explainability before churn/revenue predictions.
6. **PWA/native mobile and voice:** privacy, offline conflict, device security, spoken confirmation.
7. **Marketplace/custom integration builder:** package signing, permission model, sandboxing, review, billing, and supply-chain threat model.

Each becomes a separately approved SRS/PRD and threat model. The initial product's owner-only assumptions must not be extended implicitly.

---

## 9. Business success measurement

Instrument the SRS targets without pre-populating them as achievements:

| Metric | Month 6 goal | Month 12 goal | Measurement source |
|---|---:|---:|---|
| Active clients managed | 5-8 | 10-15 | Active client records and dates |
| Monthly recurring revenue | $5,000-$10,000 | $15,000-$25,000 | Active recurring invoices/ledger |
| Operational AI agents | 6-8 | 10-15 | Enabled agents with successful recent run |
| Agent success rate | >90% | >95% | Agent-run terminal states |
| Monthly API cost | <$200 | <$400 | Provider usage ledger |
| Owner hours/client/week | <3 | <2 | Manual plus agent-attributed time records |
| System uptime | >99% | >99.5% | External uptime and service SLI |
| Knowledge entries | 100+ | 300+ | Active knowledge records |
| Profit margin | >80% | >85% | Reconciled revenue and expense ledger |

Review metrics monthly alongside data-quality notes. Success metrics guide improvement; they do not authorize hiding failures or reducing service quality.

---

## 10. Roadmap definition of done

The roadmap is complete only when the production system:

- fulfills every numbered and unnumbered SRS obligation assigned to the initial release;
- is operable by one owner without hidden manual database steps;
- exposes secured/versioned APIs for all operational functions;
- keeps AI and external effects observable, budgeted, scoped, approved, and recoverable;
- makes business relationships and realtime state visible through the knowledge graph;
- meets documented performance, scale, reliability, security, usability, portability, maintainability, accessibility, backup, RPO, and RTO targets;
- exports owned data and provides complete operating/runbook documentation;
- leaves future scope clearly gated rather than falsely implemented.
