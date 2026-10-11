import { createHash } from "node:crypto";
import { createDatabaseClient, EMBEDDING_DIMENSIONS, serializeEmbedding } from "../src/index";
import {
  AgentStatus,
  AgentType,
  ArtifactStatus,
  ClientStatus,
  CrmLeadStage,
  DeletionStatus,
  ExportFormat,
  GraphEdgeType,
  GraphNodeType,
  IntegrationProvider,
  IntegrationStatus,
  InvoiceStatus,
  InvoiceType,
  KnowledgeCategory,
  NotificationPriority,
  NotificationType,
  OutboxStatus,
  ProjectStatus,
  ProjectType,
  TaskStatus,
  WebhookStatus,
} from "../src/generated/client/enums";

const FIXTURE = {
  client: "10000000-0000-4000-8000-000000000001",
  contact: "10000000-0000-4000-8000-000000000002",
  project: "10000000-0000-4000-8000-000000000003",
  task: "10000000-0000-4000-8000-000000000004",
  agent: "10000000-0000-4000-8000-000000000005",
  agentConfig: "10000000-0000-4000-8000-000000000006",
  knowledge: "10000000-0000-4000-8000-000000000007",
  sop: "10000000-0000-4000-8000-000000000008",
  invoice: "10000000-0000-4000-8000-000000000009",
  lead: "10000000-0000-4000-8000-000000000010",
  notification: "10000000-0000-4000-8000-000000000011",
  connection: "10000000-0000-4000-8000-000000000012",
  webhook: "10000000-0000-4000-8000-000000000013",
  audit: "10000000-0000-4000-8000-000000000014",
  outbox: "10000000-0000-4000-8000-000000000015",
  export: "10000000-0000-4000-8000-000000000016",
  deletion: "10000000-0000-4000-8000-000000000017",
} as const;

const GRAPH_IDS: Record<GraphNodeType, string> = {
  [GraphNodeType.CLIENT]: "20000000-0000-4000-8000-000000000001",
  [GraphNodeType.AGENT]: "20000000-0000-4000-8000-000000000002",
  [GraphNodeType.TOOL]: "20000000-0000-4000-8000-000000000003",
  [GraphNodeType.SOP]: "20000000-0000-4000-8000-000000000004",
  [GraphNodeType.HUMAN]: "20000000-0000-4000-8000-000000000005",
  [GraphNodeType.TASK]: "20000000-0000-4000-8000-000000000006",
  [GraphNodeType.DECISION]: "20000000-0000-4000-8000-000000000007",
  [GraphNodeType.KNOWLEDGE]: "20000000-0000-4000-8000-000000000008",
  [GraphNodeType.FINANCE]: "20000000-0000-4000-8000-000000000009",
  [GraphNodeType.HUB]: "20000000-0000-4000-8000-000000000010",
};

