# AI Automation Agency OS - SRS Coverage and Traceability Matrix

**Source:** `D:\Downloads\AI_Automation_Agency_OS_SRS.docx`  
**Document ID:** SRS-AIOS-2026-001  
**Version:** 1.0, July 2026  
**Purpose:** Prove that the 12-part roadmap preserves every numbered requirement and every material unnumbered SRS obligation.

## 1. Coverage policy

The original SRS remains authoritative. “Completion part” identifies the part accountable for finished behavior; foundational or cross-cutting work may occur earlier. Part 12 independently verifies all non-functional and security requirements. A row is not complete because code exists: the listed evidence must pass in a production-like or appropriate sandbox/test environment.

Recommended additions in the roadmap-adapter contracts, outbox, idempotency, feature flags, structured telemetry, dead-letter replay, deterministic AI tests, data classification, and incident/restore playbooks-strengthen implementation but do not replace an SRS requirement.


## 2. Automated numbered-requirement inventory

| Class | Extracted unique IDs | Expected | Status |
|---|---:|---:|---|
| Functional (`FR-*`) | 175 | 175 | PASS |
| Non-functional (`NFR-*`) | 38 | 38 | PASS |
| Security (`SEC-*`) | 33 | 33 | PASS |
| **Total** | **246** | **246** | **PASS** |

The matrix was generated directly from the SRS DOCX XML by `tools/generate_traceability.py`. The generator fails if the extracted set is not 246 IDs, if a family is unmapped, or if an ID lacks a completion part/test strategy.


## 3. Numbered requirements

### 3.1 Client Management - 20 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `FR-CM-001` | System shall allow creating a new client with: name, industry, contact person, email, phone, company website, notes, and logo upload | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-002` | System shall allow editing any client field at any time | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-003` | System shall allow archiving (soft delete) a client - data retained but hidden from active views | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-004` | System shall allow permanently deleting a client with confirmation dialog and 7-day undo window | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-005` | System shall display clients in a list view (sortable by name, MRR, start date, status) and as nodes on the knowledge graph | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-006` | System shall support client status: Active, Onboarding, Paused, Churned, Prospect | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-007` | System shall allow adding multiple contacts per client (name, role, email, phone, notes) | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-008` | System shall mark one contact as primary | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-009` | System shall track last contact date for each contact | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-010` | Contacts shall appear as Human nodes on the knowledge graph, connected to their client node | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-011` | System shall allow creating projects under a client (name, type, status, start date, due date, description) | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-012` | Project types: Chatbot Build, Workflow Automation, Content Package, Lead Generation, Custom | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-013` | System shall track project status: Planning, In Progress, Review, Delivered, Revision, Complete | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-014` | System shall allow assigning AI agents and/or human tasks to projects | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-015` | System shall track time spent on each project (manual entry + auto-tracked from agent runs) | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-016` | Each project shall have a deliverables checklist that must be completed before marking as Delivered | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-017` | System shall maintain a chronological log of all client communications (email, notes, call summaries, Slack messages) | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-018` | System shall allow manually logging communications (type, date, summary, next action) | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-019` | System shall auto-log emails sent via integrated Gmail when tagged with client email | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |
| `FR-CM-020` | Communication log shall be visible in the client detail panel on the knowledge graph | Part 3 | Client domain unit + `/api/v1/clients` integration + responsive E2E and graph-projection test proving the stated behavior/target. |

### 3.2 AI Agent Management - 24 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `FR-AM-001` | System shall allow creating new AI agents with: name, description, type, model selection, system prompt, and tool assignments | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-002` | Agent types: Chatbot Builder, Workflow Designer, Content Writer, Lead Generator, Invoice Chaser, CRM Manager, Weekly Reporter, Research Analyst, Custom | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-003` | System shall allow selecting LLM model per agent (GPT-4o, GPT-4o-mini, Claude 3.5 Sonnet, Claude 4) | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-004` | System shall allow configuring model parameters: temperature, max tokens, top_p, frequency penalty | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-005` | System shall allow writing and editing the system prompt for each agent via a rich text editor | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-006` | System shall allow assigning tools to agents (web search, file read/write, code execution, API calls, email send) | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-007` | System shall allow setting agent schedule: Manual (run on demand), Scheduled (cron expression), Event-triggered (webhook) | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-008` | System shall execute agents via BullMQ background job queue | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-009` | Each agent run shall be logged with: start time, end time, duration, input, output, token usage, API cost, status (success/fail) | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-010` | System shall support agent chaining - output of Agent A can trigger Agent B | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-011` | System shall support human-in-the-loop - agent drafts output, pauses for owner approval, then executes | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-012` | System shall implement retry logic: up to 3 retries with exponential backoff on API failures | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-013` | System shall enforce daily token budget per agent (configurable limit) to control costs | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-014` | System shall display real-time agent status on the knowledge graph (green=running, yellow=idle, red=error, gray=paused) | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-015` | System shall provide an agent dashboard showing: all agents, current status, last run time, total runs, total cost, success rate | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-016` | System shall send notifications when an agent fails (email + in-app + optional Slack) | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-017` | System shall provide a run log viewer with filtering by agent, date range, status | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-018` | System shall track cumulative API costs per agent and display on the agent node | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-019` | System shall show agent output preview in the notification (abbreviated, expandable to full) | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-020` | Each agent shall have a persistent memory store (key-value + vector embeddings) | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-021` | Agent memory shall persist across runs - the agent remembers client preferences, past outputs, and lessons | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-022` | System shall allow owner to view and edit agent memory directly | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-023` | Agent memory shall be scoped - client-specific memory is not shared across clients unless explicitly linked | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |
| `FR-AM-024` | System shall implement memory summarization - when memory exceeds token limits, older entries are compressed into summaries | Part 5 | Agent runtime unit + BullMQ/provider integration + approval/memory/cost E2E and graph realtime test proving the stated behavior/target. |

