from __future__ import annotations

import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

SOURCE = Path(r"D:\Downloads\AI_Automation_Agency_OS_SRS.docx")
OUTPUT = Path(r"C:\Users\Heet\OneDrive\Desktop\AI OS\03_SRS_Coverage_and_Traceability_Matrix.md")

ID_RE = re.compile(
    r"\b(?:FR-[A-Z]{2}-\d{3}|NFR-(?:P|S|R|U|PO|M)-\d{3}|SEC-(?:A|Z|E|API|I|C)-\d{3})\b"
)
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def extract_paragraphs(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    paragraphs: list[str] = []
    for paragraph in root.iter(W + "p"):
        text = "".join((node.text or "") for node in paragraph.iter(W + "t")).strip()
        if text:
            paragraphs.append(text)
    return paragraphs


def parse_requirements(paragraphs: list[str]) -> dict[str, dict[str, str]]:
    requirements: dict[str, dict[str, str]] = {}
    for index, text in enumerate(paragraphs):
        match = ID_RE.search(text)
        if not match:
            continue
        requirement_id = match.group(0)
        after = text[match.end() :].strip().lstrip(":").strip()
        description = after
        target = ""
        if not description:
            if index + 1 < len(paragraphs):
                description = paragraphs[index + 1].strip()
            if requirement_id.startswith("NFR-P-") and index + 2 < len(paragraphs):
                target = paragraphs[index + 2].strip()
        requirements[requirement_id] = {
            "description": description,
            "target": target,
        }
    return requirements


def family(requirement_id: str) -> str:
    return requirement_id.rsplit("-", 1)[0]


PART_BY_FAMILY = {
    "FR-CM": "Part 3",
    "FR-AM": "Part 5",
    "FR-CB": "Part 6",
    "FR-WA": "Part 7",
    "FR-CG": "Part 8",
    "FR-LG": "Part 9",
    "FR-FM": "Part 10",
    "FR-PM": "Part 9",
    "FR-CE": "Part 8",
    "FR-KB": "Part 11",
    "FR-NA": "Part 11",
    "FR-RA": "Part 11",
    "NFR-P": "Part 12 (implemented incrementally)",
    "NFR-S": "Part 12 (platform in Parts 2, 4, 5, 11)",
    "NFR-R": "Part 12 (reliability built in Parts 1-11)",
    "NFR-U": "Part 12 (foundation in Part 1; UI in each part)",
    "NFR-PO": "Part 12 (foundation in Part 2)",
    "NFR-M": "Part 12 (foundation in Parts 1-2)",
    "SEC-A": "Part 12 (implemented in Part 1)",
    "SEC-Z": "Part 12 (foundations in Parts 1-2)",
    "SEC-E": "Part 12 (foundations in Parts 1-2)",
    "SEC-API": "Part 12 (foundations in Parts 1-2)",
    "SEC-I": "Part 12 (foundations in Parts 1-2)",
    "SEC-C": "Part 12 (foundations in Part 2)",
}

TEST_BY_FAMILY = {
    "FR-CM": "Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test",
    "FR-AM": "Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test",
    "FR-CB": "Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario",
    "FR-WA": "Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E",
    "FR-CG": "Client-content scope/approval/calendar/publisher tests + observed-metrics E2E",
    "FR-LG": "Authorized source/dedup/score/outreach approval tests + client lead-service E2E",
    "FR-FM": "Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test",
    "FR-PM": "CRM state/Kanban/proposal/follow-up tests + agency lead-to-client E2E",
    "FR-CE": "Agency strategy/generation/approval/publishing/ROI tests + campaign E2E",
    "FR-KB": "Knowledge version/search/vector/link/SOP tests + 10,000-entry performance and E2E",
    "FR-NA": "Table-driven trigger/preference/quiet-hour/digest/channel tests + UI/API E2E",
    "FR-RA": "Metric correctness/widget/report schedule/PDF/CSV tests + dashboard/report E2E",
    "NFR-P": "Production-like benchmark with recorded dataset, environment, run count, percentile, and threshold assertion",
    "NFR-S": "Production-like capacity/load test at the stated maximum plus headroom and failure-behavior evidence",
    "NFR-R": "Fault-injection/recovery test plus observability evidence and no-loss/no-duplicate assertions",
    "NFR-U": "Task-based owner E2E, responsive/keyboard/accessibility audit, and destructive-action recovery evidence",
    "NFR-PO": "PostgreSQL restore/deploy portability and complete JSON/CSV/config round-trip test",
    "NFR-M": "Repository/CI/OpenAPI/migration/coverage inspection enforced by automated quality gates",
    "SEC-A": "Authentication/session/rate-limit integration and E2E security tests",
    "SEC-Z": "Owner authorization, secret-vault, webhook signature, and public-data exposure security tests",
    "SEC-E": "TLS/storage/application-encryption/upload scan verification and secret scanning",
    "SEC-API": "API negative security suite: rate/body/validation/injection/XSS/CSRF/CORS",
    "SEC-I": "Deployment configuration, vulnerability scan, backup/PITR, header, SSL, and DDoS evidence",
    "SEC-C": "Export/deletion/audit/provider-processing evidence and future-cookie-consent scope check",
}

FAMILY_TITLES = {
    "FR-CM": "Client Management",
    "FR-AM": "AI Agent Management",
    "FR-CB": "Chatbot Builder",
    "FR-WA": "Workflow Automation",
    "FR-CG": "Client Content Generation",
    "FR-LG": "Client Lead Generation",
    "FR-FM": "Financial Management",
    "FR-PM": "Pipeline / CRM",
    "FR-CE": "Agency Content Engine",
    "FR-KB": "Knowledge Base and SOPs",
    "FR-NA": "Notifications and Alerts",
    "FR-RA": "Reporting and Analytics",
    "NFR-P": "Performance",
    "NFR-S": "Scalability",
    "NFR-R": "Reliability",
    "NFR-U": "Usability",
    "NFR-PO": "Portability",
    "NFR-M": "Maintainability",
    "SEC-A": "Authentication Security",
    "SEC-Z": "Authorization Security",
    "SEC-E": "Encryption and Data Security",
    "SEC-API": "API Security",
    "SEC-I": "Infrastructure Security",
    "SEC-C": "Compliance Considerations",
}


def safe_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ").strip()


def requirement_table(requirements: dict[str, dict[str, str]], family_name: str) -> str:
    rows = [
        "| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |",
        "|---|---|---|---|",
    ]
    ids = sorted((rid for rid in requirements if family(rid) == family_name), key=lambda item: int(item.rsplit("-", 1)[1]))
    for requirement_id in ids:
        item = requirements[requirement_id]
        requirement_text = item["description"]
        if item["target"]:
            requirement_text += f" Target: {item['target']}"
        test = TEST_BY_FAMILY[family_name]
        rows.append(
            f"| `{requirement_id}` | {safe_cell(requirement_text)} | {PART_BY_FAMILY[family_name]} | {safe_cell(test)} proving the stated behavior/target. |"
        )
    return "\n".join(rows)


def make_document(requirements: dict[str, dict[str, str]]) -> str:
    counts = Counter(family(rid) for rid in requirements)
    groups: defaultdict[str, int] = defaultdict(int)
    for rid in requirements:
        groups[rid.split("-", 1)[0]] += 1

    sections: list[str] = []
    sections.append("""# AI Automation Agency OS - SRS Coverage and Traceability Matrix

**Source:** `D:\\Downloads\\AI_Automation_Agency_OS_SRS.docx`  
**Document ID:** SRS-AIOS-2026-001  
**Version:** 1.0, July 2026  
**Purpose:** Prove that the 12-part roadmap preserves every numbered requirement and every material unnumbered SRS obligation.

## 1. Coverage policy

The original SRS remains authoritative. “Completion part” identifies the part accountable for finished behavior; foundational or cross-cutting work may occur earlier. Part 12 independently verifies all non-functional and security requirements. A row is not complete because code exists: the listed evidence must pass in a production-like or appropriate sandbox/test environment.

Recommended additions in the roadmap-adapter contracts, outbox, idempotency, feature flags, structured telemetry, dead-letter replay, deterministic AI tests, data classification, and incident/restore playbooks-strengthen implementation but do not replace an SRS requirement.
""")
    sections.append(f"""## 2. Automated numbered-requirement inventory

| Class | Extracted unique IDs | Expected | Status |
|---|---:|---:|---|
| Functional (`FR-*`) | {groups['FR']} | 175 | {'PASS' if groups['FR'] == 175 else 'FAIL'} |
| Non-functional (`NFR-*`) | {groups['NFR']} | 38 | {'PASS' if groups['NFR'] == 38 else 'FAIL'} |
| Security (`SEC-*`) | {groups['SEC']} | 33 | {'PASS' if groups['SEC'] == 33 else 'FAIL'} |
| **Total** | **{len(requirements)}** | **246** | **{'PASS' if len(requirements) == 246 else 'FAIL'}** |

The matrix was generated directly from the SRS DOCX XML by `tools/generate_traceability.py`. The generator fails if the extracted set is not 246 IDs, if a family is unmapped, or if an ID lacks a completion part/test strategy.
""")

    sections.append("## 3. Numbered requirements")
    order = [
        "FR-CM", "FR-AM", "FR-CB", "FR-WA", "FR-CG", "FR-LG", "FR-FM", "FR-PM", "FR-CE", "FR-KB", "FR-NA", "FR-RA",
        "NFR-P", "NFR-S", "NFR-R", "NFR-U", "NFR-PO", "NFR-M",
        "SEC-A", "SEC-Z", "SEC-E", "SEC-API", "SEC-I", "SEC-C",
    ]
    for item in order:
        sections.append(f"### 3.{order.index(item) + 1} {FAMILY_TITLES[item]} - {counts[item]} requirements")
        sections.append(requirement_table(requirements, item))

    sections.append("""## 4. Unnumbered architecture and technology obligations

| SRS obligation | Roadmap accountability | Verification gate |
|---|---|---|
| Standalone single-operator modular-monolith web application; no initial client access | Parts 1-2 and 12 | Architecture dependency inspection; auth/E2E proves owner-only access; future routes absent/flagged. |
| Presentation: Next.js 14+ App Router, React 18+, TypeScript 5+, Tailwind 3+, D3/Vis, TanStack Query 5+, Zustand, Framer Motion, React Hook Form/Zod, shadcn/ui | Parts 1, 4, 12 | Lockfile/ADR inspection, production build, UI and graph tests. |
| Backend: Next.js APIs, Prisma 5+, Supabase, Redis/Upstash, BullMQ, LangChain.js, OpenAI, Anthropic, n8n, Stripe | Parts 2, 5, 7, 10, 12 | Runtime/adapters/schema/worker inspection and sandbox contract tests. |
| Data: PostgreSQL + pgvector, Redis cache/rate/session/queue, private Supabase Storage | Part 2; verified Part 12 | Migration, vector query, Redis-loss recovery, storage-policy tests. |
| External adapter pattern for auth, calls, errors, retries | Part 2 and every integration part | Adapter contract suite; no provider SDK imports in domain/UI routes. |
| Synchronous, asynchronous, and realtime data flows described in Sections 3.4 | Parts 2-12 | Cross-domain E2E plus outbox/queue/realtime reconnect evidence. |
| API-first: all operational functionality automatable through REST API | Every feature part; audited Part 12 | UI-to-API/use-case mapping and OpenAPI completeness diff. |
| AI per-token cost awareness and optimization | Parts 5, 10, 11, 12 | Usage ledger, budget enforcement, cost alerts/reporting tests. |
| Core data read-only accessibility when external APIs are down | Parts 1, 5, 12 | Fault-injection and degraded/read-only-mode E2E. |
| No vendor lock-in; PostgreSQL and full data export | Parts 2 and 12 | PostgreSQL restore and JSON/CSV/config round-trip. |
| Browsers: latest two Chrome, Firefox, Safari, Edge | Parts 1 and 12 | Cross-browser E2E matrix. |
| Deployment portability to Vercel/Railway/Render/AWS-capable Node host | Parts 1, 2, 12 | Build/runtime config and documented alternative-host deployment check. |
""")

    sections.append("""## 5. Knowledge graph specification coverage

| Graph obligation | Part | Acceptance evidence |
|---|---:|---|
| Force-directed SVG renderer; Canvas fallback for 500+ nodes; configurable physics and hub clustering | 4/12 | 100/300/500-node visual/performance benchmark. |
| Zoom wheel/pinch `[0.1,4]`, pan, click detail, Shift/box multi-select, hover tooltip, drag, fullscreen, reset, Cmd/Ctrl+K, context menu | 4 | Component and keyboard-equivalent E2E for each interaction. |
| Node types: Client cyan r20; AI Agent green r14; Tool orange r12; SOP gray r10; Human yellow r12; Task white r8; Decision purple r10; Knowledge blue r10; Finance mint r10; Hub white r28 | 4 plus domain projections | Contract/legend snapshot and projection tests for every type and metadata set. |
| Hubs: Command, Clients, Agents, Finance, Pipeline/CRM, Content, Knowledge, Automations, Tools with specified contents/position hints | 4 | Hub membership/count/placement tests and responsive visual review. |
| Edge types: ownership, assignment, data flow, dependency, trigger, reference, financial | 4 | Edge validation/style/animation/accessibility tests. |
| LENS Entity/Function/Action filters, combination, 10% fade, tags, URL persistence, Clear All | 4 | Filter reducer and shared-URL E2E. |
| Directory: agent/client/tool/task/knowledge groups, counts/status, search, center/highlight, drag, collapse | 4; populated Parts 5-11 | Directory interaction E2E with honest empty states and later projection tests. |
| Client, Agent, Task/SOP/Knowledge detail drawers and quick actions | Parts 3-5/11 | Drawer field/action/focus and authorization tests. |
| Exact void/grid/neon/glow/font/animation design and reduced-motion alternative | 4/12 | Visual regression, contrast, reduced-motion checks. |
| Realtime node/edge/agent/payment updates and animations; reconnect refetch | 4 plus domain events | Supabase event integration and fault/reconnect test. |
| Desktop graph/sidebar, tablet collapsible sidebar, mobile simplified list | 4/12 | Responsive and functional-equivalence E2E. |
""")

    sections.append("""## 6. Core data model field and relationship coverage

| Entity | Mandatory SRS fields | Part / evidence |
|---|---|---|
| Clients | id, name, industry, status, contact_name/email/phone, website, logo_url, mrr, total_revenue, start_date, notes, created/updated/archived timestamps | Parts 2-3; schema assertions and client E2E. |
| AI Agents | id, name, type, status, model, system_prompt, temperature, max_tokens, schedule_cron, daily_token_budget, total_runs, total_cost_usd, success_rate, last_run fields, config_json, timestamps | Parts 2/5; schema and agent E2E. |
| Agent Runs | id, agent/client, status, trigger_type, input/output, token counts, cost, duration, error, metadata, start/complete timestamps | Parts 2/5; run-state and cost tests. |
| Projects | id, client, name, type, status, description, dates, price, hours, deliverables_json, timestamps | Parts 2-3; schema/project/deliverable tests. |
| Invoices | id, client, Stripe ID, type, status, amount/currency, line_items, due/paid/sent dates, notes, created_at | Parts 2/10; Stripe reconciliation and decimal tests. |
| Knowledge Entries | id, title/category/content/tags, vector(1536), linked IDs, version/access fields, timestamps | Parts 2/11; vector/version/search/load tests. |
| Pipeline Leads | id, identity/contact/company/source/stage/value/notes/follow-up/timestamps | Parts 2/9; CRM API/E2E. |
| Graph Edges | source/target IDs and types, edge_type, label, metadata, created_at | Parts 2/4; relationship validation and graph tests. |
| Notifications | type/priority/title/body/entity/channels/read/sent/read timestamps | Parts 2/11; trigger and API tests. |

Mandatory relationships verified in Parts 2/12: Client 1:N Contacts/Projects/Invoices; Client M:N Agents; Agent 1:N Runs; Agent M:N Knowledge; Project 1:N Tasks and M:N Agents; Knowledge M:N related entities; Graph Edge two entity references; Notification optional entity reference; Invoice 1:1 Stripe invoice mapping.
""")

    api_rows = [
        ("Clients", "GET,POST /api/v1/clients; GET,PATCH,DELETE /api/v1/clients/:id; GET client projects/invoices/communications; POST communications", "3"),
        ("Agents", "GET,POST /api/v1/agents; GET,PATCH,DELETE /api/v1/agents/:id; POST run/pause/resume; GET runs/memory; PATCH memory", "5"),
        ("Graph", "GET /api/v1/graph, nodes, edges, node detail, search; POST edges; DELETE edge", "4"),
        ("Finance", "GET invoices/list/detail; POST invoice/create/send; GET dashboard/P&L/client-profitability; POST/GET expenses", "10"),
        ("CRM", "GET/POST pipeline leads; PATCH lead; POST proposal; GET proposal; GET stats", "9"),
        ("Knowledge", "GET list/detail/search/related; POST; PATCH; DELETE", "11"),
        ("Notifications", "GET list/unread-count; PATCH read; POST read-all", "11"),
    ]
    api_table = ["| Resource | Required endpoint set | Part | Verification |", "|---|---|---:|---|"]
    for resource, endpoints, part in api_rows:
        api_table.append(f"| {resource} | {endpoints} | {part} | OpenAPI path diff + authenticated contract tests for every operation. |")
    sections.append("## 7. API contract and endpoint coverage\n\n" + "\n".join(api_table) + """

Every endpoint additionally inherits SRS Section 8.1: REST/JSON, Supabase JWT bearer token, normalized errors, cursor pagination, `/api/v1`, 100 requests/minute, and response envelope. Part 12 fails if OpenAPI and shipped routes differ.
""")

    sections.append("""## 8. Realtime event coverage

| Channel | Event(s) and payload intent | Part | Verification |
|---|---|---:|---|
| `graph:updates` | `node_created`, `node_updated`, `node_deleted`, `edge_created`, `edge_deleted` | 4 plus producers 3-11 | Typed event/animation/reconnect tests. |
| `agent:status` | `status_changed`, `run_completed`, `run_failed` | 5 | Worker-to-graph/notification realtime E2E. |
| `finance:updates` | `payment_received` | 10 | Stripe webhook-to-graph glow E2E. |
| `notifications:new` | `notification` | 11 | Trigger-to-badge/toast realtime E2E. |

All realtime views refetch authoritative state after reconnect; realtime messages are not the sole durable record.
""")

    sections.append("""## 9. Inbound webhook coverage

| Path | Source / events | Part | Security and acceptance evidence |
|---|---|---:|---|
| `/webhooks/stripe` | Invoice paid, payment failed, subscription updated | 10/12 | Raw-body signature, replay/timestamp, event-ID dedupe, out-of-order reconciliation. |
| `/webhooks/n8n` | Workflow completed/failed | 7/12 | Signature/HMAC, schema, dedupe, queued processing, status E2E. |
| `/webhooks/email` | Delivered, opened, bounced, replied | 9/12 | Provider signature, limitations, dedupe, communication/pipeline transitions. |
| `/webhooks/leads` | Website lead form | 9/12 | Auth/signature or trusted-origin policy, validation, spam/rate controls, dedupe. |
| `/webhooks/social` | Publish and engagement metrics | 8/12 | Signature, dedupe, provider ID, attribution/time, polling reconciliation. |
""")

    sections.append("""## 10. External integration coverage

| Integration | Required behavior | Part(s) | Verification |
|---|---|---:|---|
| OpenAI / Anthropic | LLM and embeddings, model choice, token/cost tracking | 5/11/12 | Provider contracts, sandbox smoke, outage/cost test. |
| n8n / Make.com | Generate, deploy, test, monitor workflows | 7/12 | Capability matrix and sandbox contract/E2E. |
| Stripe | Invoice/payment/subscription bidirectional sync | 10/12 | Sandbox and reconciliation suite. |
| Gmail / Google | OAuth and client communication auto-log | 3/12 | OAuth/adapter contract and dedupe tests. |
| Slack | Optional alerts/bidirectional integration seam | 11/12 | Bot-token health and notification contract; no future Slack command interface. |
| LinkedIn / X | Approved publishing; authorized lead data where permitted | 8/9/12 | Provider capability/terms matrix, sandbox/contract tests. |
| WordPress / Mailchimp | Approved content publishing | 8/12 | Channel preview/publish/idempotency contracts. |
| SendGrid / Resend / SMTP | Invoice, notification, outreach email and events | 9-11/12 | Send/event/signature/bounce/retry contracts. |
| Twilio / Instagram | Chatbot channels | 6/12 | Signed inbound/outbound adapter tests. |
| Calendly / Cal.com | Chatbot appointment booking | 6/12 | Booking contract and duplicate/cancel behavior. |
| Lead sources | LinkedIn, Google Maps, directories, Crunchbase, Apollo with authorization | 9/12 | Terms/capability config, rate limit, provenance, no-evasion review. |
| Notion | Bidirectional knowledge sync integration seam | 2/11/12 | Adapter contract or explicit not-configured state. |
| GitHub | Deploy/issue integration seam | 2/12 | Token-vault and adapter contract. |
| Supabase/Vercel/Upstash/Cloudflare/Sentry/Axiom | Platform services | 1/2/12 | Deployment, security, monitoring, recovery evidence. |
""")

    sections.append("""## 11. UI, responsive, and accessibility coverage

| UI obligation | Part(s) | Acceptance evidence |
|---|---:|---|
| 48 px top bar, global search, notification, avatar; 240 px left nav; 320 px right sidebar; 480 px drawer | 1/4 | Responsive shell and focus E2E. |
| Dashboard metrics/sparklines/revenue/agent activity/pipeline/notifications/quick actions | 11 | Data correctness, customization, under-3-second benchmark. |
| Knowledge Graph full canvas, LENS, directory, drawer, fullscreen, legend | 4 | Complete graph interaction and responsive/accessibility suite. |
| Clients sortable list/grid, status tabs, detail drawer, New Client | 3 | Client E2E and table/form accessibility. |
| Agents cards/status/config/runs/memory/filter/New Agent | 5 | Agent E2E and realtime graph test. |
| Dark-only initial theme with exact palette/type/grid/noise/glow/motion | 1/4/12 | Token/visual regression/contrast/reduced-motion audit. |
| Desktop ≥1280, tablet 768-1279, mobile <768 behavior | Every UI part; final 12 | Cross-browser viewport E2E; mobile graph list equivalence. |
| WCAG 2.1 AA, keyboard, ARIA, focus, screen-reader tables/graph descriptions | Every UI part; final 12 | Automated plus manual keyboard/screen-reader audit. |
""")

    sections.append("""## 12. Notification default matrix coverage

| Trigger | Required default channel | Priority | Default | Part / evidence |
|---|---|---|---|---|
| Agent failure/error | Email + In-app + Slack | Critical | On | 5/11; table-driven trigger test. |
| Invoice overdue 3+ days | Email + In-app | High | On | 10/11; scheduler/channel test. |
| New lead captured | In-app + Slack | Medium | On | 9/11; event test. |
| Client reply received | In-app + Email | Medium | On | 9/11; email webhook test. |
| Task due today | In-app | Medium | On | 11; date/timezone test. |
| Task overdue | In-app + Email | High | On | 11; date/channel test. |
| API cost threshold exceeded | Email + Slack | High | On | 5/11; budget event test. |
| Weekly report ready | In-app | Low | On | 11; schedule completion test. |
| Contract renewal due in 30 days | Email + In-app | High | On | 11; renewal-date test. |
| Content scheduled to publish | In-app | Low | On | 8/11; schedule test. |
| Knowledge base suggestion | In-app | Low | Off | 11; opt-in behavior test. |
""")

    sections.append("""## 13. Environment and deployment coverage

| Obligation | Required values/providers | Part / evidence |
|---|---|---|
| Required environment names | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `N8N_API_URL`, `N8N_API_KEY`, `REDIS_URL`; optional `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `SENTRY_DSN` | 1/2/12; startup schema and production secret inventory with no values in Git. |
| Hosting | Vercel frontend/API; Supabase DB/Auth/Storage/Realtime; Upstash Redis; n8n Railway/Render; Cloudflare domain/CDN/DDoS | 12 | Deployment inventory, smoke tests, TLS/security checks. |
| Estimated operating envelope | SRS estimate $100-305/month (actuals may differ) | 12 | Cost dashboard/budget documentation; no claim that estimate is guaranteed. |
| CI/CD | Push lint/typecheck/tests/build; PR preview; main production + reviewed Prisma migration; weekly security scan | 1/2/12 | GitHub Actions execution evidence. |
| Monitoring | Sentry, Vercel Analytics, UptimeRobot, API spend, Supabase health, agent health, Axiom/Logtail | 5/12 | Active dashboards/alerts and runbooks. |
| Backup/recovery | Daily, 30-day/PITR, storage versioning, deploy from GitHub, RPO 24h, RTO 1h | 12 | Timed restore drill and data verification. |
""")

    sections.append("""## 14. Original milestone and phase-exit coverage

| SRS phase | Roadmap parts | Preserved exit demonstration |
|---|---|---|
| Phase 1 Foundation, Weeks 1-4 | 1-4 | Login, create clients, graph nodes, details, entity filtering. |
| Phase 2 AI Agents Core, Weeks 5-8 | 5 plus Chatbot v1 in 6 | Configure/run agent in background, output/log/cost/memory and live graph state. |
| Phase 3 Services & Finance, Weeks 9-12 | 6, 7, 10 plus service strategies | Four+ working agents, Stripe invoice, revenue/expenses/margins. |
| Phase 4 CRM, Content & Knowledge, Weeks 13-16 | 8, 9, 11 | Pipeline, content, semantic KB, notifications, full LENS. |
| Phase 5 Optimization & Scale, Weeks 17-20 | 12 | Production-ready for 10-15 clients; optimized costs; complete repeatable documentation. |
| Phase 6 Future Enhancements | Separate post-MVP specifications | Extension seams only; no premature/insecure exposure. |
""")

    sections.append("""## 15. Post-MVP feature preservation

| Explicit SRS future enhancement | Initial-release treatment | Future acceptance prerequisite |
|---|---|---|
| Client read-only portal | Feature-flagged extension seam; no route/access in MVP | Multi-user authorization/RLS/privacy threat model and new SRS. |
| White-label mode | Theme/domain/report configuration seam only | Tenant/brand isolation and commercial configuration specification. |
| Contractor/multi-user support | Owner identity/audit fields only | Roles, invitations, least privilege, offboarding, RLS tests. |
| Agent/template marketplace | Not implemented | Package signing, sandbox, review, billing, supply-chain threat model. |
| Predictive revenue/churn/ROI | Instrument source data only | Data quality, explainability, model validation, owner decision safeguards. |
| Voice interface | Not implemented | Privacy, confirmation, retention, accessibility design. |
| Native mobile/PWA | Responsive web only | Device/offline/conflict/security specification. |
| Google/Outlook calendar integration | Adapter seam only | OAuth scope, sync/conflict/timezone design. |
| Slack bot commands | Slack notification adapter only | Command auth, confirmations, audit, rate limits. |
| Custom visual integrations builder | Typed adapter registry only | Permission model, secrets UI, sandbox, validation. |
""")

    sections.append("""## 16. Success metric instrumentation

| Metric | Month 6 SRS target | Month 12 SRS target | Source of truth / Part |
|---|---:|---:|---|
| Active clients | 5-8 | 10-15 | Active client records / Parts 3, 11, 12 |
| MRR | $5k-$10k | $15k-$25k | Recurring ledger / Parts 10-12 |
| Operational agents | 6-8 | 10-15 | Enabled agents with recent success / Parts 5, 11 |
| Agent success rate | >90% | >95% | Run terminal states / Part 5 |
| Monthly API cost | <$200 | <$400 | Provider usage ledger / Parts 5, 10 |
| Owner hours per client/week | <3 | <2 | Manual + agent-attributed time / Parts 3, 5, 11 |
| Uptime | >99% | >99.5% | External uptime/SLI / Part 12 |
| Knowledge entries | 100+ | 300+ | Active knowledge entries / Part 11 |
| Profit margin | >80% | >85% | Reconciled revenue/expense ledger / Part 10 |

Targets are goals, not seeded results. Dashboards must report observed data and quality limitations.
""")

    sections.append("""## 17. Final traceability acceptance checklist

- [ ] Generator reports exactly 246 unique IDs: 175 FR, 38 NFR, 33 SEC.
- [ ] Every ID has one completion part and one evidence strategy.
- [ ] All SRS data fields, enums, defaults, and relationships pass schema assertions.
- [ ] Every SRS endpoint appears in OpenAPI and authenticated contract tests.
- [ ] Every realtime event and webhook path has typed, replay-safe integration evidence.
- [ ] All graph nodes/hubs/edges/controls/LENS/drawers/visual/realtime/responsive requirements pass.
- [ ] Every external integration has sandbox/contract evidence or an honest optional/not-configured state.
- [ ] Every notification trigger has exact channel, priority, and default tests.
- [ ] Every UI page/layout/responsive/accessibility obligation passes.
- [ ] Deployment, CI/CD, monitoring, cost, backup, PITR, RPO, and RTO evidence passes.
- [ ] Original phase exits are demonstrated.
- [ ] Post-MVP items remain documented and gated.
- [ ] Success metrics are instrumented from real records and not fabricated.
- [ ] Recommended additions do not replace or narrow any SRS requirement.
""")
    return "\n\n".join(sections).strip() + "\n"


def main() -> None:
    paragraphs = extract_paragraphs(SOURCE)
    requirements = parse_requirements(paragraphs)
    if len(requirements) != 246:
        raise SystemExit(f"Expected 246 unique requirement IDs, extracted {len(requirements)}")
    expected_families = set(PART_BY_FAMILY)
    actual_families = {family(item) for item in requirements}
    if actual_families != expected_families:
        raise SystemExit(
            f"Requirement family mismatch. Missing mappings: {actual_families - expected_families}; "
            f"unexpected mappings: {expected_families - actual_families}"
        )
    missing_descriptions = [rid for rid, item in requirements.items() if not item["description"]]
    if missing_descriptions:
        raise SystemExit(f"Requirements missing descriptions: {missing_descriptions}")
    OUTPUT.write_text(make_document(requirements), encoding="utf-8")
    print(f"Wrote {OUTPUT}")
    print(f"Coverage: {len(requirements)}/246 unique numbered requirements")
    print("Family counts:")
    for item in sorted(Counter(family(rid) for rid in requirements).items()):
        print(f"  {item[0]}: {item[1]}")


if __name__ == "__main__":
    main()
