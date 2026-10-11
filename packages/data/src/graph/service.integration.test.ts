import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "../client";
import { createClientOperationsService } from "../clients/service";
import { upsertTaskGraphProjection } from "../clients/internal";
import type { OwnerIdentity } from "../clients/types";
import type { Prisma, PrismaClient } from "../generated/client/client";
import {
  ClientStatus,
  GraphEdgeProvenance,
  GraphEdgeType,
  ProjectType,
  TaskPriority,
  TaskStatus,
} from "../generated/client/enums";
import { createGraphService } from "./service";

const databaseUrl = process.env.TEST_DATABASE_URL;
const rootDatabase = databaseUrl ? createDatabaseClient({ connectionString: databaseUrl, connectionLimit: 6 }) : null;
const integration = databaseUrl ? describe.sequential : describe.skip;
let database: PrismaClient | null = null;
let activeTransaction: Prisma.TransactionClient | null = null;
let releaseTransaction: (() => void) | null = null;
let transactionCompletion: Promise<void> | null = null;
const runId = randomUUID();
const marker = `P4Graph-${runId}`;
const correlationPrefix = `p4g:${runId}`;
const ids: Record<
  "owner" | "ownerSubject" | "clientHigh" | "clientLow" | "contact" | "contentProject" | "workflowProject" | "oldTask" | "middleTask" | "recentTask",
  string
> = {
  owner: randomUUID(),
  ownerSubject: randomUUID(),
  clientHigh: randomUUID(),
  clientLow: randomUUID(),
  contact: randomUUID(),
  contentProject: randomUUID(),
  workflowProject: randomUUID(),
  oldTask: randomUUID(),
  middleTask: randomUUID(),
  recentTask: randomUUID(),
};
const projectedEntityIds = [ids.clientHigh, ids.clientLow, ids.contact, ids.oldTask, ids.middleTask, ids.recentTask];
const createdEdgeIds = new Set<string>();
const taskTimes = {
  old: new Date("2097-01-01T00:00:00.000Z"),
  middle: new Date("2097-02-01T00:00:00.000Z"),
  recent: new Date("2097-03-01T00:00:00.000Z"),
};
const expectedHubStableKeys = [
  "hub:agents",
  "hub:automations",
  "hub:clients",
  "hub:command",
  "hub:content",
  "hub:finance",
  "hub:knowledge",
  "hub:pipeline-crm",
  "hub:tools",
];

let graphNodeIds: Record<"clientHigh" | "clientLow" | "contact" | "oldTask" | "middleTask" | "recentTask", string>;

function requestIdentity(label: string): OwnerIdentity {
  return {
    ownerAccountId: ids.owner,
    ownerSubject: ids.ownerSubject,
    correlationId: `${correlationPrefix}:${label}`,
  };
}

function asTransactionDatabase(transaction: Prisma.TransactionClient): PrismaClient {
  return new Proxy(transaction as object, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return async (operation: (nested: Prisma.TransactionClient) => Promise<unknown>) => operation(transaction);
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(transaction) : value;
    },
  }) as PrismaClient;
}

class RollbackSignal extends Error {}