### 3.3 Chatbot Builder - 17 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `FR-CB-001` | Agent shall accept client-provided knowledge base (FAQ document, website URLs, product docs) as training material | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-002` | Agent shall parse uploaded documents and generate structured Q&A pairs for chatbot training | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-003` | Agent shall create chatbot configuration: name, brand voice, greeting message, fallback response, escalation rules | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-004` | System shall allow selecting chatbot platform: Website widget (embeddable JS), WhatsApp (via Twilio), Instagram DM, custom API | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-005` | System shall generate an embeddable JavaScript widget for website deployment | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-006` | Agent shall support multi-turn conversation with context memory (conversation history window of 10 messages) | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-007` | Chatbot shall handle FAQ responses with configurable confidence threshold (below threshold = escalate to human) | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-008` | Chatbot shall support lead capture: collect name, email, phone during conversation | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-009` | Chatbot shall support appointment booking integration (Calendly / Cal.com API) | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-010` | Chatbot shall support product/service recommendations based on conversation context | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-011` | Chatbot shall log all conversations with transcript, intent classification, and sentiment score | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-012` | Chatbot shall support custom actions triggered by keywords (e.g., 'pricing' → show pricing page) | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-013` | System shall provide a conversation dashboard showing all chats across all client chatbots | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-014` | System shall allow owner to take over a conversation manually (human takeover mode) | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-015` | System shall flag conversations where confidence was below threshold for owner review | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-016` | System shall generate weekly chatbot performance reports (conversations handled, resolution rate, leads captured, avg response time) | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |
| `FR-CB-017` | System shall allow A/B testing different chatbot prompts and measuring conversion | Part 6 | Chatbot ingestion/channel/conversation contract tests + secured widget end-to-end scenario proving the stated behavior/target. |

### 3.4 Workflow Automation - 15 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `FR-WA-001` | Agent shall accept a natural language description of the desired automation from the client | Part 7 | Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E proving the stated behavior/target. |
| `FR-WA-002` | Agent shall generate a workflow blueprint (nodes, triggers, conditions, actions) in n8n JSON format | Part 7 | Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E proving the stated behavior/target. |
| `FR-WA-003` | System shall provide a visual workflow editor for reviewing and modifying generated workflows before deployment | Part 7 | Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E proving the stated behavior/target. |
| `FR-WA-004` | Agent shall validate workflow logic (check for missing connections, infinite loops, unhandled errors) before deployment | Part 7 | Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E proving the stated behavior/target. |
| `FR-WA-005` | System shall support workflow templates for common patterns (lead follow-up, review response, invoice reminder, social cross-posting) | Part 7 | Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E proving the stated behavior/target. |
| `FR-WA-006` | System shall deploy workflows to n8n via API (create workflow, activate, set webhook URLs) | Part 7 | Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E proving the stated behavior/target. |
| `FR-WA-007` | System shall deploy workflows to Make.com via API as an alternative platform | Part 7 | Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E proving the stated behavior/target. |
| `FR-WA-008` | System shall configure all required credentials and API connections on the automation platform | Part 7 | Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E proving the stated behavior/target. |
| `FR-WA-009` | System shall run a test execution of the workflow before marking as deployed | Part 7 | Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E proving the stated behavior/target. |
| `FR-WA-010` | System shall generate a client-facing workflow documentation page (what it does, triggers, expected outputs) | Part 7 | Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E proving the stated behavior/target. |
| `FR-WA-011` | System shall monitor deployed workflow execution status via n8n/Make.com APIs | Part 7 | Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E proving the stated behavior/target. |
| `FR-WA-012` | System shall alert owner when a workflow fails (with error details and suggested fix) | Part 7 | Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E proving the stated behavior/target. |
| `FR-WA-013` | System shall track execution counts, success rates, and average execution time per workflow | Part 7 | Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E proving the stated behavior/target. |
| `FR-WA-014` | System shall maintain a workflow health dashboard showing all deployed workflows and their status | Part 7 | Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E proving the stated behavior/target. |
| `FR-WA-015` | System shall generate monthly workflow impact reports (hours saved, tasks automated, errors prevented) | Part 7 | Workflow generator/validator unit + n8n/Make contract/sandbox + deploy/monitor E2E proving the stated behavior/target. |

### 3.5 Client Content Generation - 15 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `FR-CG-001` | Agent shall accept client brand voice profile (tone, vocabulary, target audience, key messages) as persistent memory | Part 8 | Client-content scope/approval/calendar/publisher tests + observed-metrics E2E proving the stated behavior/target. |
| `FR-CG-002` | Agent shall generate social media posts (LinkedIn, Twitter/X, Instagram captions) based on content calendar | Part 8 | Client-content scope/approval/calendar/publisher tests + observed-metrics E2E proving the stated behavior/target. |
| `FR-CG-003` | Agent shall generate email newsletters from a topic brief or recent news/updates | Part 8 | Client-content scope/approval/calendar/publisher tests + observed-metrics E2E proving the stated behavior/target. |
| `FR-CG-004` | Agent shall generate long-form blog articles with SEO optimization (keywords, meta description, headings) | Part 8 | Client-content scope/approval/calendar/publisher tests + observed-metrics E2E proving the stated behavior/target. |
| `FR-CG-005` | Agent shall generate video scripts (YouTube, TikTok, Reels) with hook, body, CTA structure | Part 8 | Client-content scope/approval/calendar/publisher tests + observed-metrics E2E proving the stated behavior/target. |
| `FR-CG-006` | All generated content shall go through an approval workflow: Draft → Owner Review → Client Review → Approved → Scheduled/Published | Part 8 | Client-content scope/approval/calendar/publisher tests + observed-metrics E2E proving the stated behavior/target. |
| `FR-CG-007` | Agent shall support content repurposing - one piece of content auto-converted to 5+ formats | Part 8 | Client-content scope/approval/calendar/publisher tests + observed-metrics E2E proving the stated behavior/target. |
| `FR-CG-008` | System shall maintain a content calendar per client with publish dates, platforms, and content status | Part 8 | Client-content scope/approval/calendar/publisher tests + observed-metrics E2E proving the stated behavior/target. |
| `FR-CG-009` | Calendar shall display as both a monthly grid view and a list view | Part 8 | Client-content scope/approval/calendar/publisher tests + observed-metrics E2E proving the stated behavior/target. |
| `FR-CG-010` | System shall auto-schedule content based on optimal posting times per platform | Part 8 | Client-content scope/approval/calendar/publisher tests + observed-metrics E2E proving the stated behavior/target. |
| `FR-CG-011` | System shall support bulk content generation - generate a week/month of content in one agent run | Part 8 | Client-content scope/approval/calendar/publisher tests + observed-metrics E2E proving the stated behavior/target. |
| `FR-CG-012` | System shall publish approved content to connected platforms via API (LinkedIn, Twitter/X, WordPress, Mailchimp) | Part 8 | Client-content scope/approval/calendar/publisher tests + observed-metrics E2E proving the stated behavior/target. |
| `FR-CG-013` | System shall queue content for scheduled publishing at optimal times | Part 8 | Client-content scope/approval/calendar/publisher tests + observed-metrics E2E proving the stated behavior/target. |
| `FR-CG-014` | System shall track published content performance (impressions, engagement, clicks) via platform APIs | Part 8 | Client-content scope/approval/calendar/publisher tests + observed-metrics E2E proving the stated behavior/target. |
| `FR-CG-015` | System shall generate monthly content performance reports per client | Part 8 | Client-content scope/approval/calendar/publisher tests + observed-metrics E2E proving the stated behavior/target. |

