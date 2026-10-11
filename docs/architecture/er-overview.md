# Entity Relationship Overview

The full field-level dictionary is generated from Prisma. This overview emphasizes domain ownership and high-value relationships.

```mermaid
erDiagram
  Client ||--o{ Contact : has
  Client ||--o{ Communication : receives
  Client ||--o{ Project : owns
  Client ||--o{ Invoice : billed
  Client ||--o{ SourcedLead : receives
  Client ||--o{ Chatbot : uses
  Client ||--o{ Workflow : uses
  Client }o--o{ Agent : assigned

  Project ||--o{ Task : contains
  Project ||--o{ Deliverable : requires
  Project ||--o{ TimeEntry : tracks
  Project }o--o{ Agent : uses

  Agent ||--o{ AgentConfigVersion : versions
  Agent ||--o{ AgentRun : executes
  Agent ||--o{ AgentMemory : remembers
  AgentRun ||--o{ Approval : pauses_for
  AgentRun ||--o{ CostLedgerEntry : costs

  KnowledgeEntry ||--o{ KnowledgeVersion : versions
  KnowledgeEntry ||--o{ KnowledgeLink : source
  Sop ||--o{ SopStep : orders
  Sop ||--o{ SopExecution : records

  Invoice ||--o{ InvoiceLineItem : contains
  Invoice ||--o{ Payment : reconciles
  Client ||--o{ Expense : attributes

  IntegrationConnection ||--o{ CredentialReference : references
  IntegrationConnection ||--o{ WebhookReceipt : receives
  AuditEvent }o--|| Client : may_reference
  OutboxEvent }o--|| Client : may_project
  GraphNode ||--o{ GraphEdge : source
  GraphNode ||--o{ GraphEdge : target
  Notification }o--|| Client : may_describe
  ExportJob ||--o{ FileMetadata : produces
  DeletionRequest }o--|| Client : may_delete
```

Polymorphic audit, outbox, notification, export, and deletion references use entity type plus entity ID where an ordinary foreign key cannot represent every domain table. Domain services validate those references. Graph edges use composite foreign keys into `GraphNode`, so endpoints and declared node types cannot disagree. Ordinary ownership relationships use actual foreign keys.
