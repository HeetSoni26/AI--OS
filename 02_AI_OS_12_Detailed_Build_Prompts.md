# AI Automation Agency OS - 12 Detailed Build Prompts

**How to use:** Give these prompts to a coding agent in numerical order. Do not shorten them. Attach or provide repository access to the original SRS (`SRS-AIOS-2026-001`) and this roadmap package. Complete and verify one part before starting the next.

Each prompt treats the original SRS as the source of truth. If a prompt and the SRS appear to conflict, preserve the SRS and document the interpretation. A **Recommended Addition** strengthens delivery but cannot remove or weaken SRS scope.

---

## Prompt 1 - Product Foundation, Secure Authentication, and Delivery Baseline

You are the lead platform engineer implementing **Part 1 of 12** of the AI Automation Agency OS, a single-owner web command center defined by `AI_Automation_Agency_OS_SRS.docx` (SRS-AIOS-2026-001). Work in the existing repository. First inspect all files, current scripts, dependency versions, instruction files, and git status. Do not overwrite valid work or assume the repository is empty. If architecture already exists, map it to the requirements and make the smallest coherent changes. Before meaningful edits, present a concise implementation plan.

### Objective and scope

Build a secure, reproducible foundation using the SRS stack: Next.js 14+ App Router, React 18+, TypeScript 5+, Tailwind CSS 3+, shadcn/ui, TanStack Query 5+, Zustand, Framer Motion, React Hook Form, Zod, and Supabase Auth. Implement **SEC-A-001-SEC-A-006**, owner-only foundations from **SEC-Z-001-002**, applicable **SEC-E-001/003**, **SEC-API-005-007**, **SEC-I-001/005**, **NFR-U-001-005**, and **NFR-M-001/005/006**. Implement the SRS dark design language, responsive shell, route protection, session policy, security headers, environment management, initial testing, CI, logging, and error isolation. Do not implement multi-user roles or client portal access.

### Required implementation

1. Establish a domain-oriented repository layout, strict TypeScript, path aliases, server/client import boundaries, lint/format rules, unit/component/E2E test harnesses, and documented scripts for `dev`, `lint`, `typecheck`, `test`, `test:e2e`, and production `build`.
2. Pin exact compatible dependency versions and commit a lockfile. Keep the SRS technologies unless an incompatibility is demonstrated; record any substitution in `docs/adr/ADR-001-platform-baseline.md`.
3. Validate environment variables at startup with separate server/client schemas. Provide `.env.example` containing names only. Never expose `SUPABASE_SERVICE_KEY`, provider keys, Stripe secrets, Redis credentials, or other server values in client bundles or logs.
4. Configure Supabase Auth for email/password plus Google and GitHub OAuth. Implement login, OAuth callback, reset/change password, expired session, logout, and unauthorized states. Enforce minimum eight-character complexity, five login attempts per 15 minutes per IP, one-hour access/JWT intent, 30-day refresh policy, and session invalidation after password change. Document provider-console settings that cannot be applied in code.
5. Protect every application page and API placeholder except a minimal health endpoint. Use owner-only authorization; create an owner bootstrap/onboarding method without general RBAC.
6. Implement the final application frame: 48 px top bar with system name, Cmd/Ctrl+K search trigger, notification trigger, and owner avatar; 240 px collapsible left navigation; main area; 320 px contextual right-panel slot; 480 px detail-drawer contract. Navigation must include Dashboard, Knowledge Graph, Clients, Agents, Services, Finance, Pipeline, Knowledge Base, Reports, and Settings.
7. Implement desktop (≥1280), tablet (768-1279, icon-only/collapsible sidebar), and mobile (<768, bottom tab navigation) foundations. Placeholder pages may explain “not yet implemented” but may not return fake data or fake successful actions.
8. Encode design tokens exactly from the SRS: `#07080F`, `#0C1020`, `#111533`, neon cyan `#00F0FF`, pink `#FF2E97`, green `#39FF14`, purple `#B026FF`, orange `#FF6B2B`, text and borders; Space Grotesk, JetBrains Mono; card/button/input radii; flat borders/glow; 40 px grid and 3.5% noise treatment. Add reduced-motion handling and contrast-safe semantic states.
9. Build accessible primitives: landmarks, skip link, visible focus, keyboard navigation, icon-button labels, dialogs/drawers with focus management, loading/skeleton/empty/error states, and screen-reader notification region.
10. Add React error boundaries at page/widget boundaries so one widget cannot crash the full dashboard.
11. Implement structured logging and correlation ID helpers with secret/token/email-sensitive redaction. Set CSP foundation, HSTS in production, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, SameSite cookie policy, CSRF strategy, and CORS allowlist configuration.
12. Add GitHub Actions that run lint, typecheck, automated tests, and production build on every push; define safe preview and production jobs without real secrets or irreversible migrations.
13. Add architecture, setup, environment, auth, and troubleshooting documentation. Keep comments focused and match repository style.

### Verification required

- Unit-test environment parsing, redaction, navigation configuration, auth/authorization helpers, and security-header configuration.
- Integration-test unauthenticated/expired/valid sessions for protected pages and APIs, refresh behavior, logout, and password-change invalidation where the Supabase test environment allows it.
- E2E-test successful/failed login, throttle response, logout, keyboard traversal, mobile/tablet/desktop shell, focus management, and a deliberately failed widget caught by an error boundary.
- Run automated accessibility checks on authentication and shell routes.
- Run secret scanning or equivalent checks and inspect production bundles for server environment leakage.
- Run every documented command and report the exact outcome. Do not say “should pass.”

### Definition of done

A fresh checkout boots from documentation; authentication and protected routes work; the responsive final shell is usable by keyboard; environment validation, security headers, logging/redaction, and error boundaries are active; CI passes lint/typecheck/tests/build; no real secret is committed; no multi-user functionality was introduced. Update the SRS traceability notes for Part 1.

### Handoff response

Return: implementation summary; changed files; dependency/version decisions; configuration still required in Supabase/OAuth hosts; tests and exact results; screenshots or route list; known issues/risks; ADRs; and the precise repository state that Prompt 2 should assume. Do not start Part 2.

---

## Prompt 2 - Data Platform, API Standards, Auditability, and Shared Services

You are the lead backend/data engineer implementing **Part 2 of 12**. Begin by reading the SRS, Part 1 handoff, Prisma/schema code, auth helpers, environment validation, test setup, and git status. Preserve the working Part 1 shell and its contracts. Present a migration-aware plan before editing. Never run a destructive database command against a non-ephemeral environment without explicit authorization and a backup.

### Objective and scope

Implement the SRS Section 7 data model and relationships, Section 7.4 storage strategy, Section 8.1 API principles, Section 11.2 environment contract, **NFR-PO-001-004**, **NFR-M-002/003/006**, **SEC-Z-003-005**, **SEC-E-002-004**, **SEC-API-001-004**, and **SEC-C-001/003**. Build the complete data/API platform needed by all later parts, including supporting records required to implement the SRS. Do not build empty generic frameworks or expose production secrets.

### Required implementation

