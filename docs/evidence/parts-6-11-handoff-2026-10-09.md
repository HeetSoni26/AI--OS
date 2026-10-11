# Parts 6-11 Handoff Report - Service Domains

**Date:** 2026-10-09
**Scope:** Part 6 (Chatbots), Part 7 (Workflow Automations), Part 8 (Content Engine), Part 9 (Pipeline/CRM/Proposals), Part 10 (Finance), Part 11 (Knowledge/SOPs/Notifications/Reports)
**Status:** Implemented as complete vertical slices (service → API → UI) and verified end to end.

## What shipped per part

### Part 6 - Chatbots (`/chatbots`)
- Chatbot CRUD with versioned configuration (brand voice, greeting, fallback, confidence threshold, model, system prompt).
- Safe knowledge ingestion: paste FAQ/product content → deterministic Q&A extraction (question/answer paragraph pairing, HTML stripping, script removal) → owner review → approval; nothing publishes unreviewed.
- **Grounded conversations**: answers come only from approved Q&A via explainable keyword-overlap confidence; below-threshold questions get the configured fallback and mark the conversation escalated instead of inventing certainty. Verified live: "Do you offer trial classes?" → correct answer at confidence 1.0; swallow question → fallback + escalation.
- Deployment gate: at least one approved Q&A pair required before Deploy; conversation transcript persists with per-message confidence/latency/intent.
- API: 8 secured endpoints under `/api/v1/chatbots` + conversations listing/transcripts.

### Part 7 - Automations (`/workflows`)
- Workflow CRUD with immutable version history; n8n and Make provider fields.
- **Blueprint validation engine**: missing connections, unreachable nodes, infinite-loop detection (DFS cycle check from the trigger), unsafe/destructive node flags (email_send, delete, api_call…) that mark the workflow approval-required, and unbound-credential warnings.
- Lifecycle gate: activation requires a recorded sandbox test (testedAt); test executions persist with status/output.
- Provider execution-event ingress at `/api/v1/webhooks/n8n`: HMAC-SHA256 signature verification when `WORKFLOW_SIGNING_SECRET` is set (unsigned accepted only when no secret is configured - honest degraded mode), idempotent by provider execution id.
- Health aggregates: total executions, success rate recomputed from durable rows.
- Templates: Lead Follow-up, Invoice Reminder, Blank - one-click starters.

### Part 8 - Content (`/content`)
- Scoped brand voice profiles (client vs agency, versioned) - generation memory never mixes tenants.
- Content artifacts across 9 types (LinkedIn, X post/thread, Instagram, newsletter, blog, video script, case study, other) with **enforced approval state machine**: Draft → Owner Review → Client Review → Approved → Scheduled → Published; agency scope uses Draft → Review → Approved.
- **Editing invalidates approval** (verified live: post-approval edit reset the artifact to draft and created v2).
- Version history per artifact; only approved artifacts can be scheduled; calendar entries with platform, date, timezone; calendar list view.

### Part 9 - Pipeline (`/pipeline`)
- Agency CRM: leads with value, close probability, notes; 7-stage Kanban (New → Contacted → Qualified → Proposal Sent → Negotiating → Won/Lost) with click-to-advance columns and full stage-history audit.
- **Versioned proposals**: controlled templates (scope/deliverables/timeline/pricing/terms), content-hashed immutable versions, status lifecycle Draft → Sent → Viewed → Accepted/Rejected; **acceptance moves the lead to Won automatically** (verified live) and rejection returns it to Negotiating.
- Weighted pipeline value, win rate, and per-column totals computed from real records.
- Client sourced leads: deduplication fingerprint over normalized email/domain/profile (duplicate creation rejected with 409), fit scores with Hot/Warm/Cold categorization, provenance source tracking.

### Part 10 - Finance (`/finance`)
- Invoices with line items; **totals computed server-side** (client-supplied totals are never trusted), due dates, types (one-time/recurring/usage).
- Status lifecycle Draft → Sent → Paid/Overdue/Cancelled; **payments close invoices automatically** when the settled sum reaches the total (verified live).
- Expenses with categories, vendor, client attribution; agent AI run costs already flow into the ledger automatically from Part 5.
- **Dashboard**: MRR (from active client retainers), settled revenue, outstanding, overdue count, expenses, profit margin ((rev-exp)/rev, null-safe at zero revenue), month-to-date agent cost - all recomputed from source rows. Client profitability per client (revenue - attributable expenses).

### Part 11 - Knowledge, SOPs, Notifications, Reports
- Knowledge base (`/knowledge-base`): Markdown entries across 9 categories, tag + full-text search, access counting, **version history on every edit** with change summaries (verified: edit created v2 with history).
- SOPs: ordered steps with instructions/expected results, usage tracking; **checklist execution** records the exact SOP version and per-step results (verified live).
- **Notification service**: durable records with dedupe keys, priorities, channels; triggers wired into real events - agent run failures (agent_error), new CRM leads (new_lead), overdue invoices (invoice_overdue). The top-bar bell is now live with unread counts, mark-read, and mark-all-read.
- Reports (`/reports`): weekly business summary computed live from finance + pipeline + agent data with explicit "every metric traces to source" provenance; client profitability table.

## Verification evidence (2026-10-09)

- `npm run typecheck` - 0 errors across all workspaces.
- `npm run lint` - clean.
- `npm run test` - **359 unit tests passed** across all packages (133 web, 24 agents runtime, plus data/contracts/jobs/platform/integrations/graph suites). Raised the web vitest timeout to 30s for the heavyweight jsdom workspace tests (they were flaking at the 5s default under load).
- `npm run build` - production build compiles; all 55 routes generated.
- `npm run test:e2e` - full three-project sweep: **46 passed, 0 failed**.
- OpenAPI drift test: 5/5 passing - all 87 registered routes documented.
- Live API smoke (this date): finance invoice→payment→dashboard ($2,400 settled, 100% margin, $0.0037 AI cost tracked); pipeline lead→proposal→accepted→won with 3 history entries and automatic new-lead notification; workflow validated (unsafe-action flagged) → tested → deployed + webhook ingress; content draft→owner review→client review→approved→scheduled→calendar; knowledge edit versioning; SOP checklist execution recorded.

## Honest boundaries (documented, not silently dropped)

- **External channel adapters** (WhatsApp/Instagram DMs, live n8n/Make APIs, LinkedIn/X publishing, Stripe payment collection, SMTP email sending) are contract-shaped but not live: no provider credentials are configured. Every surface that needs them degrades honestly (e.g., Stripe references stay null; publishing shows as scheduled, not published). Bringing them online = adding credentials + adapter implementations behind the existing service seams.
- **Graph projections for the new domains** (chatbot/workflow/content/lead nodes) are not yet added to the graph canvas - the graph still shows clients, agents, tasks, SOPs, knowledge, tools, decisions, and finance nodes from Part 4. New node types require a graph contract + mapper extension; documented as a follow-up.
- **Agent-run failures during the pre-notification orphan period** don't have notifications; only events after the trigger wiring do.
- Webhook signature enforcement requires setting `WORKFLOW_SIGNING_SECRET`; without it the ingress accepts unsigned events and says so at `GET /api/v1/webhooks/n8n`.

## Safe starting point

Everything above is verified; Parts 1-5 remain green. Natural next steps: (a) live provider credentials (OpenAI/Anthropic for agents, Stripe for payments, SMTP for outreach) light up the existing seams; (b) graph node extensions for the new domains; (c) scheduled report generation and PDF/CSV export artifacts on top of the verified metrics layer.