### 3.6 Client Lead Generation - 17 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `FR-LG-001` | Agent shall scrape leads from configurable sources: LinkedIn, Google Maps, industry directories, Crunchbase, Apollo.io API | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-002` | System shall accept lead search criteria: industry, location, company size, job title, technology used | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-003` | Agent shall deduplicate leads against existing client databases | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-004` | System shall store leads in a structured database with: name, company, title, email, phone, LinkedIn URL, source, date found | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-005` | Agent shall score leads based on configurable criteria (fit score 1-100) | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-006` | Agent shall research each lead (company website, recent news, LinkedIn activity) and generate a brief | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-007` | System shall categorize leads: Hot (ready to outreach), Warm (needs nurturing), Cold (low fit) | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-008` | System shall flag leads that match competitor companies or blocked domains | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-009` | Agent shall generate personalized cold email sequences (3-5 email drip) per lead using research brief | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-010` | System shall support email sending via integrated SMTP or email service (SendGrid, Resend) | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-011` | All outreach shall require owner approval before sending (human-in-the-loop) | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-012` | System shall track email opens, replies, and bounces via email service webhooks | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-013` | System shall automatically advance leads through sequence stages based on responses | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-014` | System shall support LinkedIn message drafting (owner sends manually from their account) | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-015` | System shall display leads in a Kanban pipeline: Sourced → Qualified → Outreach Sent → Replied → Meeting Booked → Converted | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-016` | System shall track conversion rates at each pipeline stage | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |
| `FR-LG-017` | System shall generate weekly lead generation reports for clients (leads found, qualified, outreach sent, response rate, meetings booked) | Part 9 | Authorized source/dedup/score/outreach approval tests + client lead-service E2E proving the stated behavior/target. |

### 3.7 Financial Management - 19 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `FR-FM-001` | System shall generate invoices via Stripe API with: client, line items (service type, hours/amount, rate), due date, payment terms | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-002` | System shall support invoice types: One-time (setup fee), Recurring (monthly retainer), Usage-based (per-deliverable) | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-003` | System shall send invoices to clients via email with Stripe-hosted payment page | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-004` | System shall track invoice status: Draft, Sent, Paid, Overdue, Cancelled | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-005` | System shall auto-send overdue reminders at 3, 7, and 14 days past due | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-006` | System shall sync payment status from Stripe webhooks in real-time | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-007` | System shall track MRR (Monthly Recurring Revenue) calculated from active retainer clients | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-008` | System shall track total revenue (MRR + one-time fees + usage charges) | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-009` | System shall display revenue dashboard: MRR chart, revenue by client, revenue by service type, month-over-month growth | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-010` | Revenue data shall appear as Financial nodes on the knowledge graph | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-011` | System shall support revenue projections based on pipeline deals and expected close rates | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-012` | System shall track business expenses: API costs (OpenAI, Anthropic), tool subscriptions (n8n, Supabase), hosting, domain, other | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-013` | System shall auto-capture API costs from usage logs | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-014` | System shall allow manual expense entry (amount, category, date, receipt upload) | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-015` | System shall calculate profit margin: (Revenue - Expenses) / Revenue × 100 | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-016` | System shall generate P&L statement: total revenue, total expenses, net profit, by month/quarter/year | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-017` | System shall generate client profitability report: revenue per client minus associated costs (API usage, time) | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-018` | System shall generate tax-ready export (CSV) of all income and expenses | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |
| `FR-FM-019` | System shall display cost-per-agent metrics to identify expensive or inefficient agents | Part 10 | Decimal calculation + Stripe webhook/reconciliation integration + finance E2E/export test proving the stated behavior/target. |

### 3.8 Pipeline / CRM - 13 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `FR-PM-001` | System shall capture leads from: manual entry, website form submissions (webhook), email inquiries, social DMs | Part 9 | CRM state/Kanban/proposal/follow-up tests + agency lead-to-client E2E proving the stated behavior/target. |
| `FR-PM-002` | Each lead shall contain: name, email, company, source, interest, notes, status | Part 9 | CRM state/Kanban/proposal/follow-up tests + agency lead-to-client E2E proving the stated behavior/target. |
| `FR-PM-003` | System shall display leads in a Kanban board: New → Contacted → Qualified → Proposal Sent → Negotiating → Won → Lost | Part 9 | CRM state/Kanban/proposal/follow-up tests + agency lead-to-client E2E proving the stated behavior/target. |
| `FR-PM-004` | System shall allow dragging leads between stages to update status | Part 9 | CRM state/Kanban/proposal/follow-up tests + agency lead-to-client E2E proving the stated behavior/target. |
| `FR-PM-005` | Leads shall appear as Human nodes on the knowledge graph connected to Pipeline hub | Part 9 | CRM state/Kanban/proposal/follow-up tests + agency lead-to-client E2E proving the stated behavior/target. |
| `FR-PM-006` | Agent shall generate client proposals from templates with: scope of work, deliverables, timeline, pricing, terms | Part 9 | CRM state/Kanban/proposal/follow-up tests + agency lead-to-client E2E proving the stated behavior/target. |
| `FR-PM-007` | System shall support proposal versioning (v1, v2, etc. with change tracking) | Part 9 | CRM state/Kanban/proposal/follow-up tests + agency lead-to-client E2E proving the stated behavior/target. |
| `FR-PM-008` | System shall generate proposals as PDF documents for sending | Part 9 | CRM state/Kanban/proposal/follow-up tests + agency lead-to-client E2E proving the stated behavior/target. |
| `FR-PM-009` | System shall track proposal status: Draft, Sent, Viewed (if tracked), Accepted, Rejected | Part 9 | CRM state/Kanban/proposal/follow-up tests + agency lead-to-client E2E proving the stated behavior/target. |
| `FR-PM-010` | System shall auto-generate follow-up emails for leads in each pipeline stage | Part 9 | CRM state/Kanban/proposal/follow-up tests + agency lead-to-client E2E proving the stated behavior/target. |
| `FR-PM-011` | System shall schedule follow-ups: 2 days after first contact, 5 days after proposal sent, etc. | Part 9 | CRM state/Kanban/proposal/follow-up tests + agency lead-to-client E2E proving the stated behavior/target. |
| `FR-PM-012` | System shall alert owner when a follow-up is overdue | Part 9 | CRM state/Kanban/proposal/follow-up tests + agency lead-to-client E2E proving the stated behavior/target. |
| `FR-PM-013` | Agent shall personalize follow-ups based on previous communication history | Part 9 | CRM state/Kanban/proposal/follow-up tests + agency lead-to-client E2E proving the stated behavior/target. |