1. Configure Prisma 5+ for PostgreSQL 16+/Supabase and enable pgvector. Model all SRS core entities with stated fields, types, enums, constraints, defaults, timestamps, and relationships: Clients, AI Agents, Agent Runs, Projects, Invoices, Knowledge Base Entries with `VECTOR(1536)`, Pipeline Leads, Graph Edges, and Notifications.
2. Add normalized support entities needed by SRS behavior: contacts, communications, tasks, assignments, deliverables, time entries, expenses/cost ledger, payments, integration connections, agent configuration versions, agent memory/summaries, approvals, chatbot configs/sources/Q&A/conversations/messages, workflows/versions/executions, content strategies/brand profiles/artifacts/calendar/publish events/metrics, sourced leads/research/outreach events, proposals/versions, knowledge versions/links, SOP steps/executions, audit events, webhook receipts, outbox events, scheduled jobs, file metadata, report artifacts, exports, and delayed deletion/recovery requests. Document why each support table exists.
3. Use UUIDs, timezone-aware timestamps, Decimal/Numeric money, explicit SRS enums, foreign keys, useful indexes, full-text indexes, vector indexes appropriate to pgvector scale, and unique/check constraints. Enforce at most one primary contact per client and nonnegative financial/cost fields. Do not put query-critical data only in JSONB.
4. Create safe versioned migrations. Test migration on an empty database and a previous/seeded schema. Provide forward-fix or rollback instructions and index/backfill/lock considerations.
5. Create synthetic seed fixtures covering every graph node type and representative statuses. Do not use real client data or invented “actual” business performance.
6. Configure Supabase Storage design for client files, logos, receipts, templates, media, chatbot sources, exports, and reports with signed/private access. Implement file metadata and ownership references.
7. Define Redis namespaces for cache, rate limiting, BullMQ, locks, and sessions. Ensure durable business truth is always recoverable from PostgreSQL/storage.
8. Implement reusable `/api/v1` route helpers: Supabase bearer auth, owner authorization, Zod validation, error `{ error: { code, message, details } }`, response `{ data, meta: { total, cursor, hasMore } }`, cursor pagination, correlation IDs, and no sensitive error leakage.
9. Enforce 100 requests/minute per authenticated session, 10 MB standard body, and 100 MB file-upload limits. Add a minimal public health check and authenticated readiness diagnostics.
10. Generate OpenAPI/Swagger for every implemented API, security scheme, schemas, pagination, examples, and normalized errors. Treat OpenAPI drift as a failing test.
11. Implement mutation audit logging (`actor`, action, entity, timestamp, correlation ID, redacted change summary), seven-day archive/recovery/deletion primitives, an export job/manifest foundation, and data-deletion planning.
12. Implement a transactional outbox and idempotency/replay contracts for later email, Stripe, publishing, workflow, and agent effects. Add webhook receipt/event-ID deduplication, normalized status, raw-payload retention policy, and dead-letter/replay state.
13. Define typed adapters for OpenAI, Anthropic, n8n, Make.com, Stripe, Gmail/Google, Slack, LinkedIn, X, WordPress, Mailchimp, SendGrid/Resend/SMTP, Twilio, Calendly/Cal.com, Notion, GitHub, approved lead sources, storage, and malware scanning. Store credentials using Supabase Vault references/AES-256; application tables contain only safe metadata.
14. Add data dictionary, ER diagram source, migration guide, API conventions, adapter rules, data classification, storage policy, archive/delete/export behavior, and seed documentation.

### Verification required

- Prove all SRS fields/enums/relationships/defaults exist with schema tests.
- Run migrations on clean and seeded ephemeral databases; report commands and results.
- Test vector extension, embedding insert/query, full-text query, referential constraints, one-primary-contact rule, money precision, and indexes.
- Contract-test auth, errors, envelope, cursor pagination, Zod validation, rate limit, request limits, correlation IDs, and OpenAPI generation.
- Test audit redaction, outbox atomicity, webhook deduplication/replay, delayed deletion/recovery clock, export manifest, signed storage policy, and Vault secret non-disclosure.
- Verify JSON/CSV portability for representative records and that no required business data exists only in Redis.

### Definition of done

A clean PostgreSQL/pgvector database migrates and seeds; every SRS core entity and relationship is present; support tables have traced rationale; API/auth/error/pagination/OpenAPI contracts are reusable; audit, outbox, webhook receipt, recovery, export, storage, Redis, and Vault foundations pass integration tests; migrations have recovery instructions; Part 1 remains green.

### Handoff response

Return schema/ER summary, migrations and hashes, field/enum deviations (ideally none), OpenAPI location, new environment names, seed instructions, test outputs, data risks, ADRs, and the exact contracts Part 3 must use. Do not start client features.

---

## Prompt 3 - Client Operations, Contacts, Projects, Deliverables, and Communications

You are the full-stack domain engineer implementing **Part 3 of 12**. Inspect the Part 1-2 code, schema, API conventions, storage policy, audit/outbox infrastructure, UI patterns, and handoffs. Preserve all tests. Implement vertical slices rather than UI-only mocks.

### Objective and SRS accountability

Implement **FR-CM-001 through FR-CM-020** in full, plus related SRS project/task/storage/Gmail/graph/event/UI rules. The owner must manage client lifecycle, contacts, projects, assignments, time, deliverables, and communications through secured APIs and accessible responsive UI. This part is accountable for the Clients page and graph-ready client/contact projection events.

### Required implementation

1. Implement client create/update/archive/recover/permanent-delete for every SRS field and statuses Prospect, Onboarding, Active, Paused, Churned. Permanent deletion needs confirmation and delayed execution with a seven-day undo. Maintain an extensible deletion-impact registry for data added later.
2. Validate and persist name, industry, contact fields, website, notes, logo, MRR, total revenue, start date, timestamps, and audit history. Store logos privately with signed access and safe image validation.
3. Implement list/grid toggle, cursor pagination, fuzzy search, filters, status tabs, and sorting by name, MRR, start date, and status. Implement accessible data-table headers and non-color status labels.
4. Support multiple contacts per client with name, role, email, phone, notes, exactly one optional primary contact, and last contact date. Update the primary-contact summary without losing normalized contacts.
5. Implement projects with Chatbot Build, Workflow Automation, Content Package, Lead Generation, Custom types and Planning, In Progress, Review, Delivered, Revision, Complete statuses. Track description, dates, price, client, and status history.
6. Implement agent/human task assignment records. Agent assignments may remain inactive until Part 5 but must be real persisted relationships, not strings.
7. Implement manual time entries and an aggregation interface for automatic agent-run duration. Prevent negative/overlapping invalid records as appropriate and keep attribution visible.
8. Implement ordered deliverable checklist with required/optional items. Block `Delivered` until every required deliverable is complete; return a domain error listing blockers and show it accessibly.
9. Implement chronological communications for email, notes, call summaries, and Slack messages with date, summary, next action, source, and provider ID. Add manual logging UI.
10. Implement the Gmail OAuth adapter/ingestion rule: auto-log integrated Gmail messages whose sender/recipient matches a client contact email. Normalize addresses, deduplicate provider message IDs, update last-contact date, handle revoked OAuth, and never expose message content beyond owner access.
11. Implement the exact SRS APIs: `GET/POST /api/v1/clients`, `GET/PATCH/DELETE /api/v1/clients/:id`, `GET /api/v1/clients/:id/projects`, `GET /api/v1/clients/:id/invoices` (real empty relation, not fake), and `GET/POST /api/v1/clients/:id/communications`. Add consistent contact/project/time/deliverable routes and document all in OpenAPI.
12. Build Clients page, “New Client,” create/edit forms, list/grid, filters, full profile, contextual sidebar, and node-compatible 480 px drawer. Include projects, agents/assignments, contacts, communications, invoices relation, linked knowledge slot, activity, and quick actions. Later features may be disabled visibly; never claim success.
13. Publish typed transactional outbox events for client/contact/project/communication create/update/archive/delete so Part 4 can project nodes and realtime updates.
14. Apply audit, idempotency where applicable, authorization, rate limiting, error contract, loading/empty/error states, responsive behavior, and WCAG patterns from prior parts.