const prisma = createDatabaseClient({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

async function seedCoreRecords() {
  await prisma.client.upsert({
    where: { id: FIXTURE.client },
    update: {},
    create: {
      id: FIXTURE.client,
      name: "Synthetic Example Client",
      industry: "Demonstration",
      status: ClientStatus.ACTIVE,
      contactName: "Synthetic Contact",
      contactEmail: "contact@example.invalid",
      notes: "Synthetic fixture only. This is not real client or performance data.",
      mrr: "0.00",
      totalRevenue: "0.00",
    },
  });
  await prisma.contact.upsert({
    where: { id: FIXTURE.contact },
    update: {},
    create: { id: FIXTURE.contact, clientId: FIXTURE.client, name: "Synthetic Contact", email: "contact@example.invalid", isPrimary: true },
  });
  await prisma.project.upsert({
    where: { id: FIXTURE.project },
    update: {},
    create: { id: FIXTURE.project, clientId: FIXTURE.client, name: "Synthetic Foundation Project", type: ProjectType.CUSTOM, status: ProjectStatus.PLANNING, price: "0.00" },
  });
  await prisma.task.upsert({
    where: { id: FIXTURE.task },
    update: {},
    create: { id: FIXTURE.task, projectId: FIXTURE.project, title: "Review synthetic fixture", status: TaskStatus.TODO },
  });
  await prisma.agent.upsert({
    where: { id: FIXTURE.agent },
    update: {},
    create: {
      id: FIXTURE.agent,
      name: "Synthetic Analyst",
      description: "Non-operational seed agent used for development and tests.",
      type: AgentType.ANALYST,
      status: AgentStatus.IDLE,
      model: "fixture-model",
      systemPrompt: "Do not execute external effects. This is a synthetic fixture.",
      temperature: "0.20",
      totalCostUsd: "0.000000",
    },
  });
  await prisma.agentConfigVersion.upsert({
    where: { agentId_version: { agentId: FIXTURE.agent, version: 1 } },
    update: {},
    create: {
      id: FIXTURE.agentConfig,
      agentId: FIXTURE.agent,
      version: 1,
      model: "fixture-model",
      systemPrompt: "Do not execute external effects. This is a synthetic fixture.",
      temperature: "0.20",
      maxTokens: 1024,
      topP: "1.00",
      frequencyPenalty: "0.00",
      changeSummary: "Initial synthetic fixture",
    },
  });
  await prisma.agent.update({ where: { id: FIXTURE.agent }, data: { currentConfigVersionId: FIXTURE.agentConfig } });
  await prisma.knowledgeEntry.upsert({
    where: { id: FIXTURE.knowledge },
    update: {},
    create: {
      id: FIXTURE.knowledge,
      title: "Synthetic Operating Principle",
      category: KnowledgeCategory.SOP,
      content: "Validate inputs, require approval for external effects, and record durable audit evidence.",
      tags: ["synthetic", "foundation"],
      embeddingModel: "fixture-unit-vector",
    },
  });
  const fixtureEmbedding = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  fixtureEmbedding[0] = 1;
  const vector = serializeEmbedding(fixtureEmbedding);
  await prisma.$executeRawUnsafe(
    "UPDATE public.knowledge_entries SET embedding = $1::extensions.vector, embedding_model = $2 WHERE id = $3::uuid",
    vector,
    "fixture-unit-vector",
    FIXTURE.knowledge,
  );
  await prisma.sop.upsert({
    where: { id: FIXTURE.sop },
    update: {},
    create: {
      id: FIXTURE.sop,
      knowledgeEntryId: FIXTURE.knowledge,
      title: "Synthetic Review SOP",
      materials: ["Synthetic fixture"],
      expectedOutcome: "The fixture is reviewed without an external side effect.",
    },
  });
  await prisma.invoice.upsert({
    where: { id: FIXTURE.invoice },
    update: {},
    create: {
      id: FIXTURE.invoice,
      clientId: FIXTURE.client,
      type: InvoiceType.ONE_TIME,
      status: InvoiceStatus.DRAFT,
      amount: "0.00",
      lineItems: [],
      dueDate: new Date("2099-01-31T00:00:00.000Z"),
      notes: "Synthetic zero-value invoice; not business performance.",
    },
  });
  await prisma.crmLead.upsert({
    where: { id: FIXTURE.lead },
    update: {},
    create: { id: FIXTURE.lead, name: "Synthetic Pipeline Lead", company: "Example Invalid", stage: CrmLeadStage.NEW, notes: "Synthetic fixture only." },
  });
  await prisma.notification.upsert({
    where: { id: FIXTURE.notification },
    update: {},
    create: { id: FIXTURE.notification, type: NotificationType.REPORT_READY, priority: NotificationPriority.LOW, title: "Synthetic report fixture", body: "No report was generated.", dedupeKey: "seed:synthetic-report" },
  });
}

async function seedPlatformRecords() {
  await prisma.integrationConnection.upsert({
    where: { id: FIXTURE.connection },
    update: {},
    create: { id: FIXTURE.connection, provider: IntegrationProvider.OTHER, name: "Synthetic Unconfigured Provider", status: IntegrationStatus.NOT_CONFIGURED, safeMetadata: { synthetic: true } },
  });
  const rawPayload = { synthetic: true };
  const payloadHash = createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex");
  await prisma.webhookReceipt.upsert({
    where: { integrationConnectionId_providerEventId: { integrationConnectionId: FIXTURE.connection, providerEventId: "evt_synthetic_seed" } },
    update: {},
    create: {
      id: FIXTURE.webhook,
      integrationConnectionId: FIXTURE.connection,
      provider: IntegrationProvider.OTHER,
      providerEventId: "evt_synthetic_seed",
      eventType: "fixture.received",
      status: WebhookStatus.RECEIVED,
      signatureValid: true,
      payloadHash,
      rawPayload,
      retentionUntil: new Date("2099-02-01T00:00:00.000Z"),
      receivedAt: new Date("2099-01-01T00:00:00.000Z"),
    },
  });
  if (!(await prisma.auditEvent.findUnique({ where: { id: FIXTURE.audit } }))) {
    await prisma.auditEvent.create({
      data: { id: FIXTURE.audit, actorSubject: "synthetic-seed", actorType: "system", action: "seed", entityType: "client", entityId: FIXTURE.client, correlationId: "seed_part_2", changeSummary: { synthetic: true } },
    });
  }
  await prisma.outboxEvent.upsert({
    where: { idempotencyKey: "seed:client:fixture" },
    update: {},
    create: {
      id: FIXTURE.outbox,
      aggregateType: "client",
      aggregateId: FIXTURE.client,
      eventType: "fixture.seeded",
      payload: { synthetic: true },
      correlationId: "seed_part_2",
      occurredAt: new Date("2099-01-01T00:00:00.000Z"),
      status: OutboxStatus.PENDING,
      idempotencyKey: "seed:client:fixture",
    },
  });
  await prisma.exportJob.upsert({
    where: { id: FIXTURE.export },
    update: {},
    create: { id: FIXTURE.export, format: ExportFormat.JSON, status: ArtifactStatus.PENDING, requestedBy: "synthetic-seed", scope: { fixture: true } },
  });
  await prisma.deletionRequest.upsert({
    where: { id: FIXTURE.deletion },
    update: {},
    create: {
      id: FIXTURE.deletion,
      entityType: "fixture",
      entityId: FIXTURE.export,
      status: DeletionStatus.PENDING,
      requestedBy: "synthetic-seed",
      requestedAt: new Date("2099-01-01T00:00:00.000Z"),
      executeAfter: new Date("2099-01-08T00:00:00.000Z"),
      recoveryUntil: new Date("2099-01-08T00:00:00.000Z"),
      impactManifest: { synthetic: true, records: [], files: [] },
    },
  });
}

async function seedGraph() {
  const nodes: Array<{ type: GraphNodeType; entityId?: string; stableKey: string; label: string }> = [
    { type: GraphNodeType.CLIENT, entityId: FIXTURE.client, stableKey: "seed:client", label: "Synthetic Client" },
    { type: GraphNodeType.AGENT, entityId: FIXTURE.agent, stableKey: "seed:agent", label: "Synthetic Analyst" },
    { type: GraphNodeType.TOOL, stableKey: "seed:tool", label: "Synthetic Tool Contract" },
    { type: GraphNodeType.SOP, entityId: FIXTURE.sop, stableKey: "seed:sop", label: "Synthetic Review SOP" },
    { type: GraphNodeType.HUMAN, stableKey: "seed:human", label: "Synthetic Owner Role" },
    { type: GraphNodeType.TASK, entityId: FIXTURE.task, stableKey: "seed:task", label: "Synthetic Review Task" },
    { type: GraphNodeType.DECISION, stableKey: "seed:decision", label: "Synthetic Approval Decision" },
    { type: GraphNodeType.KNOWLEDGE, entityId: FIXTURE.knowledge, stableKey: "seed:knowledge", label: "Synthetic Operating Principle" },
    { type: GraphNodeType.FINANCE, entityId: FIXTURE.invoice, stableKey: "seed:finance", label: "Synthetic Zero-Value Invoice" },
    { type: GraphNodeType.HUB, stableKey: "seed:hub", label: "Synthetic Agency Hub" },
  ];

  for (const node of nodes) {
    await prisma.graphNode.upsert({
      where: { stableKey: node.stableKey },
      update: { label: node.label, metadata: { synthetic: true } },
      create: { id: GRAPH_IDS[node.type], ...node, metadata: { synthetic: true } },
    });
  }
  for (const node of nodes.filter((node) => node.type !== GraphNodeType.HUB)) {
    await prisma.graphEdge.upsert({
      where: {
        sourceId_sourceType_targetId_targetType_edgeType: {
          sourceId: GRAPH_IDS[GraphNodeType.HUB],
          sourceType: GraphNodeType.HUB,
          targetId: GRAPH_IDS[node.type],
          targetType: node.type,
          edgeType: GraphEdgeType.REFERENCE,
        },
      },
      update: {},
      create: {
        sourceId: GRAPH_IDS[GraphNodeType.HUB],
        sourceType: GraphNodeType.HUB,
        targetId: GRAPH_IDS[node.type],
        targetType: node.type,
        edgeType: GraphEdgeType.REFERENCE,
        label: "synthetic fixture projection",
        metadata: { synthetic: true },
      },
    });
  }
}

async function main() {
  await seedCoreRecords();
  await seedPlatformRecords();
  await seedGraph();
  console.info("Seeded deterministic synthetic Part 2 fixtures.");
}

main()
  .catch((error) => {
    console.error("Synthetic seed failed.", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