### 3.9 Agency Content Engine - 9 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `FR-CE-001` | System shall maintain the agency's own content strategy: target audience, key topics, brand voice, content pillars | Part 8 | Agency strategy/generation/approval/publishing/ROI tests + campaign E2E proving the stated behavior/target. |
| `FR-CE-002` | Agent shall generate weekly content ideas based on industry trends, client wins, and content calendar gaps | Part 8 | Agency strategy/generation/approval/publishing/ROI tests + campaign E2E proving the stated behavior/target. |
| `FR-CE-003` | System shall maintain a content calendar for the agency's own social media, blog, and newsletter | Part 8 | Agency strategy/generation/approval/publishing/ROI tests + campaign E2E proving the stated behavior/target. |
| `FR-CE-004` | Agent shall produce content drafts: LinkedIn posts, Twitter threads, blog articles, newsletter editions, case studies | Part 8 | Agency strategy/generation/approval/publishing/ROI tests + campaign E2E proving the stated behavior/target. |
| `FR-CE-005` | System shall support content repurposing: one blog post → 5 LinkedIn posts → 1 Twitter thread → 1 newsletter section | Part 8 | Agency strategy/generation/approval/publishing/ROI tests + campaign E2E proving the stated behavior/target. |
| `FR-CE-006` | All content shall go through draft → review → approve → schedule → publish workflow | Part 8 | Agency strategy/generation/approval/publishing/ROI tests + campaign E2E proving the stated behavior/target. |
| `FR-CE-007` | System shall track content performance: impressions, engagement rate, clicks, conversions per piece | Part 8 | Agency strategy/generation/approval/publishing/ROI tests + campaign E2E proving the stated behavior/target. |
| `FR-CE-008` | System shall identify top-performing content and suggest similar topics | Part 8 | Agency strategy/generation/approval/publishing/ROI tests + campaign E2E proving the stated behavior/target. |
| `FR-CE-009` | System shall generate monthly content ROI report | Part 8 | Agency strategy/generation/approval/publishing/ROI tests + campaign E2E proving the stated behavior/target. |

### 3.10 Knowledge Base and SOPs - 14 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `FR-KB-001` | System shall store knowledge as structured entries: title, category, content (Markdown), tags, linked entities | Part 11 | Knowledge version/search/vector/link/SOP tests + 10,000-entry performance and E2E proving the stated behavior/target. |
| `FR-KB-002` | Categories: SOPs, Templates, Brand Voices, Client Data, Industry Research, Lessons Learned, Decisions, Meeting Notes | Part 11 | Knowledge version/search/vector/link/SOP tests + 10,000-entry performance and E2E proving the stated behavior/target. |
| `FR-KB-003` | System shall generate vector embeddings for all knowledge entries (for semantic search) | Part 11 | Knowledge version/search/vector/link/SOP tests + 10,000-entry performance and E2E proving the stated behavior/target. |
| `FR-KB-004` | System shall support full-text search and semantic (AI-powered) search across all entries | Part 11 | Knowledge version/search/vector/link/SOP tests + 10,000-entry performance and E2E proving the stated behavior/target. |
| `FR-KB-005` | Knowledge entries shall appear as Knowledge/Memory nodes on the graph, connected to related entities | Part 11 | Knowledge version/search/vector/link/SOP tests + 10,000-entry performance and E2E proving the stated behavior/target. |
| `FR-KB-006` | System shall support knowledge versioning - track changes and allow reverting to previous versions | Part 11 | Knowledge version/search/vector/link/SOP tests + 10,000-entry performance and E2E proving the stated behavior/target. |
| `FR-KB-007` | System shall allow linking knowledge entries to: clients, agents, projects, SOPs, decisions | Part 11 | Knowledge version/search/vector/link/SOP tests + 10,000-entry performance and E2E proving the stated behavior/target. |
| `FR-KB-008` | Linked knowledge shall be accessible from the related entity's detail panel | Part 11 | Knowledge version/search/vector/link/SOP tests + 10,000-entry performance and E2E proving the stated behavior/target. |
| `FR-KB-009` | System shall suggest related knowledge entries when viewing any entity (based on embeddings similarity) | Part 11 | Knowledge version/search/vector/link/SOP tests + 10,000-entry performance and E2E proving the stated behavior/target. |
| `FR-KB-010` | Agents shall automatically save learnings to the knowledge base after each significant run | Part 11 | Knowledge version/search/vector/link/SOP tests + 10,000-entry performance and E2E proving the stated behavior/target. |
| `FR-KB-011` | System shall store SOPs as step-by-step procedures with: title, steps (ordered list), materials needed, expected outcome, last tested date | Part 11 | Knowledge version/search/vector/link/SOP tests + 10,000-entry performance and E2E proving the stated behavior/target. |
| `FR-KB-012` | SOPs shall be linkable to agents - an agent can reference an SOP as its operating procedure | Part 11 | Knowledge version/search/vector/link/SOP tests + 10,000-entry performance and E2E proving the stated behavior/target. |
| `FR-KB-013` | System shall track SOP usage count and last execution date | Part 11 | Knowledge version/search/vector/link/SOP tests + 10,000-entry performance and E2E proving the stated behavior/target. |
| `FR-KB-014` | System shall flag SOPs not executed in 30+ days for review | Part 11 | Knowledge version/search/vector/link/SOP tests + 10,000-entry performance and E2E proving the stated behavior/target. |

### 3.11 Notifications and Alerts - 4 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `FR-NA-001` | System shall allow toggling each notification type on/off independently | Part 11 | Table-driven trigger/preference/quiet-hour/digest/channel tests + UI/API E2E proving the stated behavior/target. |
| `FR-NA-002` | System shall support quiet hours (no notifications between configurable start-end times) | Part 11 | Table-driven trigger/preference/quiet-hour/digest/channel tests + UI/API E2E proving the stated behavior/target. |
| `FR-NA-003` | System shall support notification digest - bundle low-priority notifications into a daily summary email | Part 11 | Table-driven trigger/preference/quiet-hour/digest/channel tests + UI/API E2E proving the stated behavior/target. |
| `FR-NA-004` | In-app notifications shall appear as a notification bell with unread count badge | Part 11 | Table-driven trigger/preference/quiet-hour/digest/channel tests + UI/API E2E proving the stated behavior/target. |