### Verification required

- Unit-test all statuses, one-primary-contact, deliverable gate, time aggregation, archive/recovery/deletion, validation, and communication matching.
- API integration-test every route, auth, pagination/filter/sort, negative cases, audit event, outbox event, and storage access.
- Gmail contract-test match/no-match, multiple contacts, duplicates, malformed events, rate limit, revoked token, and retry.
- E2E: create client and logo → add contacts/primary → create project → assign work/time → fail then satisfy deliverables → log communication → archive → recover; verify responsive table/drawer and keyboard behavior.
- Verify client data never appears in public responses/logs and destructive UI has confirmation plus recovery.

### Definition of done

FR-CM-001-020 each has a passing test/acceptance reference; all client data can be managed via UI and API; Gmail auto-log is implemented through an adapter; graph projection events are durable; audit and seven-day undo work; prior tests remain green; no fake invoice/agent/knowledge data is shown.

### Handoff response

Return requirement checklist, changed files, endpoints, migrations, event contracts, Gmail setup, deletion registry, test results, accessibility notes, screenshots/routes, risks, and graph projection payloads for Prompt 4. Do not implement the graph renderer.

---

## Prompt 4 - Knowledge Graph Command Center and Realtime Business Map

You are the visualization and realtime lead implementing **Part 4 of 12**, the signature feature of the product. Inspect existing entity/event contracts, client UI, accessibility primitives, and SRS Section 4 line by line. Do not simplify the graph into a static diagram. Build an extensible graph platform that shows current data now and accepts later module projections without renderer rewrites.

### Objective and SRS accountability

Implement SRS Sections **4.1-4.10**, graph APIs in **8.2.3**, applicable realtime events in **8.3**, Knowledge Graph page in **10.3.2**, responsive/accessibility requirements, **NFR-P-002/003/006**, and **NFR-S-004**. Preserve exact node types/colors/icons/sizes/metadata, hubs, edge semantics, LENS filters, directory interactions, drawers, visual design, realtime reactions, and performance targets.

### Required implementation

1. Define stable `NodeData`, `EdgeData`, `Hub`, filter, detail, and realtime event contracts. Build a graph read model from source entities plus explicit `graph_edges`; do not duplicate source truth.
2. Support Client, AI Agent, Tool, SOP, Human/Contact, Task, Decision, Knowledge/Memory, Revenue/Finance, and Hub types with SRS colors, icon semantics, radius, and metadata. Empty future types still exist in legend/contracts but must not show fake nodes.
3. Create Command, Clients, Agents, Finance, Pipeline/CRM, Content, Knowledge, Automations, and Tools hubs with SRS placement hints, contained types, counts, and summary contracts.
4. Support Ownership, Assignment, Data Flow, Dependency, Trigger, Reference, and Financial edges with required solid/dashed/dotted/animated/arrow/green visual behavior and accessible labels.
5. Implement `GET /api/v1/graph`, `/graph/nodes`, `/graph/edges`, `POST /graph/edges`, `DELETE /graph/edges/:id`, `GET /graph/nodes/:id`, and `/graph/search`; include auth, filters, cursor/volume controls, fuzzy search, OpenAPI, and explicit relationship validation.
6. Use D3 force-directed simulation (or the SRS-permitted Vis.js with a documented ADR) with SVG for crisp normal views and Canvas fallback for larger views. Implement hub clustering, configurable charge/link/centering, zoom scale `[0.1,4]`, pan, drag, and stable incremental updates.
7. Implement all interactions: wheel/pinch zoom, empty-canvas pan, click select/detail drawer, Shift+click and box multi-select with batch-action surface, hover tooltip, drag reposition, fullscreen, double-click/Escape reset, Cmd/Ctrl+K fuzzy search, and node context menu Open/Edit/Connect/Archive/Delete. Provide keyboard alternatives for mouse/right-click/drag actions.
8. Implement LENS Entity (all listed types), Function (all hubs), and Action (Active/Running, Blocked, Completed, Pending, Scheduled, Failed) filters. Filters combine, excluded nodes fade to 10% rather than disappear, active filters appear as dismissible tags, state persists in URL parameters, and Clear All resets.
9. Build right Directory sidebar with expandable AI Agents, Clients sorted by MRR, Tools, Recent Tasks, and Knowledge groups; counts/status dots, search, category collapse, graph centering/highlight, and permitted drag reposition. Future empty groups show honest empty state.
10. Build node detail system matching client, AI agent, and Task/SOP/Knowledge drawer fields and quick actions. Implement client/contact now and renderer slots for later domains. Include activity, connections, and graph navigation.
11. Match the visual specification: `#07080F`, 40 px cyan grid, node glow, animated data-flow dashes, Space Grotesk 12 px labels, hover 120%, selected ring, bright connected edges, Framer/D3 transitions, legend bottom-left, and reduced-motion equivalents.
12. Subscribe to Supabase Realtime and typed channels/events for node/edge create/update/delete, agent status/run, payment, and notification. Implement entrance, pulse, shrink/fade, edge draw/dissolve, running ring, completion check, error shake/state, and payment glow. On disconnect/reconnect, refetch authoritative data.
13. Desktop shows full canvas/directory; tablet has slide-in/collapsible sidebars; mobile uses a fully functional searchable/filterable list representation, not a tiny force graph.
14. Make graph accessible: keyboard node traversal/selection, focus state, screen-reader descriptions of node type/status/metadata/connections, live announcements, non-color status, accessible menu/tooltips, and equivalent list actions.
15. Profile and optimize. Do not render hidden expensive effects unnecessarily. Record renderer switching threshold and behavior at 500 nodes.

### Verification required

- Unit-test projections, filters/combinations/URL serialization, edge styles, event reducers, hub membership, and detail resolution.
- API/realtime integration-test every endpoint/event, auth, invalid relationship, duplicate edge, reconnect/refetch, and deletion.
- Component/E2E-test every listed interaction, keyboard alternative, directory, LENS tags, shared URL, drawer, legend, responsive fallback, and reduced motion.
- Benchmark ≤100 nodes under one second and 100-300 under three seconds with Canvas fallback; test 500-node filter/pagination behavior and record frame rate/hardware/browser.
- Run WCAG checks and a manual screen-reader/keyboard audit.

### Definition of done

Every SRS Section 4 behavior is implemented or honestly empty pending later data; Phase 1 graph exit flow works; all graph APIs and realtime contracts work; performance targets pass; mobile list is equivalent for critical actions; later domains can register projections without core-renderer changes; no accessibility path depends solely on color, hover, right-click, or drag.

### Handoff response

Return graph architecture, contracts/events, projection registration guide, endpoint list, benchmark data, accessibility results, screenshots/video paths, tests, known performance risks, and exact integration points for Prompt 5. Do not create AI-agent business logic.

---

## Prompt 5 - AI Agent Runtime, Memory, Scheduling, Cost Control, and Monitoring

You are the AI platform lead implementing **Part 5 of 12**. Read **FR-AM-001-024**, the queue/data/graph contracts, security policies, and existing code. Preserve provider independence and owner authority. Do not implement each service agent as a separate ad hoc API call; create one reusable runtime.

### Objective and SRS accountability

