import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient, findSimilarKnowledge, runAuditedOutboxMutation, serializeEmbedding, EMBEDDING_DIMENSIONS } from "./index";
import { GraphNodeType, IntegrationProvider, KnowledgeCategory, ProjectType } from "./generated/client/enums";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DIRECT_URL;
const database = databaseUrl ? createDatabaseClient({ connectionString: databaseUrl, connectionLimit: 3 }) : null;
const integration = databaseUrl ? describe : describe.skip;

afterAll(async () => database?.$disconnect());

integration("PostgreSQL 16 and pgvector integration", () => {
  it("has migrated schema, pgvector, custom indexes, and every graph node fixture", async () => {
    const extensions = await database!.$queryRaw<Array<{ extname: string }>>`SELECT extname FROM pg_extension WHERE extname IN ('vector', 'pgcrypto') ORDER BY extname`;
    expect(extensions.map((row) => row.extname)).toEqual(["pgcrypto", "vector"]);
    const indexes = await database!.$queryRaw<Array<{ indexname: string }>>`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
    const names = indexes.map((row) => row.indexname);
    expect(names).toContain("knowledge_entries_embedding_hnsw_idx");
    expect(names).toContain("knowledge_entries_search_idx");
    const nodes = await database!.graphNode.findMany({ where: { stableKey: { startsWith: "seed:" } } });
    expect(new Set(nodes.map((node) => node.type))).toEqual(new Set(Object.values(GraphNodeType)));
    expect(nodes).toHaveLength(10);
  });

  it("inserts and retrieves a 1,536-dimensional embedding by cosine distance", async () => {
    const id = randomUUID();
    const embedding = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => index === 0 ? 1 : 0);
    await database!.knowledgeEntry.create({ data: { id, title: "Vector integration fixture", category: KnowledgeCategory.RESEARCH, content: "A searchable semantic fixture.", embeddingModel: "integration-vector" } });
    await database!.$executeRawUnsafe("UPDATE public.knowledge_entries SET embedding = $1::extensions.vector WHERE id = $2::uuid", serializeEmbedding(embedding), id);
    const rows = await findSimilarKnowledge(database!, embedding, { limit: 5 });
    expect(rows.find((row) => row.id === id)?.distance).toBeCloseTo(0);
    await database!.knowledgeEntry.delete({ where: { id } });
  });

  it("uses the full-text index expression for knowledge search", async () => {
    const id = randomUUID();
    await database!.knowledgeEntry.create({ data: { id, title: "Chromatic automaton", category: KnowledgeCategory.RESEARCH, content: "A uniquely searchable synthetic phrase." } });
    const matches = await database!.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM public.knowledge_entries
      WHERE deleted_at IS NULL
        AND to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(content, ''))
          @@ plainto_tsquery('english'::regconfig, 'chromatic automaton')
    `;
    expect(matches).toContainEqual({ id });
    await database!.knowledgeEntry.delete({ where: { id } });
  });

  it("enforces one primary contact and nonnegative money", async () => {
    const clientId = randomUUID();
    await database!.client.create({ data: { id: clientId, name: "Constraint fixture" } });
    await database!.contact.create({ data: { clientId, name: "Primary A", isPrimary: true } });
    await expect(database!.contact.create({ data: { clientId, name: "Primary B", isPrimary: true } })).rejects.toBeTruthy();
    await expect(database!.client.create({ data: { name: "Invalid money", mrr: "-0.01" } })).rejects.toBeTruthy();
    await database!.client.delete({ where: { id: clientId } });
  });

  it("preserves money precision and referential constraints", async () => {
    const clientId = randomUUID();
    const invoiceId = randomUUID();
    await database!.client.create({ data: { id: clientId, name: "Decimal fixture" } });
    await database!.invoice.create({ data: { id: invoiceId, clientId, type: "ONE_TIME", amount: "123456.78", lineItems: [], dueDate: new Date("2099-01-01T00:00:00Z") } });
    expect((await database!.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).amount.toString()).toBe("123456.78");
    await expect(database!.project.create({ data: { clientId: randomUUID(), name: "Orphan", type: ProjectType.CUSTOM } })).rejects.toBeTruthy();
    await database!.invoice.delete({ where: { id: invoiceId } });
    await database!.client.delete({ where: { id: clientId } });
  });

  it("deduplicates webhooks within a connection but not across connections", async () => {
    const first = await database!.integrationConnection.create({ data: { provider: IntegrationProvider.OTHER, name: `First ${randomUUID()}` } });
    const second = await database!.integrationConnection.create({ data: { provider: IntegrationProvider.OTHER, name: `Second ${randomUUID()}` } });
    const providerEventId = `evt_${randomUUID()}`;
    const receipt = { provider: IntegrationProvider.OTHER, providerEventId, eventType: "integration.test", signatureValid: true, payloadHash: "a".repeat(64), retentionUntil: new Date("2099-01-01T00:00:00Z") };
    await database!.webhookReceipt.create({ data: { ...receipt, integrationConnectionId: first.id } });
    await expect(database!.webhookReceipt.create({ data: { ...receipt, integrationConnectionId: first.id } })).rejects.toBeTruthy();
    await expect(database!.webhookReceipt.create({ data: { ...receipt, integrationConnectionId: second.id } })).resolves.toBeTruthy();
    await database!.webhookReceipt.deleteMany({ where: { integrationConnectionId: { in: [first.id, second.id] } } });
    await database!.integrationConnection.deleteMany({ where: { id: { in: [first.id, second.id] } } });
  });

  it("rolls back the durable helper when its outbox insert fails", async () => {
    const clientId = randomUUID();
    await expect(runAuditedOutboxMutation(
      database!,
      {
        audit: { actorSubject: "integration-test", actorType: "system", action: "create", entityType: "client", entityId: clientId, correlationId: "integration_rollback", changeSummary: { name: { after: "Rollback fixture" } } },
        outbox: { aggregateType: "client", aggregateId: clientId, eventType: "client.created", payload: {}, correlationId: "integration_rollback", occurredAt: new Date(), idempotencyKey: "seed:client:fixture" },
      },
      (transaction) => transaction.client.create({ data: { id: clientId, name: "Rollback fixture" } }),
    )).rejects.toBeTruthy();
    expect(await database!.client.findUnique({ where: { id: clientId } })).toBeNull();
    expect(await database!.auditEvent.count({ where: { entityId: clientId } })).toBe(0);
  });

  it("proves deterministic seed reruns do not duplicate fixtures", async () => {
    expect(await database!.client.count({ where: { id: "10000000-0000-4000-8000-000000000001" } })).toBe(1);
    expect(await database!.graphEdge.count({ where: { label: "synthetic fixture projection" } })).toBe(9);
    expect(await database!.outboxEvent.count({ where: { idempotencyKey: "seed:client:fixture" } })).toBe(1);
  });
});