async function inRollbackTransaction<T>(operation: (scoped: PrismaClient, transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (!database || !activeTransaction) throw new Error("The graph integration transaction is not active.");
  await activeTransaction.$executeRawUnsafe("SAVEPOINT p4_graph_repair");
  try {
    return await operation(database, activeTransaction);
  } finally {
    await activeTransaction.$executeRawUnsafe("ROLLBACK TO SAVEPOINT p4_graph_repair");
    await activeTransaction.$executeRawUnsafe("RELEASE SAVEPOINT p4_graph_repair");
  }
}

beforeAll(async () => {
  if (!rootDatabase) return;
  let ready!: () => void;
  const transactionReady = new Promise<void>((resolve) => { ready = resolve; });
  const holdTransaction = new Promise<void>((resolve) => { releaseTransaction = resolve; });
  transactionCompletion = rootDatabase.$transaction(async (transaction) => {
    activeTransaction = transaction;
    database = asTransactionDatabase(transaction);
    ready();
    await holdTransaction;
    throw new RollbackSignal();
  }, { isolationLevel: "RepeatableRead", maxWait: 30_000, timeout: 240_000 }).catch((error: unknown) => {
    if (!(error instanceof RollbackSignal)) throw error;
  });
  await transactionReady;
  const scoped = database!;
  const activeOwner = await scoped.ownerAccount.findFirst({ where: { active: true }, select: { id: true } });
  if (activeOwner) await scoped.ownerAccount.update({ where: { id: activeOwner.id }, data: { active: false } });
  await scoped.ownerAccount.create({
    data: {
      id: ids.owner,
      authSubject: ids.ownerSubject,
      email: `${runId}@example.invalid`,
      displayName: `${marker} Owner`,
    },
  });
  const operations = createClientOperationsService(scoped);
  await operations.clients.createClient(requestIdentity("client_high"), {
    id: ids.clientHigh,
    name: `${marker} Alpha Client`,
    industry: "Healthcare",
    status: ClientStatus.ACTIVE,
    mrr: 9_876,
    startDate: new Date("2096-01-02T00:00:00.000Z"),
  });
  await operations.clients.createClient(requestIdentity("client_low"), {
    id: ids.clientLow,
    name: `${marker} Beta Client`,
    industry: "Finance",
    status: ClientStatus.PAUSED,
    mrr: 4_321,
  });
  await operations.clients.createContact(requestIdentity("contact"), ids.clientHigh, {
    id: ids.contact,
    name: `${marker} Primary Contact`,
    role: "Operations Lead",
    email: `${runId}@contact.example.invalid`,
    isPrimary: true,
    lastContactAt: new Date("2096-12-20T12:00:00.000Z"),
  });
  await operations.work.createProject(requestIdentity("content_project"), ids.clientHigh, {
    id: ids.contentProject,
    name: `${marker} Content Project`,
    type: ProjectType.CONTENT,
  });
  await operations.work.createProject(requestIdentity("workflow_project"), ids.clientHigh, {
    id: ids.workflowProject,
    name: `${marker} Workflow Project`,
    type: ProjectType.WORKFLOW,
  });
  await operations.work.createTask(requestIdentity("old_task"), ids.contentProject, {
    id: ids.oldTask,
    title: `${marker} Old Content Task`,
    status: TaskStatus.TODO,
    priority: TaskPriority.LOW,
  });
  await operations.work.createTask(requestIdentity("middle_task"), ids.workflowProject, {
    id: ids.middleTask,
    title: `${marker} Middle Workflow Task`,
    status: TaskStatus.BLOCKED,
    priority: TaskPriority.HIGH,
  });
  await operations.work.createTask(requestIdentity("recent_task"), ids.contentProject, {
    id: ids.recentTask,
    title: `${marker} Recent Content Task`,
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.HIGH,
    dueAt: new Date("2097-04-05T00:00:00.000Z"),
  });

  for (const [taskId, updatedAt] of [
    [ids.oldTask, taskTimes.old],
    [ids.middleTask, taskTimes.middle],
    [ids.recentTask, taskTimes.recent],
  ] as const) {
    const task = await scoped.task.update({ where: { id: taskId }, data: { updatedAt } });
    await scoped.$transaction((transaction) => upsertTaskGraphProjection(transaction, task));
  }

  const nodes = await scoped.graphNode.findMany({
    where: { entityId: { in: projectedEntityIds } },
    select: { id: true, entityId: true },
  });
  const byEntityId = new Map(nodes.map((node) => [node.entityId, node.id]));
  graphNodeIds = {
    clientHigh: byEntityId.get(ids.clientHigh)!,
    clientLow: byEntityId.get(ids.clientLow)!,
    contact: byEntityId.get(ids.contact)!,
    oldTask: byEntityId.get(ids.oldTask)!,
    middleTask: byEntityId.get(ids.middleTask)!,
    recentTask: byEntityId.get(ids.recentTask)!,
  };
  expect(Object.values(graphNodeIds).every(Boolean)).toBe(true);
}, 120_000);

afterAll(async () => {
  if (!rootDatabase) return;
  try {
    releaseTransaction?.();
    await transactionCompletion;
  } finally {
    database = null;
    activeTransaction = null;
    await rootDatabase.$disconnect();
  }
}, 120_000);

integration("Part 4 Prisma graph service", () => {
  it("materializes nine hubs and enriched current-domain projections with separate graph, stable, and source identities", async () => {
    const service = createGraphService(database!);
    await expect(service.getCompleteGraph({ ...requestIdentity("wrong_subject"), ownerSubject: randomUUID() }))
      .rejects.toMatchObject({ code: "INVALID_IDENTITY" });

    const graph = await service.getCompleteGraph(requestIdentity("complete_graph"));
    const hubs = graph.nodes.filter((node) => node.type === "hub");
    expect(hubs).toHaveLength(9);
    expect(hubs.map((hub) => hub.stableKey).sort()).toEqual(expectedHubStableKeys);
    expect(hubs.every((hub) => hub.entityId === null && hub.id !== hub.stableKey && hub.metadata.hubKey)).toBe(true);

    const nodeByEntityId = new Map(graph.nodes.flatMap((node) => node.entityId ? [[node.entityId, node] as const] : []));
    for (const entityId of projectedEntityIds) {
      const node = nodeByEntityId.get(entityId);
      expect(node).toBeDefined();
      expect(new Set([node!.id, node!.stableKey, node!.entityId])).toHaveLength(3);
    }
    expect(nodeByEntityId.get(ids.clientHigh)).toMatchObject({
      id: graphNodeIds.clientHigh,
      stableKey: `client:${ids.clientHigh}`,
      type: "client",
      summary: "Healthcare · active",
      status: "active",
      action: "active_running",
      hubKeys: ["clients"],
      metadata: { name: `${marker} Alpha Client`, industry: "Healthcare", mrr: 9_876, projectsCount: 2 },
    });
    expect(nodeByEntityId.get(ids.contact)).toMatchObject({
      id: graphNodeIds.contact,
      stableKey: `contact:${ids.contact}`,
      type: "human_contact",
      summary: `Operations Lead at ${marker} Alpha Client`,
      hubKeys: ["clients", "pipeline_crm"],
      metadata: {
        role: "Operations Lead",
        company: `${marker} Alpha Client`,
        email: `${runId}@contact.example.invalid`,
        lastContact: "2096-12-20T12:00:00.000Z",
      },
    });
    expect(nodeByEntityId.get(ids.recentTask)).toMatchObject({
      id: graphNodeIds.recentTask,
      stableKey: `task:${ids.recentTask}`,
      type: "task",
      status: "in_progress",
      action: "active_running",
      hubKeys: ["clients", "content"],
      metadata: { title: `${marker} Recent Content Task`, status: "in_progress", dueDate: "2097-04-05", assignedAgentId: null },
    });
    expect(nodeByEntityId.get(ids.middleTask)).toMatchObject({ hubKeys: ["clients", "automations"], status: "blocked", action: "blocked" });

    const projectedOwnership = graph.edges.filter((edge) =>
      edge.origin === "projection"
      && edge.sourceNodeId === graphNodeIds.clientHigh
      && [graphNodeIds.contact, graphNodeIds.oldTask, graphNodeIds.middleTask, graphNodeIds.recentTask].includes(edge.targetNodeId),
    );
    expect(projectedOwnership.map((edge) => edge.projectionKey).sort()).toEqual([
      "clients.contacts",
      "clients.tasks",
      "clients.tasks",
      "clients.tasks",
    ]);
    expect(graph.edges).toContainEqual(expect.objectContaining({
      sourceNodeId: "02ed5eda-41d1-52f4-b272-d030255b4b6f",
      targetNodeId: graphNodeIds.clientHigh,
      origin: "projection",
      projectionKey: "hubs.membership",
    }));

    await expect(service.createEdge(requestIdentity("entity_id_rejected"), {
      sourceNodeId: ids.contact,
      targetNodeId: graphNodeIds.recentTask,
      type: "assignment",
      label: null,
    })).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });
  });

  it("supports directory ordering, recent tasks, filters, cursors, search, edge lists, and connected detail", async () => {
    const service = createGraphService(database!);
    const directory = await service.getDirectory(requestIdentity("directory"));
    const clients = directory.groups.find((group) => group.key === "clients")!;
    const fixtureClients = clients.items.filter((item) => new Set<string>([ids.clientHigh, ids.clientLow]).has(item.entityId ?? ""));
    expect(fixtureClients.map((item) => item.entityId)).toEqual([ids.clientHigh, ids.clientLow]);
    expect(fixtureClients.map((item) => item.sortValue)).toEqual([9_876, 4_321]);
    const recentTasks = directory.groups.find((group) => group.key === "recent_tasks")!;
    expect(recentTasks.items.filter((item) => new Set<string>([ids.oldTask, ids.middleTask, ids.recentTask]).has(item.entityId ?? "")).map((item) => item.entityId))
      .toEqual([ids.recentTask, ids.middleTask, ids.oldTask]);

    const narrowedDirectory = await service.getDirectory(requestIdentity("directory_search"), {
      query: `${marker} Recent`,
      groups: ["recent_tasks"],
    });
    expect(narrowedDirectory.groups).toHaveLength(1);
    expect(narrowedDirectory.groups[0]!.items.map((item) => item.entityId)).toContain(ids.recentTask);

    const activeClients = await service.listNodes(requestIdentity("node_filters"), {
      types: ["client"],
      hubs: ["clients"],
      actions: ["active_running"],
      status: "active",
      limit: 100,
    });
    expect(activeClients.nodes.map((node) => node.entityId)).toContain(ids.clientHigh);
    expect(activeClients.nodes.map((node) => node.entityId)).not.toContain(ids.clientLow);
    const contentTasks = await service.listNodes(requestIdentity("content_filters"), {
      types: ["task"],
      hubs: ["content"],
      actions: ["active_running"],
      status: "in_progress",
      limit: 100,
    });
    expect(contentTasks.nodes.map((node) => node.entityId)).toContain(ids.recentTask);
    expect(contentTasks.nodes.map((node) => node.entityId)).not.toContain(ids.middleTask);

    const firstPage = await service.listNodes(requestIdentity("node_cursor_one"), { types: ["task"], limit: 2 });
    expect(firstPage.meta.total).toBeGreaterThanOrEqual(3);
    expect(firstPage.meta.hasMore).toBe(true);
    expect(firstPage.meta.cursor).not.toBeNull();
    const secondPage = await service.listNodes(requestIdentity("node_cursor_two"), { types: ["task"], limit: 2, cursor: firstPage.meta.cursor! });
    expect(secondPage.nodes.map((node) => node.id)).not.toEqual(expect.arrayContaining(firstPage.nodes.map((node) => node.id)));
    await expect(service.listNodes(requestIdentity("node_cursor_mismatch"), { types: ["client"], limit: 2, cursor: firstPage.meta.cursor! }))
      .rejects.toMatchObject({ code: "INVALID_CURSOR" });

    const search = await service.search(requestIdentity("search"), { query: `${marker} Recent Content`, types: ["task"], limit: 10 });
    expect(search.results[0]).toMatchObject({ node: { id: graphNodeIds.recentTask, entityId: ids.recentTask }, matchedFields: expect.arrayContaining(["label"]) });
    expect(search.total).toBeGreaterThanOrEqual(1);

    const clientEdges = await service.listEdges(requestIdentity("edge_filter"), {
      types: ["ownership"],
      nodeId: graphNodeIds.clientHigh,
      limit: 100,
    });
    expect(clientEdges.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceNodeId: graphNodeIds.clientHigh, targetNodeId: graphNodeIds.contact, projectionKey: "clients.contacts" }),
      expect.objectContaining({ sourceNodeId: graphNodeIds.clientHigh, targetNodeId: graphNodeIds.oldTask, projectionKey: "clients.tasks" }),
      expect.objectContaining({ sourceNodeId: graphNodeIds.clientHigh, targetNodeId: graphNodeIds.middleTask, projectionKey: "clients.tasks" }),
      expect.objectContaining({ sourceNodeId: graphNodeIds.clientHigh, targetNodeId: graphNodeIds.recentTask, projectionKey: "clients.tasks" }),
    ]));
    const firstEdgePage = await service.listEdges(requestIdentity("edge_cursor_one"), { nodeId: graphNodeIds.clientHigh, limit: 2 });
    expect(firstEdgePage.meta.hasMore).toBe(true);
    expect(firstEdgePage.meta.cursor).not.toBeNull();
    const secondEdgePage = await service.listEdges(requestIdentity("edge_cursor_two"), { nodeId: graphNodeIds.clientHigh, limit: 2, cursor: firstEdgePage.meta.cursor! });
    expect(secondEdgePage.edges.map((edge) => edge.id)).not.toEqual(expect.arrayContaining(firstEdgePage.edges.map((edge) => edge.id)));
    await expect(service.listEdges(requestIdentity("edge_cursor_mismatch"), { nodeId: graphNodeIds.contact, limit: 2, cursor: firstEdgePage.meta.cursor! }))
      .rejects.toMatchObject({ code: "INVALID_CURSOR" });

    const detail = await service.getNodeDetail(requestIdentity("detail"), graphNodeIds.clientHigh);
    expect(detail.node).toMatchObject({ id: graphNodeIds.clientHigh, stableKey: `client:${ids.clientHigh}`, entityId: ids.clientHigh });
    expect(detail.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ direction: "outgoing", node: expect.objectContaining({ id: graphNodeIds.contact }), edge: expect.objectContaining({ projectionKey: "clients.contacts" }) }),
      expect.objectContaining({ direction: "outgoing", node: expect.objectContaining({ id: graphNodeIds.recentTask }), edge: expect.objectContaining({ projectionKey: "clients.tasks" }) }),
      expect.objectContaining({ direction: "incoming", node: expect.objectContaining({ stableKey: "hub:clients" }), edge: expect.objectContaining({ projectionKey: "hubs.membership" }) }),
    ]));
  });

  it("creates, audits, publishes, soft-deletes, and restores owner edges while rejecting projected-edge deletion", async () => {
    const service = createGraphService(database!);
    const privateLabel = `${marker} private relationship label`;
    const created = await service.createEdge(requestIdentity("owner_edge_create"), {
      sourceNodeId: graphNodeIds.contact,
      targetNodeId: graphNodeIds.recentTask,
      type: "assignment",
      label: privateLabel,
    });
    createdEdgeIds.add(created.id);
    expect(created).toMatchObject({
      sourceNodeId: graphNodeIds.contact,
      targetNodeId: graphNodeIds.recentTask,
      type: "assignment",
      label: privateLabel,
      origin: "owner",
      projectionKey: null,
    });
    expect(await database!.graphEdge.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      provenance: GraphEdgeProvenance.OWNER_EXPLICIT,
      archivedAt: null,
      deletedAt: null,
    });
    const createAudit = await database!.auditEvent.findFirstOrThrow({ where: { correlationId: `${correlationPrefix}:owner_edge_create` } });
    expect(createAudit).toMatchObject({ actorSubject: ids.ownerSubject, action: "create", entityType: "graph_edge", entityId: created.id });
    const createOutbox = await database!.outboxEvent.findFirstOrThrow({ where: { correlationId: `${correlationPrefix}:owner_edge_create` } });
    expect(createOutbox).toMatchObject({ aggregateType: "graph_edge", aggregateId: created.id, eventType: "graph.realtime.v1" });
    expect(createOutbox.payload).toMatchObject({
      schemaVersion: 1,
      ownerId: ids.owner,
      payload: { realtimeEvent: { event: "edge_created", payload: { edge: { id: created.id, label: null } } } },
    });
    expect(JSON.stringify(createOutbox.payload)).not.toContain(privateLabel);

    const projected = await database!.graphEdge.findFirstOrThrow({
      where: {
        sourceId: graphNodeIds.clientHigh,
        targetId: graphNodeIds.contact,
        edgeType: GraphEdgeType.OWNERSHIP,
        provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
      },
    });
    await expect(service.deleteEdge(requestIdentity("projected_delete_rejected"), { id: projected.id }))
      .rejects.toMatchObject({ code: "PROJECTED_EDGE_IMMUTABLE" });
    expect(await database!.graphEdge.findUniqueOrThrow({ where: { id: projected.id } })).toMatchObject({ archivedAt: null, deletedAt: null });
    expect(await database!.auditEvent.count({ where: { correlationId: `${correlationPrefix}:projected_delete_rejected` } })).toBe(0);

    const deleted = await service.deleteEdge(requestIdentity("owner_edge_delete"), { id: created.id });
    expect(deleted.id).toBe(created.id);
    expect(await database!.graphEdge.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      provenance: GraphEdgeProvenance.OWNER_EXPLICIT,
      archivedAt: expect.any(Date),
      deletedAt: expect.any(Date),
    });
    const afterDelete = await service.listEdges(requestIdentity("owner_edge_deleted_list"), { nodeId: graphNodeIds.contact, types: ["assignment"], limit: 100 });
    expect(afterDelete.edges.map((edge) => edge.id)).not.toContain(created.id);

    const restored = await service.createEdge(requestIdentity("owner_edge_restore"), {
      sourceNodeId: graphNodeIds.contact,
      targetNodeId: graphNodeIds.recentTask,
      type: "assignment",
      label: `${marker} restored relationship`,
    });
    expect(restored.id).toBe(created.id);
    expect(await database!.graphEdge.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      provenance: GraphEdgeProvenance.OWNER_EXPLICIT,
      label: `${marker} restored relationship`,
      archivedAt: null,
      deletedAt: null,
    });
    const edgeAudits = await database!.auditEvent.findMany({
      where: { entityType: "graph_edge", entityId: created.id },
      orderBy: { createdAt: "asc" },
    });
    expect(edgeAudits.map((audit) => audit.action)).toEqual(["create", "delete", "create"]);
    expect(await database!.outboxEvent.count({ where: { aggregateType: "graph_edge", aggregateId: created.id, eventType: "graph.realtime.v1" } })).toBe(3);

    const detail = await service.getNodeDetail(requestIdentity("owner_edge_detail"), graphNodeIds.contact);
    expect(detail.connections).toContainEqual(expect.objectContaining({
      direction: "outgoing",
      edge: expect.objectContaining({ id: created.id, origin: "owner" }),
      node: expect.objectContaining({ id: graphNodeIds.recentTask }),
    }));
  });

  it("detects provenance and missed-projection drift, rebuilds current-domain projections, and rolls all repair evidence back", async () => {
    const liveService = createGraphService(database!);
    const initial = await liveService.checkConsistency(requestIdentity("consistency_initial"));
    expect(initial.consistent).toBe(true);
    expect(initial.expected).toMatchObject({ hubs: 9 });

    const originalContactNodeId = graphNodeIds.contact;
    const ownerEdgeId = [...createdEdgeIds][0]!;
    await inRollbackTransaction(async (scoped, transaction) => {
      const service = createGraphService(scoped);
      const taskEdge = await transaction.graphEdge.findFirstOrThrow({
        where: {
          sourceId: graphNodeIds.clientHigh,
          targetId: graphNodeIds.recentTask,
          edgeType: GraphEdgeType.OWNERSHIP,
        },
      });
      await transaction.graphNode.delete({ where: { id: graphNodeIds.contact } });
      await transaction.graphEdge.update({ where: { id: taskEdge.id }, data: { provenance: GraphEdgeProvenance.OWNER_EXPLICIT } });

      const drift = await service.checkConsistency(requestIdentity("consistency_drift"));
      expect(drift.consistent).toBe(false);
      expect(drift.issues).toEqual(expect.arrayContaining([
        { stableKey: `contact:${ids.contact}`, kind: "missing" },
        { stableKey: `client:${ids.clientHigh}->contact:${ids.contact}`, kind: "missing" },
        { stableKey: `client:${ids.clientHigh}->task:${ids.recentTask}`, kind: "provenance" },
      ]));

      const rebuilt = await service.rebuildCurrentDomainProjections(requestIdentity("rebuild"));
      expect(rebuilt).toMatchObject({ hubs: 9, consistent: true });
      expect(rebuilt.clients).toBeGreaterThanOrEqual(2);
      expect(rebuilt.contacts).toBeGreaterThanOrEqual(1);
      expect(rebuilt.tasks).toBeGreaterThanOrEqual(3);
      const repaired = await service.checkConsistency(requestIdentity("consistency_repaired"));
      expect(repaired.consistent).toBe(true);
      expect(repaired.issues).toEqual([]);

      const repairedContact = await transaction.graphNode.findUniqueOrThrow({ where: { stableKey: `contact:${ids.contact}` } });
      expect(repairedContact).toMatchObject({ entityId: ids.contact, archivedAt: null, deletedAt: null });
      expect(repairedContact.id).not.toBe(originalContactNodeId);
      expect(await transaction.graphEdge.findFirstOrThrow({
        where: { sourceId: graphNodeIds.clientHigh, targetId: repairedContact.id, edgeType: GraphEdgeType.OWNERSHIP },
      })).toMatchObject({
        provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
        metadata: { projectionVersion: 1, projectionKey: "clients.contacts" },
        archivedAt: null,
        deletedAt: null,
      });
      expect(await transaction.graphEdge.findUniqueOrThrow({ where: { id: taskEdge.id } })).toMatchObject({
        provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
        metadata: { projectionVersion: 1, projectionKey: "clients.tasks" },
      });
      expect(await transaction.auditEvent.findFirstOrThrow({ where: { correlationId: `${correlationPrefix}:rebuild` } }))
        .toMatchObject({ action: "rebuild", entityType: "graph_projection", entityId: ids.owner });
      expect(await transaction.outboxEvent.findFirstOrThrow({ where: { correlationId: `${correlationPrefix}:rebuild` } }))
        .toMatchObject({ aggregateType: "graph_projection", aggregateId: ids.owner, eventType: "graph.projections_rebuilt" });
    });

    expect(await database!.graphNode.findUniqueOrThrow({ where: { stableKey: `contact:${ids.contact}` } })).toMatchObject({ id: originalContactNodeId });
    expect(await database!.graphEdge.findUniqueOrThrow({ where: { id: ownerEdgeId } })).toMatchObject({ archivedAt: null, deletedAt: null });
    expect(await database!.auditEvent.count({ where: { correlationId: `${correlationPrefix}:rebuild` } })).toBe(0);
    expect(await database!.outboxEvent.count({ where: { correlationId: `${correlationPrefix}:rebuild` } })).toBe(0);
  });
});