Deliver all **FR-AM-001 through FR-AM-024**, AI Agent APIs in Section 8.2.2, `agent:status` realtime events, Agents page/drawer, BullMQ execution, LangChain.js where useful, OpenAI/Anthropic providers, memory, tools, schedules, chaining, human approval, retries, budgets, costs, logs, alerts, and graph states. Meet relevant **NFR-P-005**, **NFR-S-002/006**, and **NFR-R-002/004/005**.

### Required implementation

1. Implement CRUD/configuration for every SRS agent type and model choice, description, model parameters, rich system prompt, assigned tools, clients/hubs, daily token budget, and Manual/Scheduled cron/Event webhook trigger.
2. Version configuration. Every run records exact model, prompt version, parameters, tools, scope, and initiating trigger.
3. Implement required APIs: list/detail/create/update/delete, run, pause, resume, runs history, memory get/update. Use API v1 contracts, filters, cursor pagination, auth, audit, idempotency, and OpenAPI.
4. Build BullMQ producers/workers. Persist queued → running → success/failed/timeout; run start/end/duration/input/output/tokens/cost/error/metadata; save partial output; three exponential-backoff retries only for retryable failures; dead-letter/replay after exhaustion.
5. Support manual, validated cron, webhook, and chained triggers. Agent A output may trigger B, but enforce cycle detection, max depth, idempotent chain events, and budget propagation.
6. Implement human-in-the-loop checkpoints that persist a draft and pause before high-impact tool use. Approval links owner, artifact/config version, time, and intended action. Editing invalidates approval. Resume must be replay-safe.
7. Build OpenAI and Anthropic adapters and normalized model gateway. Support SRS models through configurable IDs. Normalize messages/tool calls, timeout/cancel, usage, pricing, retry classification, and errors. Record every billable attempt.
8. Build least-privilege tools for web search, file read/write, code execution, API calls, and email sending. Sandbox or constrain file/code operations; scope files by client; protect against retrieved prompt injection; require approval for consequential actions; redact secrets.
9. Enforce daily per-agent token budget before and during execution/retry/chain. Track input/output tokens, run cost, cumulative agent cost, client cost, model cost, total runs, last status, and success rate transactionally. Generate threshold events.
10. Implement persistent key/value plus vector memory. Scope by agent and optionally client; do not retrieve across clients unless an explicit approved link exists. Let owner view/edit with versions/audit. Summarize older entries near context limits while retaining source provenance. Link deletion to client deletion.
11. Build Agents page cards and detail/configuration UI with status dot plus text, last run, total runs/cost, success rate, last 20 executions, current progress, prompt/model/tools, memory viewer/editor, errors/stacks safe for owner, connected tools, assignments, Run/Pause/Edit/Logs actions, and output previews.
12. Project agents and assignments to graph. Publish green running/yellow idle/red error/gray paused/scheduled states, `status_changed`, `run_completed`, and `run_failed`; support graph animations and agent drawer.
13. Emit failure events for email, in-app, optional Slack and cost alerts; Part 11 will deliver complete preferences, but create durable notification records/events now.
14. Ensure an LLM outage leaves clients, graph, finance foundations, and other non-AI routes functional with clear unavailable state.
15. Add run cancellation/timeouts, worker health/readiness, queue depth/age metrics, correlation/run IDs, structured logs, Sentry context, and operator replay controls.

### Verification required

- Unit-test configuration, models/parameters, state transitions, cron, retries, chain cycles/depth, approval, budget, token/cost math, success rate, memory scope, summarization, and deletion.
- Integration-test BullMQ dispatch, concurrency, 500 queued jobs, 30 concurrent runs, <5-second start target, retries, timeout, partial output, dead letter, replay, pause/resume, and duplicate trigger.
- Contract-test both provider adapters with deterministic fixtures and sandbox smoke calls if credentials are available; skip with explicit evidence if not configured.
- Security-test cross-client memory/files, forbidden tools, prompt injection content, approval bypass through API/worker/replay, and log/notification redaction.
- E2E: create agent → configure model/prompt/tools/schedule/budget → run → pause for approval → approve → complete → inspect graph/log/cost/output/memory → pause/resume.
- Simulate provider outage and prove non-AI features remain operational.

### Definition of done

FR-AM-001-024 and all agent APIs/events are complete; service agents can plug into one runtime; budgets, approval, scope, retries, logs, memory, graph, and monitoring cannot be bypassed; target queue/concurrency/load evidence exists; provider outage degrades only AI features; prior parts remain green.

### Handoff response

Return runtime architecture, worker topology, APIs, event schemas, tool permission table, model/pricing config, memory scope proof, load/test results, provider setup, queue/DLQ runbook, migrations, risks, and strategy interface for Prompt 6/7/8/9/10 service agents.

---

## Prompt 6 - Chatbot Builder and Omnichannel Conversation Operations

You are the conversational AI service lead implementing **Part 6 of 12**. Inspect the agent strategy interface, client scope, storage/malware adapters, knowledge/vector design, approvals, graph projection system, and test conventions. Implement **FR-CB-001-017** completely; do not substitute a demo chat window for deployable service operations.

### Required result

Build a client-scoped Chatbot Builder Agent that ingests FAQ documents, URLs, and product material; creates reviewed Q&A/configuration; deploys a website widget and supported channel adapters; handles 10-message context, confidence escalation, lead capture, booking, recommendations, actions, transcripts, intent/sentiment, human takeover, review, reporting, and prompt A/B testing.

### Required implementation

1. Implement source upload/URL ingestion with client ownership, supported type/size validation, 100 MB outer upload limit, malware scan before availability, safe document parsing, SSRF-safe URL fetching, timeout, active-content sanitization, provenance, and deletion linkage.
2. Chunk approved sources, create structured Q&A pairs, embeddings, confidence/evidence fields, and owner review/edit before publication. Never let document/web instructions override system/tool policies.
3. Implement chatbot versions containing name, brand voice, greeting, fallback, escalation rules, confidence threshold, platform, custom actions, booking/recommendation settings, approved knowledge version, model, and status.
4. Implement Website widget with generated embeddable JavaScript, allowed-domain configuration, secure short-lived conversation tokens, rate limiting, CSP/integration instructions, version/rollback, accessible UI, and no server secret in embed code.
5. Implement adapters/contracts for Twilio WhatsApp, Instagram DM, and custom API. Normalize inbound/outbound messages, verify signatures, deduplicate events, apply retries/rate limits, and expose clear “not configured” state rather than fake delivery.
6. Maintain full persisted transcripts but only last 10 messages in active conversation context. Isolate every conversation, bot, source, lead, and memory by client.
7. Ground FAQ responses in approved knowledge. When confidence is below configurable threshold, use fallback and escalate to a human instead of hallucinating. Store confidence and cited source references.
8. Implement lead capture for name/email/phone with a clear collection flow; normalize/deduplicate and create/link the proper client lead. Add Calendly/Cal.com booking adapter and product/service recommendation rules based on context.
9. Implement keyword custom actions such as pricing link, with an allowlisted action registry and no arbitrary unsafe execution.
10. Log conversation transcript, intent classification, sentiment score, response latency, tokens/cost, sources, confidence, lead/booking, escalation, resolution, and actor. Protect message content from public graph/log surfaces.
11. Build conversation dashboard across client chatbots with filters, transcript/detail, low-confidence review queue, takeover control, return-to-bot, and owner reply identity. Graph may show chatbot/service/task relationships but not raw messages.
12. Generate weekly report: conversations handled, resolution rate, leads captured, average response time, escalation, conversion, and cost where observed. Do not invent values.
13. Implement A/B prompt versions, stable random assignment, outcome/conversion attribution, sample counts/confidence caveat, stop/promote controls, and owner approval for winner promotion.
14. Add APIs/OpenAPI, workers, realtime/status, audit, outbox, idempotency, errors, UI responsiveness, and accessibility consistent with prior parts.