### 3.12 Reporting and Analytics - 8 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `FR-RA-001` | System shall display a main dashboard with key metrics: MRR, active clients, active agents, open tasks, pipeline value | Part 11 | Metric correctness/widget/report schedule/PDF/CSV tests + dashboard/report E2E proving the stated behavior/target. |
| `FR-RA-002` | Dashboard shall show sparkline charts for 7-day and 30-day trends | Part 11 | Metric correctness/widget/report schedule/PDF/CSV tests + dashboard/report E2E proving the stated behavior/target. |
| `FR-RA-003` | Dashboard shall be customizable - owner can add/remove/reorder widget cards | Part 11 | Metric correctness/widget/report schedule/PDF/CSV tests + dashboard/report E2E proving the stated behavior/target. |
| `FR-RA-004` | System shall generate weekly summary report: revenue, new clients, tasks completed, agent performance, pipeline changes | Part 11 | Metric correctness/widget/report schedule/PDF/CSV tests + dashboard/report E2E proving the stated behavior/target. |
| `FR-RA-005` | System shall generate monthly business review: P&L, client retention, agent cost analysis, content performance | Part 11 | Metric correctness/widget/report schedule/PDF/CSV tests + dashboard/report E2E proving the stated behavior/target. |
| `FR-RA-006` | System shall generate client-specific reports for sharing (branded PDF with project status, deliverables, metrics) | Part 11 | Metric correctness/widget/report schedule/PDF/CSV tests + dashboard/report E2E proving the stated behavior/target. |
| `FR-RA-007` | All reports shall be exportable as PDF and CSV | Part 11 | Metric correctness/widget/report schedule/PDF/CSV tests + dashboard/report E2E proving the stated behavior/target. |
| `FR-RA-008` | Reports shall be accessible from the Reports section and auto-generated on schedule | Part 11 | Metric correctness/widget/report schedule/PDF/CSV tests + dashboard/report E2E proving the stated behavior/target. |

### 3.13 Performance - 10 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `NFR-P-001` | Page load time (initial) Target: < 2 seconds on broadband | Part 12 (implemented incrementally) | Production-like benchmark with recorded dataset, environment, run count, percentile, and threshold assertion proving the stated behavior/target. |
| `NFR-P-002` | Knowledge graph render time (up to 100 nodes) Target: < 1 second | Part 12 (implemented incrementally) | Production-like benchmark with recorded dataset, environment, run count, percentile, and threshold assertion proving the stated behavior/target. |
| `NFR-P-003` | Knowledge graph render time (100-300 nodes) Target: < 3 seconds with Canvas fallback | Part 12 (implemented incrementally) | Production-like benchmark with recorded dataset, environment, run count, percentile, and threshold assertion proving the stated behavior/target. |
| `NFR-P-004` | API response time (CRUD operations) Target: < 500ms at p95 | Part 12 (implemented incrementally) | Production-like benchmark with recorded dataset, environment, run count, percentile, and threshold assertion proving the stated behavior/target. |
| `NFR-P-005` | Agent task queue latency Target: < 5 seconds from trigger to execution start | Part 12 (implemented incrementally) | Production-like benchmark with recorded dataset, environment, run count, percentile, and threshold assertion proving the stated behavior/target. |
| `NFR-P-006` | Real-time update latency (Supabase Realtime) Target: < 2 seconds from DB change to UI update | Part 12 (implemented incrementally) | Production-like benchmark with recorded dataset, environment, run count, percentile, and threshold assertion proving the stated behavior/target. |
| `NFR-P-007` | Search results return time (knowledge base) Target: < 1 second for full-text, < 2 seconds for semantic | Part 12 (implemented incrementally) | Production-like benchmark with recorded dataset, environment, run count, percentile, and threshold assertion proving the stated behavior/target. |
| `NFR-P-008` | Dashboard widget data load Target: < 3 seconds for full dashboard | Part 12 (implemented incrementally) | Production-like benchmark with recorded dataset, environment, run count, percentile, and threshold assertion proving the stated behavior/target. |
| `NFR-P-009` | File upload time (10MB) Target: < 10 seconds | Part 12 (implemented incrementally) | Production-like benchmark with recorded dataset, environment, run count, percentile, and threshold assertion proving the stated behavior/target. |
| `NFR-P-010` | Concurrent users supported Target: 1 (single-operator design, but API must handle agent traffic) | Part 12 (implemented incrementally) | Production-like benchmark with recorded dataset, environment, run count, percentile, and threshold assertion proving the stated behavior/target. |

### 3.14 Scalability - 6 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `NFR-S-001` | System shall support up to 50 active clients without performance degradation | Part 12 (platform in Parts 2, 4, 5, 11) | Production-like capacity/load test at the stated maximum plus headroom and failure-behavior evidence proving the stated behavior/target. |
| `NFR-S-002` | System shall support up to 30 concurrent AI agent runs | Part 12 (platform in Parts 2, 4, 5, 11) | Production-like capacity/load test at the stated maximum plus headroom and failure-behavior evidence proving the stated behavior/target. |
| `NFR-S-003` | Knowledge base shall support up to 10,000 entries with semantic search | Part 12 (platform in Parts 2, 4, 5, 11) | Production-like capacity/load test at the stated maximum plus headroom and failure-behavior evidence proving the stated behavior/target. |
| `NFR-S-004` | Knowledge graph shall handle up to 500 nodes before requiring pagination or filtering | Part 12 (platform in Parts 2, 4, 5, 11) | Production-like capacity/load test at the stated maximum plus headroom and failure-behavior evidence proving the stated behavior/target. |
| `NFR-S-005` | Database storage target: 50GB PostgreSQL, 100GB file storage (first year) | Part 12 (platform in Parts 2, 4, 5, 11) | Production-like capacity/load test at the stated maximum plus headroom and failure-behavior evidence proving the stated behavior/target. |
| `NFR-S-006` | Agent task queue shall handle up to 500 pending tasks without backlog | Part 12 (platform in Parts 2, 4, 5, 11) | Production-like capacity/load test at the stated maximum plus headroom and failure-behavior evidence proving the stated behavior/target. |

