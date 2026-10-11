# Parts 6-11 Traceability Coverage - Service Domains

**Date:** 2026-10-09
**Scope:** FR-CB, FR-WA, FR-CG/FR-CE, FR-LG/FR-PM, FR-FM, FR-KB/FR-NA/FR-RA core operational requirements

## Coverage map

| Part / domain | Delivered | Verified by |
|---|---|---|
| **6 Chatbots** - config, versioning, knowledge ingestion, Q&A review, deployment gate, grounded conversations, escalation, transcripts, conversations list | `PrismaChatbotService` + 8 `/api/v1/chatbots` routes + `/chatbots` UI (cards, create dialog, detail drawer, live test chat) | Live smoke: ingest→approve→deploy→grounded answer (conf 1.0) + escalation fallback; e2e surfaces |
| **7 Automations** - blueprint validation (reachability, cycles, unsafe actions, credentials), versioning, test-before-activate gate, provider events, health | `PrismaWorkflowService` + `validateWorkflowBlueprint` + 5 routes + `/api/v1/webhooks/n8n` (HMAC) + `/workflows` UI (templates, validation panel, executions) | Live smoke: unsafe-action flagged → test → deployed; webhook ingress contract |
| **8 Content** - brand voice profiles (scoped/versioned), 9 artifact types, approval state machine, edit-invalidates-approval, version history, calendar, scheduling gate | `PrismaContentService` + 6 `/api/v1/content` routes + `/content` UI (scope toggle, cards, status pills, calendar tab, brand dialog) | Live smoke: full state machine incl. post-approval edit reset; schedule only from approved |
| **9 Pipeline** - CRM Kanban (7 stages, click-advance, history audit), weighted value, versioned proposals (content-hashed), status-driven lead movement, sourced leads with dedupe fingerprint + fit scoring | `PrismaPipelineService` + 6 `/api/v1/pipeline` routes + `/pipeline` UI (board, proposals tab, lead drawer, forms) | Live smoke: lead→proposal→accepted→**won** (3 history entries); duplicate-source rejection logic |
| **10 Finance** - invoices with server-verified totals, line items, status lifecycle, auto-closing payments, expenses, MRR/revenue/margin/outstanding dashboard, client profitability | `PrismaFinanceService` + 4 `/api/v1/finance` routes + `/finance` UI (stat strip, invoice list/detail, expense + invoice dialogs, profitability) | Live smoke: $2,400 invoice → sent → payment → paid; dashboard margin 100%; agent cost ledger $0.0037 |
| **11 Knowledge/SOPs/Reports** - versioned markdown knowledge + search + access counts, SOPs with step checklists + versioned executions, notification service with dedupe + triggers, live bell, reports from verified metrics | `PrismaKnowledgeService` + 6 `/api/v1/knowledge` routes + `/knowledge-base` + `/reports` UIs + `notifications-feed` in the shell | Live smoke: edit→v2 history; SOP execution recorded; new_lead notification auto-fired; bell unread counts |
| **Notification triggers** - agent_error (run failures), new_lead (CRM capture), invoice_overdue (overdue flag) | `recordNotification` wired into agents/pipeline/finance services | Smoke: lead capture produced unread notification |

## Cross-cutting conventions held for every new domain

- Owner-scoped service methods with `requireActiveOwnerInTransaction`; audit + durable outbox records on every mutation (`appendMutationRecords`).
- API v1 envelope, idempotency-key support on mutations, OpenAPI registration + drift-checked registry (87 routes).
- Strict zod contracts in `@aios/contracts`; DB enum mapping isolated in services.
- UI: dark neon design system, sticky form footers, honest empty states, keyboard/a11y patterns from Parts 1-4.
- State machines server-enforced (content approval, workflow activation gate, invoice payment closure, proposal-driven lead stages) - the UI cannot bypass them, and neither can retries.

## Deliberate boundaries

See "Honest boundaries" in `docs/evidence/parts-6-11-handoff-2026-10-09.md`: external channel/payment/publishing adapters need credentials; graph node extensions for new domains are a follow-up; scheduled report artifacts (PDF/CSV) extend the verified metrics layer.