### Verification required

Test valid/invalid/malicious documents and URLs, malware failure, prompt-injection text, cross-client retrieval, Q&A review, grounding threshold, exactly 10-message context, lead deduplication, booking/recommendations/actions, transcript classifications, human takeover, channel signatures/replay, retries, widget domain/token/rate security, reports, A/B allocation/metrics, deletion, and provider outages.

Run an E2E sandbox journey: select client → ingest source → review Q&A/config → deploy widget on an allowed test page → conduct multi-turn conversation → low-confidence escalation → capture lead → book/take over → close → generate report. Report real commands/results.

### Definition of done and handoff

FR-CB-001-017 each map to passing evidence; website widget works; other channels have sandbox or honest contract evidence; no cross-client leakage; low-confidence and high-impact paths escalate; reports/A-B tests use observed data. Return changed files, schema/APIs, widget/channel setup, ingestion threat controls, E2E evidence, test outputs, metrics definitions, runbook, risks, and state Prompt 7 may assume. Do not start workflows.

---

## Prompt 7 - Workflow Automation Builder, Deployment, and Health Monitoring

You are the automation-platform lead implementing **Part 7 of 12**. Inspect adapter, agent, approval, outbox, webhook, Vault, graph, and documentation systems. Implement **FR-WA-001-015** using n8n as the primary real sandbox target and Make.com as the required alternative adapter. Never send credentials to an LLM or claim deployment when only JSON was generated.

### Required implementation

1. Capture client, natural-language request, trigger, systems, inputs/outputs, conditions, actions, credentials needed, data classification, failure behavior, and acceptance examples.
2. Implement Workflow Designer Agent strategy producing versioned n8n JSON nodes/triggers/connections/conditions/actions plus a human-readable plan and assumptions.
3. Validate schema and logic: missing/unconnected/unreachable nodes, invalid parameters, cycles/infinite loops, unbounded fan-out, absent error handling, missing credential references, unsupported node types, and destructive/high-risk actions. Treat suggestions separately from blocking errors.
4. Build an accessible visual editor for node/edge inspection, supported modifications, configuration forms, warnings, version history, generated-vs-edited diff, undo/redo, keyboard interaction, zoom/pan, and JSON advanced view with validation.
5. Provide templates for lead follow-up, review response, invoice reminder, and social cross-posting with version/compatibility metadata.
6. Implement credential connection setup through Vault references and provider-side credential IDs. Generated JSON, LLM prompts, client documentation, UI, and logs must never contain raw secrets.
7. Implement n8n adapter operations to create/update, set webhook URL, test execute, activate/deactivate, get status/executions/errors, and delete/archive where supported. Implement the same domain interface for Make.com, documenting unsupported differences explicitly.
8. Require owner approval of an immutable workflow version. Run test execution with safe fixture data before activation; show inputs, outputs, steps, timing, warnings, and failure details. Editing invalidates approval/test status.
9. Use idempotency/provider IDs to prevent duplicate deployments or activations. Provide rollback to the prior known-good version.
10. Generate a client-facing documentation page/PDF with purpose, trigger, ordered behavior, expected outputs, dependencies, safe troubleshooting, owner contact, and version-without credentials/internal secrets.
11. Implement signed/deduplicated `/webhooks/n8n` event ingestion for execution completed/failed; queue substantial processing. Poll n8n/Make when webhook detail is incomplete.
12. Track execution count, success rate, average duration, last run/status, failure step/error, deployment version, and connection health. Build workflow health dashboard with filters and actionable error detail.
13. On failure, notify owner and show suggested fix clearly as an AI suggestion. Preserve raw normalized evidence and correlation/execution ID.
14. Generate monthly impact reports for hours saved, tasks automated, and errors prevented only from configured baselines/observed data; include methodology/assumptions.
15. Project workflow nodes/relationships to Automations hub, client, Workflow Designer Agent, tools, credentials metadata (never secret), and documentation. Add APIs/OpenAPI, audit, realtime events, responsive/accessibility behavior, and monitoring.

### Verification required

Unit-test generation/validation fixtures for every failure class and template. Component-test editor, diff, keyboard controls, and invalid state. Contract/sandbox-test n8n create/test/activate/update/status/failure/rollback/idempotency; test Make.com supported behaviors or mark credential-dependent tests with exact reason. Test webhook HMAC/signature, timestamp replay, event deduplication, malformed payload, retry, and out-of-order status. E2E: request → generate → edit → validate → approve → test → deploy → receive success/failure → inspect dashboard/graph/docs/report.

### Definition of done and handoff

FR-WA-001-015 have passing evidence; a sandbox n8n workflow is truly deployed/tested/monitored; Make.com fulfills the same contract where supported with no fake success; credentials remain secret; health/impact metrics are traceable. Return changed files, schema/APIs, JSON/version contracts, provider capability matrix, sandbox evidence, tests, credential/deployment/rollback/webhook runbooks, risks, and the state Prompt 8 may assume.

---

## Prompt 8 - Client Content Delivery and Agency Content Engine

You are the content-platform lead implementing **Part 8 of 12**. Inspect agent runtime, client scoping, approvals, jobs, integration adapters, graph, reports, and storage. Implement **FR-CG-001-015** and **FR-CE-001-009**. Build one reusable content artifact/calendar/publishing platform with strict separation between each client's brand and the agency's own marketing.

### Required implementation

1. Implement versioned client brand profiles: tone, vocabulary, target audience, key messages, prohibited claims, examples, platform rules, and memory links. Implement agency strategy: audience, topics, voice, content pillars, offers, goals, and calendar gaps.
2. Require an explicit scope (`clientId` or agency workspace) for every brief, generation, retrieval, calendar, publish, metric, report, and graph projection. Test that one brand cannot influence another.
3. Implement generation schemas/strategies for LinkedIn, X, Instagram captions, email newsletters, SEO blog articles with keywords/meta description/heading hierarchy, and YouTube/TikTok/Reels scripts with hook/body/CTA. Agency formats include LinkedIn posts, X threads, blogs, newsletters, and case studies.
4. Capture brief, sources/provenance, claims needing verification, content version, prompt/model/cost, and channel constraints. Do not present invented current news, performance, client wins, testimonials, or claims as facts.
5. Implement repurposing lineage: one approved source becomes at least five formats; agency example supports blog → five LinkedIn posts → X thread → newsletter section. Preserve source/version links and allow deliberate regeneration after edits.
6. Implement bulk week/month generation through BullMQ with cost estimate/budget check, progress, partial save, cancellation, retry, and owner review queue.
7. Enforce client workflow Draft → Owner Review → Client Review → Approved → Scheduled/Published and agency workflow Draft → Review → Approve → Schedule → Publish. Record reviewer/version/comment/time. Since MVP has no client login, record client-review evidence through owner workflow; never create unauthorized portal access. Editing invalidates approval.
8. Build per-client and agency calendars with monthly grid and list, publish date/time/timezone, platform, status, filters, keyboard-accessible rescheduling, collision and missing-approval warnings.
9. Recommend optimal times from configured or observed evidence and label recommendations. Allow override. Never claim universal optimality without data.
10. Queue only approved versions for idempotent scheduled publishing. Recover missed schedules safely and prevent duplicate posts after retries.
11. Implement publishing adapters for LinkedIn, X, WordPress, and Mailchimp with platform validation, preview, provider ID, retry, rate limits, and explicit not-configured/unsupported states.
12. Implement signed/deduplicated `/webhooks/social` plus polling where needed. Track impressions, engagement, clicks, and conversions per piece with source, retrieval time, attribution, and unavailable state.
13. Generate monthly client content reports; identify top agency content and suggest related topics; generate monthly agency content ROI with disclosed content/advertising/tool/time cost and conversion/revenue assumptions.
14. Build responsive content workspace/calendar/review/publish/analytics UI; project brand knowledge, artifacts, tasks, agents, clients, platforms/tools, and Content hub without exposing full sensitive content on graph.
15. Add complete APIs/OpenAPI, audit, outbox/idempotency, realtime status, notifications, authorization, accessibility, logs, and tests.