### 3.15 Reliability - 6 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `NFR-R-001` | System uptime target: 99.5% (excluding external API outages) | Part 12 (reliability built in Parts 1-11) | Fault-injection/recovery test plus observability evidence and no-loss/no-duplicate assertions proving the stated behavior/target. |
| `NFR-R-002` | Automatic retry for all external API calls (3 attempts, exponential backoff) | Part 12 (reliability built in Parts 1-11) | Fault-injection/recovery test plus observability evidence and no-loss/no-duplicate assertions proving the stated behavior/target. |
| `NFR-R-003` | Database backups: automated daily backups with 30-day retention | Part 12 (reliability built in Parts 1-11) | Fault-injection/recovery test plus observability evidence and no-loss/no-duplicate assertions proving the stated behavior/target. |
| `NFR-R-004` | Failed agent runs shall not cause data loss - partial results are saved | Part 12 (reliability built in Parts 1-11) | Fault-injection/recovery test plus observability evidence and no-loss/no-duplicate assertions proving the stated behavior/target. |
| `NFR-R-005` | System shall gracefully degrade: if LLM API is down, non-AI features remain fully functional | Part 12 (reliability built in Parts 1-11) | Fault-injection/recovery test plus observability evidence and no-loss/no-duplicate assertions proving the stated behavior/target. |
| `NFR-R-006` | Error boundaries in React prevent full-page crashes - individual widgets fail independently | Part 12 (reliability built in Parts 1-11) | Fault-injection/recovery test plus observability evidence and no-loss/no-duplicate assertions proving the stated behavior/target. |

### 3.16 Usability - 6 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `NFR-U-001` | System shall be usable by a single operator without training beyond initial exploration | Part 12 (foundation in Part 1; UI in each part) | Task-based owner E2E, responsive/keyboard/accessibility audit, and destructive-action recovery evidence proving the stated behavior/target. |
| `NFR-U-002` | All primary actions accessible within 2 clicks from the dashboard | Part 12 (foundation in Part 1; UI in each part) | Task-based owner E2E, responsive/keyboard/accessibility audit, and destructive-action recovery evidence proving the stated behavior/target. |
| `NFR-U-003` | Keyboard shortcuts for common actions (Cmd+K search, N new client, etc.) | Part 12 (foundation in Part 1; UI in each part) | Task-based owner E2E, responsive/keyboard/accessibility audit, and destructive-action recovery evidence proving the stated behavior/target. |
| `NFR-U-004` | Consistent dark mode UI across all modules | Part 12 (foundation in Part 1; UI in each part) | Task-based owner E2E, responsive/keyboard/accessibility audit, and destructive-action recovery evidence proving the stated behavior/target. |
| `NFR-U-005` | Mobile-responsive: critical views (dashboard, notifications, client list) accessible on tablet and phone | Part 12 (foundation in Part 1; UI in each part) | Task-based owner E2E, responsive/keyboard/accessibility audit, and destructive-action recovery evidence proving the stated behavior/target. |
| `NFR-U-006` | Undo support for all destructive actions (delete, archive) with 7-day recovery window | Part 12 (foundation in Part 1; UI in each part) | Task-based owner E2E, responsive/keyboard/accessibility audit, and destructive-action recovery evidence proving the stated behavior/target. |

### 3.17 Portability - 4 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `NFR-PO-001` | All data stored in PostgreSQL - fully portable to any PostgreSQL host | Part 12 (foundation in Part 2) | PostgreSQL restore/deploy portability and complete JSON/CSV/config round-trip test proving the stated behavior/target. |
| `NFR-PO-002` | System shall provide full data export (JSON + CSV) at any time | Part 12 (foundation in Part 2) | PostgreSQL restore/deploy portability and complete JSON/CSV/config round-trip test proving the stated behavior/target. |
| `NFR-PO-003` | No proprietary data formats - all configurations stored as standard JSON/YAML | Part 12 (foundation in Part 2) | PostgreSQL restore/deploy portability and complete JSON/CSV/config round-trip test proving the stated behavior/target. |
| `NFR-PO-004` | System shall be deployable on any Node.js hosting platform (Vercel, Railway, Render, AWS) | Part 12 (foundation in Part 2) | PostgreSQL restore/deploy portability and complete JSON/CSV/config round-trip test proving the stated behavior/target. |

### 3.18 Maintainability - 6 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `NFR-M-001` | Code organized by domain modules with clear separation of concerns | Part 12 (foundation in Parts 1-2) | Repository/CI/OpenAPI/migration/coverage inspection enforced by automated quality gates proving the stated behavior/target. |
| `NFR-M-002` | All API endpoints documented with OpenAPI/Swagger specification | Part 12 (foundation in Parts 1-2) | Repository/CI/OpenAPI/migration/coverage inspection enforced by automated quality gates proving the stated behavior/target. |
| `NFR-M-003` | Database schema managed via Prisma migrations with version history | Part 12 (foundation in Parts 1-2) | Repository/CI/OpenAPI/migration/coverage inspection enforced by automated quality gates proving the stated behavior/target. |
| `NFR-M-004` | Test coverage target: 70% for core business logic, 50% for UI components | Part 12 (foundation in Parts 1-2) | Repository/CI/OpenAPI/migration/coverage inspection enforced by automated quality gates proving the stated behavior/target. |
| `NFR-M-005` | CI/CD pipeline runs lint, type-check, and test suite on every commit | Part 12 (foundation in Parts 1-2) | Repository/CI/OpenAPI/migration/coverage inspection enforced by automated quality gates proving the stated behavior/target. |
| `NFR-M-006` | Environment variables managed via .env files with documented required variables | Part 12 (foundation in Parts 1-2) | Repository/CI/OpenAPI/migration/coverage inspection enforced by automated quality gates proving the stated behavior/target. |

### 3.19 Authentication Security - 6 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `SEC-A-001` | System shall use Supabase Auth for user authentication | Part 12 (implemented in Part 1) | Authentication/session/rate-limit integration and E2E security tests proving the stated behavior/target. |
| `SEC-A-002` | Primary auth method: Email + password with minimum 8 characters, complexity requirements | Part 12 (implemented in Part 1) | Authentication/session/rate-limit integration and E2E security tests proving the stated behavior/target. |
| `SEC-A-003` | OAuth support: Google, GitHub login options | Part 12 (implemented in Part 1) | Authentication/session/rate-limit integration and E2E security tests proving the stated behavior/target. |
| `SEC-A-004` | Session management: JWT tokens with 1-hour expiry, refresh tokens with 30-day expiry | Part 12 (implemented in Part 1) | Authentication/session/rate-limit integration and E2E security tests proving the stated behavior/target. |
| `SEC-A-005` | System shall enforce session invalidation on password change | Part 12 (implemented in Part 1) | Authentication/session/rate-limit integration and E2E security tests proving the stated behavior/target. |
| `SEC-A-006` | Rate limit login attempts: 5 attempts per 15 minutes per IP | Part 12 (implemented in Part 1) | Authentication/session/rate-limit integration and E2E security tests proving the stated behavior/target. |

