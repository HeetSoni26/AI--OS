# Support Entity Rationale

The Part 2 relational model contains **65 models and 60 enums**. PostgreSQL is the durable source of truth; JSONB is reserved for provider payloads, flexible manifests, and versioned configuration-not query-critical status, money, ownership, or dates.

## Identity and client operations

| Entity | Why it exists |
|---|---|
| `OwnerAccount` | Binds the one permitted Supabase auth subject to the single-owner workspace and supports owner-only Storage policy checks. A partial unique index permits only one active owner. |
| `Client` | Durable customer profile, status, revenue, lifecycle, and ownership root. |
| `Contact` | Normalizes multiple client contacts; a partial unique index enforces at most one live primary contact. |
| `Communication` | Chronological email, note, call, Slack, social, and chatbot history with provider deduplication. |
| `Project` | Client delivery aggregate with typed project/status/date/price fields. |
| `Task` | Work breakdown and task hierarchy. |
| `Assignment` | Typed agent or human responsibility with an integrity check preventing ambiguous assignees. |
| `Deliverable` | Ordered required/optional project completion checklist. |
| `TimeEntry` | Manual and agent-run time attribution with nonnegative duration and time-order constraints. |

## Agent operations and approvals

| Entity | Why it exists |
|---|---|
| `Agent` | Current AI worker identity, model, operating state, budget, and aggregate statistics. |
| `AgentConfigVersion` | Immutable-style configuration history and reproducibility for each run. |
| `AgentRun` | Input/output, status, trigger, token, cost, duration, retries, and lineage evidence. |
| `AgentMemory` | Key/value, summary, and 1,536-dimensional semantic memory linked to source runs and clients. |
| `Approval` | Human-in-the-loop authorization for high-impact agent and external-effect actions. |

## Chatbots and workflows

| Entity | Why it exists |
|---|---|
| `Chatbot` / `ChatbotVersion` | Current deployment identity plus reproducible chatbot configuration history. |
| `ChatbotSource` | Ingestion, malware/validation status, file/URL provenance, and source lifecycle. |
| `ChatbotQaPair` | Curated Q&A associated with a source and optional chatbot version. |
| `ChatbotConversation` / `ChatbotMessage` | Channel conversation state, takeover/escalation, ordered messages, and token/cost evidence. |
| `Workflow` / `WorkflowVersion` | Provider workflow identity separated from reviewed, immutable deployment blueprints. |
| `WorkflowExecution` | Idempotent execution status, timing, input/output, and provider execution IDs. |
| `WorkflowCredentialBinding` | Explicit safe link from workflows to connection metadata without embedding credentials. |

## Content, leads, and pipeline

| Entity | Why it exists |
|---|---|
| `ContentStrategy` / `BrandProfile` | Agency/client-scoped strategy and brand controls with scope/client consistency checks. |
| `ContentArtifact` / `ContentArtifactVersion` | Current content plus reproducible revisions, approvals, provenance, and generation cost. |
| `ContentCalendarEntry` | Timezone-aware scheduling tied to an exact artifact version. |
| `ContentPublishEvent` | Idempotent provider publication attempts and outcomes. |
| `ContentMetric` | Typed metric observations instead of burying queryable performance data in JSON. |
| `SourcedLead` | Agency/client-scoped prospect record, deduplication, fit, source, and outreach stage. |
| `LeadResearch` | Cited research output and originating agent run. |
| `OutreachSequence` / `OutreachEvent` | Approved sequence versions and auditable delivery/reply/meeting outcomes. |
| `CrmLead` / `CrmLeadStageHistory` | Sales pipeline state and append-oriented stage transitions. |
| `Proposal` / `ProposalVersion` | Proposal lifecycle separated from versioned scope, pricing, terms, and file evidence. |

## Finance and knowledge

| Entity | Why it exists |
|---|---|
| `Invoice` / `InvoiceLineItem` | Decimal invoice truth and normalized service lines while retaining a portable source snapshot. |
| `Payment` | Reconciliation and payment-provider evidence. |
| `Expense` | Manual/automatic expenses and private receipt linkage. |
| `CostLedgerEntry` | Unified AI, provider, labor, and operating cost attribution. |
| `KnowledgeEntry` / `KnowledgeVersion` | Current and historical knowledge with full-text and pgvector search. |
| `KnowledgeLink` | Typed links from knowledge into clients, agents, projects, SOPs, decisions, and knowledge. |
| `Sop` / `SopStep` / `SopExecution` | Version-aware procedures, ordered steps, and execution evidence. |

## Graph, notifications, integrations, and files

| Entity | Why it exists |
|---|---|
| `GraphNode` | Referential registry for every SRS graph node type, including virtual tool/human/decision/hub nodes. |
| `GraphEdge` | Validated typed relationships between registered nodes; composite FKs prevent dangling endpoints/type mismatches. |
| `Notification` / `NotificationPreference` / `NotificationDelivery` | In-app events, owner preferences, and per-channel delivery retries. |
| `CredentialReference` | Safe Supabase Vault/secret-manager reference and rotation metadata; never a raw key/token. |
| `IntegrationConnection` | Provider account state, scopes, safe metadata, and customer/agency ownership. |
| `WebhookReceipt` | Connection-scoped provider-event deduplication, signature result, payload hash, bounded raw-payload retention, retry/dead-letter state. |
| `ScheduledJob` | Durable schedule intent; Redis/BullMQ is dispatch infrastructure, not business truth. |
| `FileMetadata` | Private bucket/object identity, checksum, size, ownership, scan status, and lifecycle. |
| `ReportArtifact` | Generated report status, methodology, period, sources, and private file. |

## Audit, delivery, export, and deletion

| Entity | Why it exists |
|---|---|
| `AuditEvent` | Append-oriented owner/system mutation evidence with correlation and redacted change summaries. |
| `OutboxEvent` | Transactional external-effect intent, correlation, replay key, retry state, and dead-letter status. |
| `ExportJob` | Portable JSON/CSV/ZIP job state, manifest, checksum, count, and expiring artifact. |
| `DeletionRequest` | Auditable impact plan, seven-day not-before/recovery time, cancellation/recovery, and execution status. |

The field-level dictionary is generated at `docs/architecture/data-dictionary.md`. The Prisma schema and reviewed migration remain authoritative.