### Verification required

Test two clients plus agency for hard scope separation; all format schemas; SEO fields; source/claim flags; repurposing lineage; bulk budget/progress/cancel; both approval state machines and bypass attempts through API/job/retry; timezone/DST/calendar; duplicate-safe scheduling/publishing; adapter contracts; social webhook replay; metric/ROI calculations; deletion/export. E2E one client content cycle and one agency campaign through observed metric ingestion/report.

### Definition of done and handoff

FR-CG-001-015 and FR-CE-001-009 pass; no unapproved or wrong-version artifact can publish; scope never leaks; all required formats/calendars/repurposing/adapters/metrics/reports exist; unavailable provider metrics are honest. Return schema/APIs, state diagrams, platform capability matrix, tests/E2E evidence, brand-isolation proof, publishing/rollback runbook, metric definitions, risks, and state for Prompt 9.

---

## Prompt 9 - Lead Generation, CRM, Proposals, and Follow-up Automation

You are the growth-operations lead implementing **Part 9 of 12**. Read **FR-LG-001-017**, **FR-PM-001-013**, existing client/communication/email/agent/content/job contracts, and provider terms constraints. Implement authorized acquisition only. Do not bypass access controls, CAPTCHAs, anti-bot measures, provider rate limits, or platform terms. Prefer official APIs and owner-authorized exports.

### Required implementation

1. Implement source adapters for LinkedIn, Google Maps, industry directories, Crunchbase, and Apollo.io API with per-source capability/authorization configuration, terms-review note, rate limit, provenance, and explicit not-configured state.
2. Accept industry, location, company size, job title, and technology-used criteria. Normalize lead name, company, title, email, phone, LinkedIn URL, source, client scope, and date found.
3. Deduplicate within the correct client/agency scope using provider ID, normalized email, phone, domain/profile URL, and reviewable fuzzy person/company matches. Never merge silently when confidence is low.
4. Implement configurable explainable fit score 1-100, research brief from approved public sources with citations/time, Hot/Warm/Cold categories, competitor/blocked-domain flags, and audited owner override. Do not infer protected/sensitive attributes.
5. Generate personalized three-to-five-email drip sequences using only sourced brief and approved templates. Require owner approval of each sequence/version before any send. Editing invalidates approval.
6. Send through SMTP/SendGrid/Resend adapters. Implement `/webhooks/email` with signature/replay/deduplication for delivered/opened/bounced/replied; document the limitations of open tracking. Link communication history.
7. Automatically advance the client lead-service pipeline Sourced → Qualified → Outreach Sent → Replied → Meeting Booked → Converted only from verified events or owner action. Track stage timestamps and conversion rates. LinkedIn messages remain drafts for manual owner sending.
8. Generate weekly client lead reports: found, qualified, outreach, response rate, meetings, conversion, bounces, and cost using observed data.
9. Build agency CRM lead capture from manual entry, `/webhooks/leads` forms, email inquiries, and social DMs with name, email, company, source, interest, notes, status, value, and follow-up.
10. Build accessible drag/drop plus keyboard Kanban: New → Contacted → Qualified → Proposal Sent → Negotiating → Won → Lost. Record stage history; linking Won to a new/existing client requires confirmation.
11. Implement Proposal Generator Agent using controlled templates for scope, deliverables, timeline, pricing, and terms. Store immutable v1/v2 versions, diff/change summary, Draft/Sent/Viewed/Accepted/Rejected, generated branded PDF, sent evidence, and honest “Viewed” only from a tracking event.
12. Generate personalized follow-ups from communication history, schedule rules such as two days after first contact and five after proposal, allow configuration, alert overdue, and require send approval according to owner policy.
13. Implement SRS pipeline/proposal/stats APIs plus consistent routes for client lead service, outreach, and events; OpenAPI, auth, audit, outbox/idempotency, realtime, exports, and deletion.
14. Project agency leads as Human nodes connected to Pipeline hub; link lead-service records to client, Lead Generator Agent, outreach tasks, proposal, communications, and conversion/client.
15. Build responsive lead-source, qualification, approval, email sequence, client pipeline/report, agency CRM Kanban, proposal editor/version/PDF, follow-up, and analytics UI with WCAG behavior.

### Verification required

Test adapter authorization/config, source normalization, deduplication/fuzzy review, scoring explanation, competitor/blocked flags, research provenance, scope isolation, sequence personalization, mandatory approval bypass attempts, email signatures/replay/out-of-order events, bounce/reply transitions, Kanban keyboard behavior, stage/conversion math, proposal version/diff/PDF/status, follow-up timing/timezones, deletion/export, and graph projection.

Run two E2E flows: client service source → qualify → approve → send → reply/meeting → weekly report; agency lead → Kanban → proposal versions/PDF → scheduled follow-up → Won → confirmed client creation. Report exact sandbox/test evidence and any providers not configured.

### Definition of done and handoff

FR-LG-001-017 and FR-PM-001-013 pass; no outreach bypasses approval; LinkedIn remains draft-only; both pipelines are distinct and measurable; proposals are versioned PDFs; sourcing is authorized and documented; metrics are observed. Return changed files, schema/APIs, source capability/compliance matrix, scoring/dedup rules, approval evidence, email/webhook runbook, tests/E2E, risks, and state for Prompt 10.

---

## Prompt 10 - Finance, Stripe, Expenses, Profitability, and Revenue Intelligence

You are the finance-platform lead implementing **Part 10 of 12**. Read **FR-FM-001-019**, Stripe/API/webhook/security requirements, client/agent cost/time/pipeline contracts, and existing outbox/idempotency infrastructure. Financial correctness and traceability take priority over visual polish. Use Decimal/Numeric, never floating-point accounting.

### Required implementation