### 3.20 Authorization Security - 5 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `SEC-Z-001` | All API endpoints require valid JWT Bearer token (except public health check) | Part 12 (foundations in Parts 1-2) | Owner authorization, secret-vault, webhook signature, and public-data exposure security tests proving the stated behavior/target. |
| `SEC-Z-002` | Single-user model: only the system owner has access. No role-based access control needed initially. | Part 12 (foundations in Parts 1-2) | Owner authorization, secret-vault, webhook signature, and public-data exposure security tests proving the stated behavior/target. |
| `SEC-Z-003` | API keys for external services stored encrypted at rest (AES-256 via Supabase Vault) | Part 12 (foundations in Parts 1-2) | Owner authorization, secret-vault, webhook signature, and public-data exposure security tests proving the stated behavior/target. |
| `SEC-Z-004` | Webhook endpoints validated via HMAC signature verification | Part 12 (foundations in Parts 1-2) | Owner authorization, secret-vault, webhook signature, and public-data exposure security tests proving the stated behavior/target. |
| `SEC-Z-005` | Client data never exposed in public or shared endpoints | Part 12 (foundations in Parts 1-2) | Owner authorization, secret-vault, webhook signature, and public-data exposure security tests proving the stated behavior/target. |

### 3.21 Encryption and Data Security - 5 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `SEC-E-001` | All data encrypted in transit via TLS 1.3 (HTTPS enforced) | Part 12 (foundations in Parts 1-2) | TLS/storage/application-encryption/upload scan verification and secret scanning proving the stated behavior/target. |
| `SEC-E-002` | Database encrypted at rest via Supabase managed encryption (AES-256) | Part 12 (foundations in Parts 1-2) | TLS/storage/application-encryption/upload scan verification and secret scanning proving the stated behavior/target. |
| `SEC-E-003` | API keys and secrets stored in environment variables, never in source code or database | Part 12 (foundations in Parts 1-2) | TLS/storage/application-encryption/upload scan verification and secret scanning proving the stated behavior/target. |
| `SEC-E-004` | Sensitive fields (client financial data) encrypted with application-level encryption key | Part 12 (foundations in Parts 1-2) | TLS/storage/application-encryption/upload scan verification and secret scanning proving the stated behavior/target. |
| `SEC-E-005` | File uploads scanned for malware before storage | Part 12 (foundations in Parts 1-2) | TLS/storage/application-encryption/upload scan verification and secret scanning proving the stated behavior/target. |

### 3.22 API Security - 7 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `SEC-API-001` | Rate limiting: 100 requests/minute per authenticated session | Part 12 (foundations in Parts 1-2) | API negative security suite: rate/body/validation/injection/XSS/CSRF/CORS proving the stated behavior/target. |
| `SEC-API-002` | Request body size limit: 10MB for standard requests, 100MB for file uploads | Part 12 (foundations in Parts 1-2) | API negative security suite: rate/body/validation/injection/XSS/CSRF/CORS proving the stated behavior/target. |
| `SEC-API-003` | Input validation on all endpoints via Zod schemas | Part 12 (foundations in Parts 1-2) | API negative security suite: rate/body/validation/injection/XSS/CSRF/CORS proving the stated behavior/target. |
| `SEC-API-004` | SQL injection prevention: all queries via Prisma ORM (parameterized) | Part 12 (foundations in Parts 1-2) | API negative security suite: rate/body/validation/injection/XSS/CSRF/CORS proving the stated behavior/target. |
| `SEC-API-005` | XSS prevention: all user input sanitized, Content-Security-Policy headers set | Part 12 (foundations in Parts 1-2) | API negative security suite: rate/body/validation/injection/XSS/CSRF/CORS proving the stated behavior/target. |
| `SEC-API-006` | CSRF protection: SameSite cookies + CSRF token for form submissions | Part 12 (foundations in Parts 1-2) | API negative security suite: rate/body/validation/injection/XSS/CSRF/CORS proving the stated behavior/target. |
| `SEC-API-007` | CORS: restricted to verified frontend domain(s) only | Part 12 (foundations in Parts 1-2) | API negative security suite: rate/body/validation/injection/XSS/CSRF/CORS proving the stated behavior/target. |

### 3.23 Infrastructure Security - 6 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `SEC-I-001` | All environment variables managed via hosting platform secrets (Vercel env vars) | Part 12 (foundations in Parts 1-2) | Deployment configuration, vulnerability scan, backup/PITR, header, SSL, and DDoS evidence proving the stated behavior/target. |
| `SEC-I-002` | Database connection strings use SSL mode required | Part 12 (foundations in Parts 1-2) | Deployment configuration, vulnerability scan, backup/PITR, header, SSL, and DDoS evidence proving the stated behavior/target. |
| `SEC-I-003` | Automated dependency vulnerability scanning (Dependabot / Snyk) | Part 12 (foundations in Parts 1-2) | Deployment configuration, vulnerability scan, backup/PITR, header, SSL, and DDoS evidence proving the stated behavior/target. |
| `SEC-I-004` | Regular automated backups with point-in-time recovery enabled | Part 12 (foundations in Parts 1-2) | Deployment configuration, vulnerability scan, backup/PITR, header, SSL, and DDoS evidence proving the stated behavior/target. |
| `SEC-I-005` | Security headers: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy | Part 12 (foundations in Parts 1-2) | Deployment configuration, vulnerability scan, backup/PITR, header, SSL, and DDoS evidence proving the stated behavior/target. |
| `SEC-I-006` | DDoS protection via Cloudflare (if used for domain management) | Part 12 (foundations in Parts 1-2) | Deployment configuration, vulnerability scan, backup/PITR, header, SSL, and DDoS evidence proving the stated behavior/target. |

### 3.24 Compliance Considerations - 4 requirements

| Requirement | SRS requirement / target | Completion part | Mandatory verification evidence |
|---|---|---|---|
| `SEC-C-001` | Client data deletion: system supports full data export and deletion upon request | Part 12 (foundations in Part 2) | Export/deletion/audit/provider-processing evidence and future-cookie-consent scope check proving the stated behavior/target. |
| `SEC-C-002` | Data processing: all AI API calls should use providers with data processing agreements (OpenAI, Anthropic both offer) | Part 12 (foundations in Part 2) | Export/deletion/audit/provider-processing evidence and future-cookie-consent scope check proving the stated behavior/target. |
| `SEC-C-003` | Audit log: system maintains an audit trail of all data mutations (who changed what, when) | Part 12 (foundations in Part 2) | Export/deletion/audit/provider-processing evidence and future-cookie-consent scope check proving the stated behavior/target. |
| `SEC-C-004` | Cookie consent: not applicable for single-user system, but needed if client portals are added | Part 12 (foundations in Part 2) | Export/deletion/audit/provider-processing evidence and future-cookie-consent scope check proving the stated behavior/target. |