1. Implement invoice drafts with client, one-time/recurring/usage type, line items (service, hours/amount, rate), server-calculated total, currency, due date, payment terms, notes, and status Draft/Sent/Paid/Overdue/Cancelled.
2. Create/sync Stripe customers/invoices, send client email with Stripe-hosted payment page, store provider IDs and immutable event timeline. Use idempotency keys and never create duplicate invoices on retry.
3. Implement raw-body signed `/webhooks/stripe` with timestamp/replay protection, event-ID deduplication, schema validation, fast queue response, out-of-order handling, and reconciliation for invoice paid, payment failed, and subscription updated.
4. Treat Stripe/reconciled ledger evidence as payment truth. Surface discrepancies between local and Stripe state and provide safe reconciliation/replay tools.
5. Schedule overdue status and reminders exactly at 3, 7, and 14 days. Implement Invoice Chaser Agent strategy to generate reminder drafts and send according to owner approval policy; log messages in client communication history.
6. Calculate MRR from active recurring/retainer relationships, total revenue, revenue by client/service, month-over-month growth, and 12-month MRR trend. Define cash/accrual choices explicitly and apply consistently.
7. Calculate pipeline-based revenue projections from deal value and configurable expected close probability. Label all projections and assumptions; do not count projected revenue as actual.
8. Track expense categories API, tool subscription, hosting, domain, and other. Automatically capture each OpenAI/Anthropic billable attempt from agent usage without double counting. Allow manual amount/category/date/notes and private receipt upload with malware scan.
9. Calculate profit margin `(Revenue - Expenses) / Revenue × 100` with explicit zero-revenue behavior. Calculate cost per agent and client profitability using revenue minus attributable API, time, and configured direct costs.
10. Generate auditable P&L by month/quarter/year, client profitability, cost-per-agent, and tax-ready income/expense CSV. Include generation time, period, currency, methodology, and drill-down source IDs. State that export is data, not tax advice.
11. Implement required finance APIs: invoice list/detail/create/send, finance dashboard, P&L, client profitability, expense create/list; add required reconciliation/reminder/export routes, OpenAPI, auth, encrypted sensitive fields, audit, rate limits, and pagination.
12. Build finance dashboard with MRR chart, revenue by client/service, expenses, margin, overdue, projections, and source drill-down. Integrate main dashboard metrics.
13. Project revenue/invoice/payment/expense nodes as appropriate, financial edges client → invoice → payment/Finance hub, and realtime `payment_received` glow.
14. Ensure exports/deletion/recovery, partial provider outages, webhook retries, notifications, Sentry/log redaction, and responsive/accessibility requirements.

### Verification required

Unit-test decimal rounding, line totals, currencies, recurring MRR, statuses, due dates and 3/7/14 schedule, projections, zero-revenue margin, P&L, profitability attribution, agent cost, and CSV. Contract/sandbox-test Stripe create/send/pay/fail/cancel/subscription, signature, replay, duplicate, out-of-order, retry, and reconciliation. Test receipt malware/storage, encryption/redaction, owner-only access, API-cost retry accounting, graph/realtime.

Run E2E: client → draft invoice → send → Stripe test payment → webhook/reconcile → graph/dashboard → P&L/profitability/CSV. Run overdue/reminder alternative. Report exact evidence.

### Definition of done and handoff

FR-FM-001-019 pass; totals are reproducible; Stripe state reconciles; reminders work; MRR/revenue/expenses/margin/P&L/client profitability/agent cost/export are accurate; finance graph/realtime work; sensitive data is protected. Return schema/APIs, accounting definitions, event map, test outputs, sample reports, reconciliation/reminder/restore runbooks, risks, and state for Prompt 11.

---

## Prompt 11 - Knowledge Base, SOPs, Notifications, Reports, and Analytics

You are the knowledge and business-intelligence lead implementing **Part 11 of 12**. Inspect every domain's events, metrics, graph projections, report contracts, notification records, agent memory, client deletion/export behavior, and UI patterns. Implement **FR-KB-001-014**, **FR-NA-001-004**, and **FR-RA-001-008**, plus every notification trigger/default in SRS Section 5.11.1.

### Required implementation

1. Implement knowledge entries with title, Markdown content, exact categories (SOPs, Templates, Brand Voices, Client Data, Industry Research, Lessons Learned, Decisions, Meeting Notes), tags, links, versions, access count, and timestamps. Sanitize Markdown against XSS.
2. Version every change, show history/diff, and revert by creating a new auditable version. Archive/recover/delete consistently with related embeddings and links.
3. Generate 1,536-dimension embeddings with provider/model metadata and pgvector; implement full-text and semantic search, filters, cursor pagination, ranking explanations, and reindex/migration procedure.
4. Link knowledge to clients, agents, projects, SOPs, decisions, and graph edges. Expose linked knowledge in entity drawers and suggest related entries using similarity threshold, with owner dismiss/feedback.
5. Let agents propose significant learnings after runs. Enforce client scope and owner/policy review before shared knowledge; store run/source provenance.
6. Implement SOP title, ordered steps, materials, expected outcome, last tested date, agent link/version, usage count, executions, last execution, and >30-day-not-used review flag. An agent run must record the exact SOP version.
7. Implement all notification definitions exactly: agent failure (Email/In-app/Slack Critical On), invoice overdue 3+ days (Email/In-app High On), new lead (In-app/Slack Medium On), client reply (In-app/Email Medium On), task due today (In-app Medium On), task overdue (In-app/Email High On), API cost threshold (Email/Slack High On), weekly report ready (In-app Low On), renewal due 30 days (Email/In-app High On), content scheduled (In-app Low On), knowledge suggestion (In-app Low Off).
8. Allow independent toggles, configurable timezone quiet hours, and daily low-priority digest. Critical records remain durable; document whether delivery overrides/deferred quiet hours. Ensure retries/deduplication and delivery attempts.
9. Build notification bell/unread count, unread-first list, toast, mark one read, read all, related-entity navigation, preferences, quiet hours, digest, and channel health. Implement required notification APIs/OpenAPI.
10. Build customizable/reorderable main dashboard: MRR, Active Clients, Running/Active Agents, Open Tasks, Pipeline Value; 7/30-day sparklines; 12-month MRR area chart; last 10 agent runs with status/duration/cost; pipeline stage snapshot; last five unread notifications; quick New Client/New Invoice/Run Agent/Search Knowledge actions.
11. Generate weekly summary (revenue, new clients, tasks, agent performance, pipeline changes), monthly review (P&L, retention, agent cost, content performance), and client-branded shareable project/deliverable/metric reports. Filter internal-sensitive fields.
12. Implement Weekly Reporter Agent over verified query results. It may summarize but never invent missing metrics.
13. Export every report to PDF and CSV, store immutable artifacts, schedule weekly/monthly generation, notify completion, list/download from Reports, and handle retry/idempotency.
14. Implement required Knowledge APIs and related links/search, Reports APIs, audit, authorization, realtime, graph Knowledge/SOP/Decision nodes and reference edges, accessibility, responsive UI, and performance instrumentation.

### Verification required

Test Markdown sanitization, versions/diff/revert, embedding/full-text/semantic relevance, links/related threshold/access counts, cross-client isolation, deletion/reindex, SOP version/execution/30-day rule. Use table-driven tests for every notification trigger, exact channels/priority/default, toggles, quiet hours across midnight/DST, digest, retry/duplicate/failure, unread counts. Test widget customization/data calculations and <3-second dashboard. Load-test 10,000 knowledge entries: full-text <1 second and semantic <2 seconds. Test scheduled report/PDF/CSV/branding/authorization/no-fabrication.

E2E: create/version/search/link knowledge → execute SOP → trigger and configure notification → generate scheduled weekly/monthly/client report → inspect/download PDF/CSV and graph links.

### Definition of done and handoff

FR-KB-001-014, FR-NA-001-004, FR-RA-001-008 and every notification default pass; knowledge/dashboard performance passes; reports use source data; SOPs and graph links work; all artifacts are exportable and secure. Return changed files, schema/APIs, notification matrix, search benchmark, report samples/data dictionary, test results, runbooks, risks, and complete feature-state for Prompt 12.

---

## Prompt 12 - Whole-System Hardening, Deployment, Recovery, and Production Acceptance

You are the principal engineer/release lead implementing **Part 12 of 12**. Do not add unrelated features. Audit the entire repository against the original SRS and `03_SRS_Coverage_and_Traceability_Matrix.md`. Treat every unverified requirement as open, regardless of whether a screen exists. Start with a gap report and implementation/test plan. Preserve production data; rehearse destructive work in isolated environments.

### Objective and SRS accountability

Close all cross-module gaps and prove **NFR-P-001-010**, **NFR-S-001-006**, **NFR-R-001-006**, **NFR-U-001-006**, **NFR-PO-001-004**, **NFR-M-001-006**, every **SEC-A/Z/E/API/I/C** requirement, all API/realtime/webhook/integration/data/UI/deployment obligations, SRS Sections 11.1-11.5, original phase exit criteria, and success-metric instrumentation. Deploy and operate the production system while keeping Section 12.6 features post-MVP and feature-gated.

### Required implementation and audit

1. Generate a live traceability report from tests/code/OpenAPI/schema: 246/246 numbered requirements plus unnumbered data fields/relations, API endpoints/conventions, realtime events, webhook paths, integrations, environment variables, pages/layout, graph behaviors, deployment, monitoring, backup, future scope, and success metrics. Fix gaps; do not mark manual assumptions as passed.
2. Run full cross-domain E2E flows: client/graph; agent/memory/approval/cost; chatbot; workflow; client/agency content; client lead service; agency CRM/proposal; invoice/finance; knowledge/SOP; notifications; dashboards/reports; export/deletion/recovery.
3. Verify alternate-path controls: no approval bypass through API, worker, replay, schedule, chain, webhook, or retry; no cross-client data/memory/file/report leakage; all mutations audit; external effects are idempotent; realtime reconnect refetches truth.
4. Complete OpenAPI and compare every SRS endpoint. Verify realtime channels/events and `/webhooks/stripe`, `/webhooks/n8n`, `/webhooks/email`, `/webhooks/leads`, `/webhooks/social` with signatures, replay protection, deduplication, and durable receipt.
5. Optimize and prove SRS performance in production-like conditions: initial load <2s; graph ≤100 <1s; graph 100-300 <3s/Canvas; CRUD API <500ms p95; queue <5s; realtime <2s; full-text <1s; semantic <2s; dashboard <3s; 10MB upload <10s. Record percentile, runs, dataset, browser/hardware/environment.
6. Prove scale: 50 active clients, 30 concurrent agent runs, 10,000 knowledge entries, 500 graph nodes with filter/pagination strategy, 500 queued tasks without backlog, and capacity plan for 50GB PostgreSQL/100GB files.
7. Prove reliability: 99.5% SLI/alert definition, three-attempt external retries, partial agent saves, React widget error isolation, and graceful LLM outage where non-AI features stay fully functional and core data remains read-only accessible as designed. Fault-test Stripe, n8n, email/social, Redis workers, realtime, and database interruption for loss/duplicates.
8. Complete security verification: Supabase auth/session/login rate limits; owner-only authorization; Vault/AES-256 secrets; TLS 1.3/HTTPS; database at rest and application-level sensitive finance encryption; malware scan; 10/100MB limits; Zod; Prisma parameterization; XSS sanitization/CSP; CSRF; CORS; HSTS/X-Frame/X-Content-Type/Referrer; database SSL; Dependabot/Snyk; Cloudflare protection; audit/export/delete; provider DPA considerations; no cookie-consent feature unless a future portal is actually introduced.
9. Threat-model and penetration-test authorized surfaces: auth, OAuth callback, webhooks, uploads/parsers, SSRF, widget, prompt/retrieval injection, tool permissions, exports, signed URLs, queues/replay, logs/Sentry, and deletion. Fix critical/high findings before go-live.
10. Verify usability: new owner can explore without training, primary actions within two clicks, Cmd/Ctrl+K and `N` new-client shortcuts, dark consistency, destructive seven-day undo, accurate empty/error states.
11. Perform WCAG 2.1 AA and responsive audit at desktop ≥1280, tablet 768-1279, mobile <768. Verify keyboard, focus, ARIA, contrast, reduced motion, data tables, graph descriptions/equivalent list, screen readers, bottom tabs, stacked cards, mobile critical views.
12. Meet coverage ≥70% core business logic and ≥50% UI components while ensuring critical negative paths are tested. Enforce lint/typecheck/test/build/OpenAPI/migration/security gates in CI.
13. Deploy SRS architecture: Vercel frontend/API; Supabase PostgreSQL/Auth/Storage/Realtime; Upstash Redis; n8n on Railway/Render; Cloudflare DNS/CDN/DDoS where used. Configure only enabled integrations and honest unavailable states for optional ones.
14. Implement GitHub Actions every-push lint/typecheck/unit/build, PR preview, reviewed production deployment plus Prisma migration, and weekly Dependabot/npm audit/Snyk. Do not run production migration from untrusted previews.
15. Activate Sentry, Vercel Analytics, Axiom/Logtail, UptimeRobot, Supabase health, queue depth/age, agent success/cost, webhook lag/failures, report schedules, and daily OpenAI/Anthropic spend alerts. Every critical alert links a runbook.
16. Enable Supabase automated daily backups with 30-day retention/PITR and Supabase Storage versioning. Perform a timed restore from backup, redeploy from GitHub, restore/verify environment references, and prove RPO ≤24 hours and RTO ≤1 hour. Do not store actual environment values in Git.
17. Complete internal documentation for every module, API, architecture/ER, environments, integrations, owner SOP, incident response, provider outage, failed job/replay, webhook, billing reconciliation, migration/rollback, restore, export/delete, and key rotation.
18. Instrument SRS Month 6/12 metrics-clients, MRR, agents, success, API cost, owner time/client/week, uptime, knowledge count, margin-as targets based on real records. Never seed target achievements.
19. Add disabled feature flags/extension seams only for client portal, white label, multi-user contractors, marketplace, predictive analytics, voice, native mobile/PWA, calendar sync, Slack bot commands, and custom integration builder. Do not expose navigation/APIs or claim them implemented.
20. Remove production mocks, demo data, placeholder secrets, debug bypasses, and obsolete flags. Preserve deterministic fakes only in test code.

### Required release evidence

Produce: traceability report; full test report; coverage; OpenAPI diff; migration rehearsal; security/threat findings and fixes; performance/scale results; failure-injection results; accessibility/responsive report; sandbox integration matrix; deployment inventory; monitoring/alert proof; backup/restore timestamps proving RPO/RTO; data export/deletion proof; operator acceptance checklist; rollback plan; residual-risk register.

Run a production smoke test with controlled effects. Create a go/no-go record naming release owner, deployment version, migration, backup, rollback, known risks, and 72-hour monitoring plan. If any critical gate fails, declare **NO-GO** accurately and list remediation-do not soften the result.

### Final definition of done

The system is feature-complete against the initial SRS; traceability is 246/246 with all unnumbered categories covered; tests/security/performance/scale/accessibility/recovery pass; CI/CD, observability, budgets, backups, and runbooks are active; no mock, hard-coded secret, data leak, approval bypass, or duplicate external effect remains; production can operate a 10-15 client agency; future features remain gated.

### Final handoff response

Return an executive release summary, exact version/commit/deployment endpoints, requirement coverage, all evidence locations, commands/results, enabled and disabled integrations, environment variable names (never values), migrations, backup/restore proof, monitoring/runbooks, known residual risks, go/no-go result, rollback procedure, and recommended post-release 72-hour checks. Do not begin future enhancements without a new approved specification.