## 4. Unnumbered architecture and technology obligations

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


## 5. Knowledge graph specification coverage

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


## 6. Core data model field and relationship coverage

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


## 7. API contract and endpoint coverage

| Resource | Required endpoint set | Part | Verification |
|---|---|---:|---|
| Clients | GET,POST /api/v1/clients; GET,PATCH,DELETE /api/v1/clients/:id; GET client projects/invoices/communications; POST communications | 3 | OpenAPI path diff + authenticated contract tests for every operation. |
| Agents | GET,POST /api/v1/agents; GET,PATCH,DELETE /api/v1/agents/:id; POST run/pause/resume; GET runs/memory; PATCH memory | 5 | OpenAPI path diff + authenticated contract tests for every operation. |
| Graph | GET /api/v1/graph, nodes, edges, node detail, search; POST edges; DELETE edge | 4 | OpenAPI path diff + authenticated contract tests for every operation. |
| Finance | GET invoices/list/detail; POST invoice/create/send; GET dashboard/P&L/client-profitability; POST/GET expenses | 10 | OpenAPI path diff + authenticated contract tests for every operation. |
| CRM | GET/POST pipeline leads; PATCH lead; POST proposal; GET proposal; GET stats | 9 | OpenAPI path diff + authenticated contract tests for every operation. |
| Knowledge | GET list/detail/search/related; POST; PATCH; DELETE | 11 | OpenAPI path diff + authenticated contract tests for every operation. |
| Notifications | GET list/unread-count; PATCH read; POST read-all | 11 | OpenAPI path diff + authenticated contract tests for every operation. |

Every endpoint additionally inherits SRS Section 8.1: REST/JSON, Supabase JWT bearer token, normalized errors, cursor pagination, `/api/v1`, 100 requests/minute, and response envelope. Part 12 fails if OpenAPI and shipped routes differ.


## 8. Realtime event coverage

| Channel | Event(s) and payload intent | Part | Verification |
|---|---|---:|---|
| `graph:updates` | `node_created`, `node_updated`, `node_deleted`, `edge_created`, `edge_deleted` | 4 plus producers 3-11 | Typed event/animation/reconnect tests. |
| `agent:status` | `status_changed`, `run_completed`, `run_failed` | 5 | Worker-to-graph/notification realtime E2E. |
| `finance:updates` | `payment_received` | 10 | Stripe webhook-to-graph glow E2E. |
| `notifications:new` | `notification` | 11 | Trigger-to-badge/toast realtime E2E. |

All realtime views refetch authoritative state after reconnect; realtime messages are not the sole durable record.


## 9. Inbound webhook coverage

| Path | Source / events | Part | Security and acceptance evidence |
|---|---|---:|---|
| `/webhooks/stripe` | Invoice paid, payment failed, subscription updated | 10/12 | Raw-body signature, replay/timestamp, event-ID dedupe, out-of-order reconciliation. |
| `/webhooks/n8n` | Workflow completed/failed | 7/12 | Signature/HMAC, schema, dedupe, queued processing, status E2E. |
| `/webhooks/email` | Delivered, opened, bounced, replied | 9/12 | Provider signature, limitations, dedupe, communication/pipeline transitions. |
| `/webhooks/leads` | Website lead form | 9/12 | Auth/signature or trusted-origin policy, validation, spam/rate controls, dedupe. |
| `/webhooks/social` | Publish and engagement metrics | 8/12 | Signature, dedupe, provider ID, attribution/time, polling reconciliation. |


## 10. External integration coverage

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


## 11. UI, responsive, and accessibility coverage

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


## 12. Notification default matrix coverage

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


## 13. Environment and deployment coverage

| Obligation | Required values/providers | Part / evidence |
|---|---|---|
| Required environment names | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `N8N_API_URL`, `N8N_API_KEY`, `REDIS_URL`; optional `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `SENTRY_DSN` | 1/2/12; startup schema and production secret inventory with no values in Git. |
| Hosting | Vercel frontend/API; Supabase DB/Auth/Storage/Realtime; Upstash Redis; n8n Railway/Render; Cloudflare domain/CDN/DDoS | 12 | Deployment inventory, smoke tests, TLS/security checks. |
| Estimated operating envelope | SRS estimate $100-305/month (actuals may differ) | 12 | Cost dashboard/budget documentation; no claim that estimate is guaranteed. |
| CI/CD | Push lint/typecheck/tests/build; PR preview; main production + reviewed Prisma migration; weekly security scan | 1/2/12 | GitHub Actions execution evidence. |
| Monitoring | Sentry, Vercel Analytics, UptimeRobot, API spend, Supabase health, agent health, Axiom/Logtail | 5/12 | Active dashboards/alerts and runbooks. |
| Backup/recovery | Daily, 30-day/PITR, storage versioning, deploy from GitHub, RPO 24h, RTO 1h | 12 | Timed restore drill and data verification. |


## 14. Original milestone and phase-exit coverage

| SRS phase | Roadmap parts | Preserved exit demonstration |
|---|---|---|
| Phase 1 Foundation, Weeks 1-4 | 1-4 | Login, create clients, graph nodes, details, entity filtering. |
| Phase 2 AI Agents Core, Weeks 5-8 | 5 plus Chatbot v1 in 6 | Configure/run agent in background, output/log/cost/memory and live graph state. |
| Phase 3 Services & Finance, Weeks 9-12 | 6, 7, 10 plus service strategies | Four+ working agents, Stripe invoice, revenue/expenses/margins. |
| Phase 4 CRM, Content & Knowledge, Weeks 13-16 | 8, 9, 11 | Pipeline, content, semantic KB, notifications, full LENS. |
| Phase 5 Optimization & Scale, Weeks 17-20 | 12 | Production-ready for 10-15 clients; optimized costs; complete repeatable documentation. |
| Phase 6 Future Enhancements | Separate post-MVP specifications | Extension seams only; no premature/insecure exposure. |


## 15. Post-MVP feature preservation

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


## 16. Success metric instrumentation

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


## 17. Final traceability acceptance checklist

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
