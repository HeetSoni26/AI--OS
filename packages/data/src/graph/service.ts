import { createHash, randomUUID } from "node:crypto";
import {
  edgeDataSchema,
  graphDirectoryQuerySchema,
  graphDirectoryResponseSchema,
  graphEdgeCreateInputSchema,
  graphEdgeDeleteInputSchema,
  graphEdgeListQuerySchema,
  graphEdgeListResponseSchema,
  graphEdgeCreatedEventSchema,
  graphEdgeDeletedEventSchema,
  graphNodeDetailSchema,
  graphNodeListQuerySchema,
  graphNodeListResponseSchema,
  graphResponseSchema,
  graphSearchQuerySchema,
  graphSearchResponseSchema,
  type EdgeData,
  type GraphDirectoryItem,
  type GraphDirectoryQuery,
  type GraphDirectoryResponse,
  type GraphEdgeCreateInput,
  type GraphEdgeListQuery,
  type GraphEdgeListResponse,
  type GraphNodeDetail,
  type GraphNodeListQuery,
  type GraphNodeListResponse,
  type GraphResponse,
  type GraphSearchQuery,
  type GraphSearchResponse,
  type HubKey,
  type NodeData,
} from "@aios/contracts";
import { canDeleteRelationship, hubRegistry, validateRelationshipCreate } from "@aios/graph";
import { appendAuditOutboxRecords } from "../durable";
import type { Prisma, PrismaClient } from "../generated/client/client";
import { GraphEdgeProvenance, GraphEdgeType, GraphNodeType } from "../generated/client/enums";
import type { OwnerIdentity } from "../clients/types";
import { GraphOperationsError } from "./errors";
import {
  createHubNode,
  externalEdgeTypeToPrisma,
  externalNodeTypeToPrisma,
  isSyntheticGraphRow,
  projectGraphEdge,
  projectGraphNode,
  type GraphEdgeRow,
  type GraphNodeRow,
  type GraphSourceIndex,
  type MaterializedGraphNode,
} from "./mappers";
import {
  CONTACT_OWNERSHIP_PROJECTION_KEY,
  GRAPH_PROJECTION_VERSION,
  TASK_OWNERSHIP_PROJECTION_KEY,
  upsertTaskGraphProjection,
} from "./projections";

export const GRAPH_COMPLETE_NODE_LIMIT = 500 as const;
export const GRAPH_COMPLETE_EDGE_LIMIT = 5_000 as const;
const GRAPH_HUB_COUNT = 9;
const SYNTHETIC_SEED_ID_PREFIX = "10000000-0000-4000-8000-000000000";
const SYNTHETIC_SEED_CLIENT_ID = `${SYNTHETIC_SEED_ID_PREFIX}001`;
const SYNTHETIC_SEED_CONTACT_ID = `${SYNTHETIC_SEED_ID_PREFIX}002`;
const SYNTHETIC_SEED_TASK_ID = `${SYNTHETIC_SEED_ID_PREFIX}004`;
const HUB_IDS = {
  command: "d42f787d-c6f4-5b97-87c3-5f54f3bf5129",
  clients: "02ed5eda-41d1-52f4-b272-d030255b4b6f",
  agents: "d61dcc77-35ad-5393-9445-f71f5bc533d2",
  finance: "b7be8485-a557-5ca2-aabb-be1f31d62fa0",
  pipeline_crm: "92c69628-2049-5d0e-91da-46ace200f057",
  content: "823f924c-33ba-5127-9901-e79d53bcf5d6",
  knowledge: "0f28919d-ff6b-58f3-bf41-b2a133269ebb",
  automations: "89e8cde4-a2a6-5172-94e3-2e2b83f0f87e",
  tools: "090066a5-ef79-537b-932b-531c710ae4c3",
} as const satisfies Record<HubKey, string>;

interface GraphCursor {
  version: 1;
  kind: "node" | "edge";
  fingerprint: string;
  id: string;
}

interface LoadedGraph {
  materialized: MaterializedGraphNode[];
  nodes: NodeData[];
  edges: EdgeData[];
  generatedAt: string;
  revision: string;
}

type GraphDatabase = PrismaClient | Prisma.TransactionClient;

export interface GraphConsistencyIssue {
  stableKey: string;
  kind: "missing" | "lifecycle" | "provenance" | "endpoint";
}

export interface GraphConsistencyReport {
  consistent: boolean;
  expected: { clients: number; contacts: number; tasks: number; hubs: number; projectedEdges: number };
  issues: GraphConsistencyIssue[];
  checkedAt: string;
}

export interface GraphRebuildResult {
  clients: number;
  contacts: number;
  tasks: number;
  hubs: number;
  projectedEdges: number;
  staleNodesArchived: number;
  consistent: boolean;
}

function assertIdentity(identity: OwnerIdentity): void {
  if (!identity.ownerSubject?.trim() || !identity.ownerAccountId?.trim() || !identity.correlationId?.trim()) {
    throw new GraphOperationsError("INVALID_IDENTITY", "Active owner subject, database identity, and correlation ID are required.");
  }
  if (identity.correlationId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(identity.correlationId)) {
    throw new GraphOperationsError("INVALID_IDENTITY", "The correlation ID is invalid.");
  }
}

async function requireActiveOwner(database: GraphDatabase, identity: OwnerIdentity): Promise<void> {
  assertIdentity(identity);
  const owner = await database.ownerAccount.findFirst({
    where: { id: identity.ownerAccountId, authSubject: identity.ownerSubject, active: true },
    select: { id: true },
  });
  if (!owner) throw new GraphOperationsError("INVALID_IDENTITY", "The owner identity is not active or does not match the database identity.");
}

function isSyntheticSeedId(id: string): boolean {
  return id.startsWith(SYNTHETIC_SEED_ID_PREFIX);
}

function parseOrThrow<T>(parser: { safeParse(input: unknown): { success: true; data: T } | { success: false } }, input: unknown): T {
  const parsed = parser.safeParse(input);
  if (!parsed.success) throw new GraphOperationsError("INVALID_INPUT", "The graph operation input is invalid.");
  return parsed.data;
}

function encodeCursor(cursor: GraphCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined, kind: GraphCursor["kind"], fingerprint: string): GraphCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<GraphCursor>;
    if (parsed.version !== 1 || parsed.kind !== kind || parsed.fingerprint !== fingerprint || typeof parsed.id !== "string" || !parsed.id) throw new Error();
    return parsed as GraphCursor;
  } catch {
    throw new GraphOperationsError("INVALID_CURSOR", "The graph cursor is invalid or does not match the active filters.");
  }
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

function stableProjectionEdgeId(sourceNodeId: string, targetNodeId: string): string {
  return `projection:hub:${createHash("sha256").update(`${sourceNodeId}\0${targetNodeId}`).digest("hex").slice(0, 32)}`;
}

function statusLabel(status: string | null): string | null {
  if (!status) return null;
  return status.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function secondaryLabel(node: NodeData): string | null {
  if (node.type === "client") return `$${Math.round(node.metadata.mrr).toLocaleString("en-US")} MRR`;
  if (node.type === "ai_agent") return node.metadata.lastRun ? `Last run ${node.metadata.lastRun.slice(0, 10)}` : null;
  if (node.type === "tool") return node.metadata.category;
  if (node.type === "task") return node.metadata.dueDate ? `Due ${node.metadata.dueDate}` : node.summary;
  if (node.type === "knowledge_memory") return node.metadata.category;
  if (node.type === "sop") return `${node.metadata.stepsCount} steps`;
  return node.summary;
}

function directoryItem(item: MaterializedGraphNode): GraphDirectoryItem {
  return {
    nodeId: item.node.id,
    stableKey: item.node.stableKey,
    entityId: item.node.entityId,
    label: item.node.label,
    nodeType: item.node.type,
    status: item.node.status,
    statusLabel: statusLabel(item.node.status),
    secondaryLabel: secondaryLabel(item.node)?.slice(0, 255) ?? null,
    hubKeys: item.node.hubKeys,
    sortValue: item.directorySortValue,
  };
}

function textSimilarity(leftInput: string, rightInput: string): number {
  const left = leftInput.toLowerCase().trim();
  const right = rightInput.toLowerCase().trim();
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return Math.min(0.98, Math.max(left.length, right.length) === 0 ? 0 : Math.min(left.length, right.length) / Math.max(left.length, right.length) + 0.35);
  const width = right.length + 1;
  let previous = Array.from({ length: width }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const next = [row];
    for (let column = 1; column <= right.length; column += 1) {
      next[column] = Math.min(
        next[column - 1]! + 1,
        previous[column]! + 1,
        previous[column - 1]! + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = next;
  }
  return Math.max(0, 1 - previous[right.length]! / Math.max(left.length, right.length));
}

async function loadSourceIndex(database: GraphDatabase, rows: readonly GraphNodeRow[]): Promise<GraphSourceIndex> {
  const ids = (type: GraphNodeType) => rows.filter((row) => row.type === type && row.entityId).map((row) => row.entityId!);
  const clientIds = ids(GraphNodeType.CLIENT);
  const contactIds = ids(GraphNodeType.HUMAN);
  const taskIds = ids(GraphNodeType.TASK);
  const agentIds = ids(GraphNodeType.AGENT);
  const toolIds = ids(GraphNodeType.TOOL);
  const sopIds = ids(GraphNodeType.SOP);
  const knowledgeIds = [...ids(GraphNodeType.KNOWLEDGE), ...ids(GraphNodeType.DECISION)];
  const financeIds = ids(GraphNodeType.FINANCE);
  const [clients, contacts, tasks, agents, tools, sops, knowledge, invoices, expenses] = await Promise.all([
    clientIds.length ? database.client.findMany({ where: { id: { in: clientIds } }, include: { _count: { select: { projects: { where: { archivedAt: null, deletedAt: null } } } } } }) : [],
    contactIds.length ? database.contact.findMany({ where: { id: { in: contactIds } }, include: { client: { select: { id: true, name: true, archivedAt: true, deletedAt: true } } } }) : [],
    taskIds.length ? database.task.findMany({
      where: { id: { in: taskIds } },
      include: {
        project: { select: { id: true, name: true, type: true, archivedAt: true, deletedAt: true, client: { select: { id: true, name: true, archivedAt: true, deletedAt: true } } } },
        assignments: { where: { archivedAt: null, deletedAt: null }, select: { assigneeType: true, agentId: true, ownerAccountId: true } },
      },
    }) : [],
    agentIds.length ? database.agent.findMany({ where: { id: { in: agentIds } }, include: { _count: { select: { runs: { where: { status: "SUCCESS", deletedAt: null } } } } } }) : [],
    toolIds.length ? database.integrationConnection.findMany({ where: { id: { in: toolIds } }, include: { client: { select: { archivedAt: true, deletedAt: true } } } }) : [],
    sopIds.length ? database.sop.findMany({ where: { id: { in: sopIds } }, include: { client: { select: { archivedAt: true, deletedAt: true } }, _count: { select: { steps: { where: { deletedAt: null } } } } } }) : [],
    knowledgeIds.length ? database.knowledgeEntry.findMany({ where: { id: { in: knowledgeIds } }, include: { client: { select: { archivedAt: true, deletedAt: true } } } }) : [],
    financeIds.length ? database.invoice.findMany({ where: { id: { in: financeIds } }, include: { client: { select: { name: true, archivedAt: true, deletedAt: true } } } }) : [],
    financeIds.length ? database.expense.findMany({ where: { id: { in: financeIds } }, include: { client: { select: { archivedAt: true, deletedAt: true } } } }) : [],
  ]);
  return {
    clients: new Map(clients.map((source) => [source.id, source])),
    contacts: new Map(contacts.map((source) => [source.id, source])),
    tasks: new Map(tasks.map((source) => [source.id, source])),
    agents: new Map(agents.map((source) => [source.id, source])),
    tools: new Map(tools.map((source) => [source.id, source])),
    sops: new Map(sops.map((source) => [source.id, source])),
    knowledge: new Map(knowledge.map((source) => [source.id, source])),
    invoices: new Map(invoices.map((source) => [source.id, source])),
    expenses: new Map(expenses.map((source) => [source.id, source])),
    graphNodeIdByEntity: new Map(rows.flatMap((row) => row.entityId ? [[row.entityId, row.id] as const] : [])),
  };
}

async function loadGraph(database: GraphDatabase): Promise<LoadedGraph> {
  const [hubRows, entityRows] = await Promise.all([
    database.graphNode.findMany({
      where: { type: GraphNodeType.HUB, archivedAt: null, deletedAt: null, NOT: { stableKey: { startsWith: "seed:" } } },
      orderBy: { stableKey: "asc" },
      take: GRAPH_HUB_COUNT,
    }),
    database.graphNode.findMany({
      where: { type: { not: GraphNodeType.HUB }, archivedAt: null, deletedAt: null, NOT: { stableKey: { startsWith: "seed:" } } },
      orderBy: { stableKey: "asc" },
      take: GRAPH_COMPLETE_NODE_LIMIT - GRAPH_HUB_COUNT,
    }),
  ]);
  const visibleEntityRows = (entityRows as GraphNodeRow[]).filter((row) =>
    !isSyntheticGraphRow(row) && (!row.entityId || !isSyntheticSeedId(row.entityId)),
  );
  const rows = [...hubRows, ...visibleEntityRows] as GraphNodeRow[];
  const sources = await loadSourceIndex(database, rows);
  const entityMaterialized: MaterializedGraphNode[] = [];
  for (const row of visibleEntityRows) {
    try {
      const result = projectGraphNode(row, sources);
      if (result) entityMaterialized.push(result);
    } catch {
      // A malformed or stale projection is omitted rather than leaking arbitrary metadata.
    }
  }
  const entityNodes = entityMaterialized.map((item) => item.node);
  const hubMaterialized: MaterializedGraphNode[] = [];
  for (const row of hubRows as GraphNodeRow[]) {
    try {
      const result = createHubNode(row, entityNodes);
      if (result) hubMaterialized.push(result);
    } catch {
      // Invalid structural rows are reported by consistency checks and omitted here.
    }
  }
  const materialized = [...hubMaterialized, ...entityMaterialized].sort((left, right) => left.node.id.localeCompare(right.node.id));
  const nodes = materialized.map((item) => item.node);
  const visibleIds = new Set(nodes.map((node) => node.id));
  const databaseNodeIds = rows.filter((row) => visibleIds.has(row.id)).map((row) => row.id);
  const edgeRows = databaseNodeIds.length ? await database.graphEdge.findMany({
    where: {
      archivedAt: null,
      deletedAt: null,
      sourceId: { in: databaseNodeIds },
      targetId: { in: databaseNodeIds },
      source: { archivedAt: null, deletedAt: null },
      target: { archivedAt: null, deletedAt: null },
    },
    orderBy: { id: "asc" },
    take: GRAPH_COMPLETE_EDGE_LIMIT,
  }) : [];
  const storedEdges = edgeRows.flatMap((row) => {
    if (isSyntheticGraphRow(rows.find((node) => node.id === row.sourceId)!) || isSyntheticGraphRow(rows.find((node) => node.id === row.targetId)!)) return [];
    try {
      const edge = projectGraphEdge(row as GraphEdgeRow, visibleIds);
      return edge ? [edge] : [];
    } catch {
      return [];
    }
  });
  const hubEdges = materialized.flatMap((item) => item.node.type === "hub" ? [] : item.node.hubKeys.flatMap((key) => {
    const hub = nodes.find((node) => node.type === "hub" && node.metadata.hubKey === key);
    if (!hub) return [];
    return [edgeDataSchema.parse({
      id: stableProjectionEdgeId(hub.id, item.node.id),
      type: "ownership",
      sourceNodeId: hub.id,
      targetNodeId: item.node.id,
      label: "contains",
      origin: "projection",
      projectionKey: "hubs.membership",
      createdAt: item.sourceUpdatedAt.toISOString(),
    })];
  }));
  const edges = [...storedEdges, ...hubEdges].sort((left, right) => left.id.localeCompare(right.id));
  const generatedAt = new Date().toISOString();
  const latest = rows.reduce((maximum, row) => Math.max(maximum, row.updatedAt.getTime()), 0);
  const revision = `graph-v1-${GRAPH_COMPLETE_NODE_LIMIT}-${nodes.length}-${edges.length}-${latest}`;
  return { materialized, nodes, edges, generatedAt, revision };
}

async function appendGraphEvent(
  transaction: Prisma.TransactionClient,
  identity: OwnerIdentity,
  input: { edge: EdgeData; operation: "create" | "delete"; occurredAt: Date },
): Promise<void> {
  const eventId = randomUUID();
  const occurredAt = input.occurredAt.toISOString();
  const realtimeEvent = input.operation === "create"
    ? graphEdgeCreatedEventSchema.parse({
      eventId,
      schemaVersion: 1,
      channel: "graph:updates",
      event: "edge_created",
      occurredAt,
      payload: { edge: { ...input.edge, label: null } },
    })
    : graphEdgeDeletedEventSchema.parse({
      eventId,
      schemaVersion: 1,
      channel: "graph:updates",
      event: "edge_deleted",
      occurredAt,
      payload: { edgeId: input.edge.id },
    });
  const eventType = "graph.realtime.v1";
  await appendAuditOutboxRecords(transaction, {
    audit: {
      actorSubject: identity.ownerSubject,
      actorType: identity.actorType ?? "owner",
      action: input.operation,
      entityType: "graph_edge",
      entityId: input.edge.id,
      correlationId: identity.correlationId,
      changeSummary: { schemaVersion: 1, changedFields: input.operation === "create" ? ["edgeType", "label", "sourceId", "targetId"] : ["archivedAt", "deletedAt"] },
      ipHash: identity.ipHash,
    },
    outbox: {
      id: eventId,
      aggregateType: "graph_edge",
      aggregateId: input.edge.id,
      eventType,
      payload: {
        eventId,
        schemaVersion: 1,
        ownerId: identity.ownerAccountId,
        occurredAt,
        payload: { realtimeEvent },
      },
      correlationId: identity.correlationId,
      idempotencyKey: `${identity.correlationId}:${eventType}:${input.operation}:${input.edge.id}`,
      occurredAt: input.occurredAt,
    },
  });
}

export class PrismaGraphService {
  constructor(private readonly database: PrismaClient) {}

  async getCompleteGraph(identity: OwnerIdentity): Promise<GraphResponse> {
    await requireActiveOwner(this.database, identity);
    const graph = await loadGraph(this.database);
    return graphResponseSchema.parse({ nodes: graph.nodes, edges: graph.edges, generatedAt: graph.generatedAt, revision: graph.revision });
  }

  async getGraph(identity: OwnerIdentity): Promise<GraphResponse> {
    return this.getCompleteGraph(identity);
  }

  async listNodes(identity: OwnerIdentity, input: Partial<GraphNodeListQuery> = {}): Promise<GraphNodeListResponse> {
    await requireActiveOwner(this.database, identity);
    const query = parseOrThrow(graphNodeListQuerySchema, input);
    const graph = await loadGraph(this.database);
    const nodes = graph.nodes.filter((node) =>
      (!query.types?.length || query.types.includes(node.type))
      && (!query.hubs?.length || query.hubs.some((hub) => node.type === "hub" ? node.metadata.hubKey === hub : node.hubKeys.includes(hub)))
      && (!query.actions?.length || (node.action !== null && query.actions.includes(node.action)))
      && (query.status === undefined || node.status === query.status),
    ).sort((left, right) => left.id.localeCompare(right.id));
    const cursorFingerprint = fingerprint({ types: query.types ?? [], hubs: query.hubs ?? [], actions: query.actions ?? [], status: query.status ?? null });
    const cursor = decodeCursor(query.cursor, "node", cursorFingerprint);
    const start = cursor ? nodes.findIndex((node) => node.id === cursor.id) + 1 : 0;
    if (cursor && start === 0) throw new GraphOperationsError("INVALID_CURSOR", "The graph node cursor no longer belongs to the bounded result set.");
    const page = nodes.slice(start, start + query.limit);
    const hasMore = start + page.length < nodes.length;
    const last = page.at(-1);
    return graphNodeListResponseSchema.parse({
      nodes: page,
      meta: { total: nodes.length, cursor: hasMore && last ? encodeCursor({ version: 1, kind: "node", fingerprint: cursorFingerprint, id: last.id }) : null, hasMore },
    });
  }

  async listEdges(identity: OwnerIdentity, input: Partial<GraphEdgeListQuery> = {}): Promise<GraphEdgeListResponse> {
    await requireActiveOwner(this.database, identity);
    const query = parseOrThrow(graphEdgeListQuerySchema, input);
    const graph = await loadGraph(this.database);
    const edges = graph.edges.filter((edge) =>
      (!query.types?.length || query.types.includes(edge.type))
      && (!query.nodeId || edge.sourceNodeId === query.nodeId || edge.targetNodeId === query.nodeId),
    ).sort((left, right) => left.id.localeCompare(right.id));
    const cursorFingerprint = fingerprint({ types: query.types ?? [], nodeId: query.nodeId ?? null });
    const cursor = decodeCursor(query.cursor, "edge", cursorFingerprint);
    const start = cursor ? edges.findIndex((edge) => edge.id === cursor.id) + 1 : 0;
    if (cursor && start === 0) throw new GraphOperationsError("INVALID_CURSOR", "The graph edge cursor no longer belongs to the bounded result set.");
    const page = edges.slice(start, start + query.limit);
    const hasMore = start + page.length < edges.length;
    const last = page.at(-1);
    return graphEdgeListResponseSchema.parse({
      edges: page,
      meta: { total: edges.length, cursor: hasMore && last ? encodeCursor({ version: 1, kind: "edge", fingerprint: cursorFingerprint, id: last.id }) : null, hasMore },
    });
  }

  async getNodeDetail(identity: OwnerIdentity, nodeId: string): Promise<GraphNodeDetail> {
    await requireActiveOwner(this.database, identity);
    const graph = await loadGraph(this.database);
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new GraphOperationsError("NOT_FOUND", "Graph node not found in the live bounded graph.");
    const nodeById = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
    const connections: GraphNodeDetail["connections"] = [];
    for (const edge of graph.edges) {
      if (edge.sourceNodeId === nodeId) {
        const connected = nodeById.get(edge.targetNodeId);
        if (connected) connections.push({ edge, node: connected, direction: "outgoing" });
      } else if (edge.targetNodeId === nodeId) {
        const connected = nodeById.get(edge.sourceNodeId);
        if (connected) connections.push({ edge, node: connected, direction: "incoming" });
      }
    }
    return graphNodeDetailSchema.parse({ node, connections });
  }

  async search(identity: OwnerIdentity, input: GraphSearchQuery): Promise<GraphSearchResponse> {
    await requireActiveOwner(this.database, identity);
    const query = parseOrThrow(graphSearchQuerySchema, input);
    const graph = await loadGraph(this.database);
    const needle = query.query.toLowerCase();
    const results = graph.nodes.flatMap((node) => {
      if (query.types?.length && !query.types.includes(node.type)) return [];
      const fields = [
        ["label", node.label] as const,
        ["type", node.type.replaceAll("_", " ")] as const,
        ["summary", node.summary ?? ""] as const,
        ...node.tags.map((tag) => ["tag", tag] as const),
      ];
      const scored = fields.map(([field, value]) => ({ field, score: textSimilarity(value, needle) }));
      const score = Math.max(...scored.map((entry) => entry.score));
      if (score < 0.45) return [];
      const matchedFields = [...new Set(scored.filter((entry) => entry.score >= Math.max(0.45, score - 0.15)).map((entry) => entry.field))];
      return [{ node, score: Math.min(1, score), matchedFields }];
    }).sort((left, right) => right.score - left.score || left.node.label.localeCompare(right.node.label) || left.node.id.localeCompare(right.node.id));
    return graphSearchResponseSchema.parse({ results: results.slice(0, query.limit), query: query.query, total: results.length });
  }

  async getDirectory(identity: OwnerIdentity, input: GraphDirectoryQuery = {}): Promise<GraphDirectoryResponse> {
    await requireActiveOwner(this.database, identity);
    const query = parseOrThrow(graphDirectoryQuerySchema, input);
    const graph = await loadGraph(this.database);
    const needle = query.query?.toLowerCase();
    const visible = graph.materialized.filter((item) => !needle || [item.node.label, item.node.summary ?? "", ...item.node.tags].some((value) => textSimilarity(value, needle) >= 0.45));
    const definitions = [
      { key: "ai_agents" as const, label: "AI Agents", include: (item: MaterializedGraphNode) => item.node.type === "ai_agent", descending: true },
      { key: "clients" as const, label: "Clients", include: (item: MaterializedGraphNode) => item.node.type === "client", descending: true },
      { key: "tools" as const, label: "Tools", include: (item: MaterializedGraphNode) => item.node.type === "tool", descending: true },
      { key: "recent_tasks" as const, label: "Recent Tasks", include: (item: MaterializedGraphNode) => item.node.type === "task", descending: true },
      { key: "knowledge" as const, label: "Knowledge", include: (item: MaterializedGraphNode) => item.node.type === "knowledge_memory" || item.node.type === "sop", descending: true },
    ];
    const groups = definitions.filter((definition) => !query.groups?.length || query.groups.includes(definition.key)).map((definition) => {
      const items = visible.filter(definition.include).sort((left, right) => {
        const value = (right.directorySortValue ?? Number.NEGATIVE_INFINITY) - (left.directorySortValue ?? Number.NEGATIVE_INFINITY);
        return value || left.node.label.localeCompare(right.node.label) || left.node.id.localeCompare(right.node.id);
      });
      return { key: definition.key, label: definition.label, count: items.length, items: items.map(directoryItem) };
    });
    return graphDirectoryResponseSchema.parse({ groups, total: groups.reduce((total, group) => total + group.count, 0) });
  }

  async createEdge(identity: OwnerIdentity, input: GraphEdgeCreateInput): Promise<EdgeData> {
    const parsed = parseOrThrow(graphEdgeCreateInputSchema, input);
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwner(transaction, identity);
      const graph = await loadGraph(transaction);
      const validation = validateRelationshipCreate(parsed, { nodes: graph.nodes, edges: graph.edges });
      if (!validation.valid) throw new GraphOperationsError(validation.code, validation.message);
      const endpointRows = await transaction.graphNode.findMany({
        where: { id: { in: [parsed.sourceNodeId, parsed.targetNodeId] }, archivedAt: null, deletedAt: null },
      });
      const source = endpointRows.find((node) => node.id === parsed.sourceNodeId);
      const target = endpointRows.find((node) => node.id === parsed.targetNodeId);
      if (!source) throw new GraphOperationsError("SOURCE_NOT_FOUND", "The source node does not have a live authoritative projection.");
      if (!target) throw new GraphOperationsError("TARGET_NOT_FOUND", "The target node does not have a live authoritative projection.");
      const edgeType = externalEdgeTypeToPrisma[parsed.type];
      const naturalKey = {
        sourceId: source.id,
        sourceType: source.type,
        targetId: target.id,
        targetType: target.type,
        edgeType,
      };
      const existing = await transaction.graphEdge.findUnique({ where: { sourceId_sourceType_targetId_targetType_edgeType: naturalKey } });
      if (existing && !existing.archivedAt && !existing.deletedAt) throw new GraphOperationsError("DUPLICATE_EDGE", "That relationship already exists.");
      if (existing?.provenance === GraphEdgeProvenance.SYSTEM_PROJECTION) {
        throw new GraphOperationsError("PROJECTED_EDGE_IMMUTABLE", "Projected relationships must be changed through their owning domain.");
      }
      const occurredAt = new Date();
      const row = existing
        ? await transaction.graphEdge.update({
          where: { id: existing.id },
          data: { provenance: GraphEdgeProvenance.OWNER_EXPLICIT, label: parsed.label, metadata: { schemaVersion: 1 }, archivedAt: null, deletedAt: null },
        })
        : await transaction.graphEdge.create({
          data: { ...naturalKey, provenance: GraphEdgeProvenance.OWNER_EXPLICIT, label: parsed.label, metadata: { schemaVersion: 1 } },
        });
      const edge = edgeDataSchema.parse({ id: row.id, ...parsed, origin: "owner", projectionKey: null, createdAt: row.createdAt.toISOString() });
      await appendGraphEvent(transaction, identity, { edge, operation: "create", occurredAt });
      return edge;
    }, { isolationLevel: "Serializable" });
  }

  async deleteEdge(identity: OwnerIdentity, input: { id: string }): Promise<EdgeData> {
    const parsed = parseOrThrow(graphEdgeDeleteInputSchema, input);
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwner(transaction, identity);
      const row = await transaction.graphEdge.findUnique({ where: { id: parsed.id }, include: { source: true, target: true } });
      if (!row) throw new GraphOperationsError("NOT_FOUND", "Graph edge not found.");
      const edge = projectGraphEdge(row, new Set([row.sourceId, row.targetId]));
      if (!edge) throw new GraphOperationsError("NOT_FOUND", "Graph edge endpoints are unavailable.");
      const deletion = canDeleteRelationship(edge);
      if (!deletion.allowed) throw new GraphOperationsError(deletion.code, deletion.message);
      if (row.deletedAt) return edge;
      const occurredAt = new Date();
      await transaction.graphEdge.update({ where: { id: row.id }, data: { archivedAt: row.archivedAt ?? occurredAt, deletedAt: occurredAt } });
      await appendGraphEvent(transaction, identity, { edge, operation: "delete", occurredAt });
      return edge;
    }, { isolationLevel: "Serializable" });
  }

  async checkConsistency(identity: OwnerIdentity): Promise<GraphConsistencyReport> {
    await requireActiveOwner(this.database, identity);
    return this.buildConsistencyReport(this.database);
  }

  async rebuildCurrentDomainProjections(identity: OwnerIdentity): Promise<GraphRebuildResult> {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwner(transaction, identity);
      const [clients, contacts, tasks] = await Promise.all([
        transaction.client.findMany({ where: { id: { not: SYNTHETIC_SEED_CLIENT_ID } } }),
        transaction.contact.findMany({ where: { id: { not: SYNTHETIC_SEED_CONTACT_ID }, clientId: { not: SYNTHETIC_SEED_CLIENT_ID } } }),
        transaction.task.findMany({ where: { id: { not: SYNTHETIC_SEED_TASK_ID }, project: { clientId: { not: SYNTHETIC_SEED_CLIENT_ID } } } }),
      ]);
      for (const client of clients) {
        await transaction.graphNode.upsert({
          where: { stableKey: `client:${client.id}` },
          create: { type: GraphNodeType.CLIENT, entityId: client.id, stableKey: `client:${client.id}`, label: client.name, metadata: { projectionVersion: GRAPH_PROJECTION_VERSION }, archivedAt: client.archivedAt, deletedAt: client.deletedAt },
          update: { label: client.name, metadata: { projectionVersion: GRAPH_PROJECTION_VERSION }, archivedAt: client.archivedAt, deletedAt: client.deletedAt },
        });
      }
      for (const contact of contacts) await this.rebuildContact(transaction, contact);
      for (const task of tasks) await upsertTaskGraphProjection(transaction, task);
      for (const [key, definition] of Object.entries(hubRegistry) as Array<[HubKey, (typeof hubRegistry)[HubKey]]>) {
        const stableKey = key === "pipeline_crm" ? "hub:pipeline-crm" : `hub:${key}`;
        await transaction.graphNode.upsert({
          where: { stableKey },
          create: { id: HUB_IDS[key], type: GraphNodeType.HUB, stableKey, label: definition.label, metadata: { projectionVersion: GRAPH_PROJECTION_VERSION, hubSlug: key }, archivedAt: null, deletedAt: null },
          update: { label: definition.label, metadata: { projectionVersion: GRAPH_PROJECTION_VERSION, hubSlug: key }, archivedAt: null, deletedAt: null },
        });
      }
      const liveStableKeys = new Set([
        ...clients.map((client) => `client:${client.id}`),
        ...contacts.map((contact) => `contact:${contact.id}`),
        ...tasks.map((task) => `task:${task.id}`),
      ]);
      const stale = await transaction.graphNode.findMany({
        where: { OR: [{ stableKey: { startsWith: "client:" } }, { stableKey: { startsWith: "contact:" } }, { stableKey: { startsWith: "task:" } }], NOT: { stableKey: { startsWith: "seed:" } } },
        select: { id: true, stableKey: true, archivedAt: true, deletedAt: true },
      });
      const now = new Date();
      const staleIds = stale.filter((node) => !liveStableKeys.has(node.stableKey) && !node.deletedAt).map((node) => node.id);
      if (staleIds.length) {
        await transaction.graphEdge.updateMany({ where: { provenance: GraphEdgeProvenance.SYSTEM_PROJECTION, OR: [{ sourceId: { in: staleIds } }, { targetId: { in: staleIds } }] }, data: { archivedAt: now, deletedAt: now } });
        await transaction.graphNode.updateMany({ where: { id: { in: staleIds } }, data: { archivedAt: now, deletedAt: now } });
      }
      const report = await this.buildConsistencyReport(transaction);
      const eventId = randomUUID();
      const result: GraphRebuildResult = {
        clients: clients.length,
        contacts: contacts.length,
        tasks: tasks.length,
        hubs: GRAPH_HUB_COUNT,
        projectedEdges: contacts.length + tasks.length,
        staleNodesArchived: staleIds.length,
        consistent: report.consistent,
      };
      await appendAuditOutboxRecords(transaction, {
        audit: {
          actorSubject: identity.ownerSubject,
          actorType: identity.actorType ?? "owner",
          action: "rebuild",
          entityType: "graph_projection",
          entityId: identity.ownerAccountId,
          correlationId: identity.correlationId,
          changeSummary: { schemaVersion: 1, changedFields: ["clients", "contacts", "hubs", "projectedEdges", "tasks"], ...result },
          ipHash: identity.ipHash,
        },
        outbox: {
          id: eventId,
          aggregateType: "graph_projection",
          aggregateId: identity.ownerAccountId,
          eventType: "graph.projections_rebuilt",
          payload: { eventId, schemaVersion: 1, occurredAt: now.toISOString(), counts: result },
          correlationId: identity.correlationId,
          idempotencyKey: `${identity.correlationId}:graph.projections_rebuilt:${identity.ownerAccountId}`,
          occurredAt: now,
        },
      });
      return result;
    }, { isolationLevel: "Serializable" });
  }

  private async rebuildContact(transaction: Prisma.TransactionClient, contact: { id: string; clientId: string; name: string; archivedAt: Date | null; deletedAt: Date | null }): Promise<void> {
    const clientNode = await transaction.graphNode.findUnique({ where: { type_entityId: { type: GraphNodeType.CLIENT, entityId: contact.clientId } } });
    if (!clientNode) throw new GraphOperationsError("NOT_FOUND", "Client graph projection not found while rebuilding contact projections.");
    const contactNode = await transaction.graphNode.upsert({
      where: { stableKey: `contact:${contact.id}` },
      create: { type: GraphNodeType.HUMAN, entityId: contact.id, stableKey: `contact:${contact.id}`, label: contact.name, metadata: { projectionVersion: GRAPH_PROJECTION_VERSION, clientId: contact.clientId }, archivedAt: contact.archivedAt, deletedAt: contact.deletedAt },
      update: { label: contact.name, metadata: { projectionVersion: GRAPH_PROJECTION_VERSION, clientId: contact.clientId }, archivedAt: contact.archivedAt, deletedAt: contact.deletedAt },
    });
    await transaction.graphEdge.upsert({
      where: { sourceId_sourceType_targetId_targetType_edgeType: { sourceId: clientNode.id, sourceType: GraphNodeType.CLIENT, targetId: contactNode.id, targetType: GraphNodeType.HUMAN, edgeType: GraphEdgeType.OWNERSHIP } },
      create: { sourceId: clientNode.id, sourceType: GraphNodeType.CLIENT, targetId: contactNode.id, targetType: GraphNodeType.HUMAN, edgeType: GraphEdgeType.OWNERSHIP, provenance: GraphEdgeProvenance.SYSTEM_PROJECTION, label: "has contact", metadata: { projectionVersion: GRAPH_PROJECTION_VERSION, projectionKey: CONTACT_OWNERSHIP_PROJECTION_KEY }, archivedAt: contact.archivedAt, deletedAt: contact.deletedAt },
      update: { provenance: GraphEdgeProvenance.SYSTEM_PROJECTION, label: "has contact", metadata: { projectionVersion: GRAPH_PROJECTION_VERSION, projectionKey: CONTACT_OWNERSHIP_PROJECTION_KEY }, archivedAt: contact.archivedAt, deletedAt: contact.deletedAt },
    });
  }

  private async buildConsistencyReport(database: GraphDatabase): Promise<GraphConsistencyReport> {
    const [clients, contacts, tasks, graphNodes] = await Promise.all([
      database.client.findMany({ where: { id: { not: SYNTHETIC_SEED_CLIENT_ID } }, select: { id: true, archivedAt: true, deletedAt: true } }),
      database.contact.findMany({ where: { id: { not: SYNTHETIC_SEED_CONTACT_ID }, clientId: { not: SYNTHETIC_SEED_CLIENT_ID } }, select: { id: true, clientId: true, archivedAt: true, deletedAt: true } }),
      database.task.findMany({ where: { id: { not: SYNTHETIC_SEED_TASK_ID }, project: { clientId: { not: SYNTHETIC_SEED_CLIENT_ID } } }, select: { id: true, project: { select: { clientId: true } }, archivedAt: true, deletedAt: true } }),
      database.graphNode.findMany({ where: { NOT: { stableKey: { startsWith: "seed:" } } }, select: { id: true, stableKey: true, archivedAt: true, deletedAt: true } }),
    ]);
    const nodeByStableKey = new Map(graphNodes.map((node) => [node.stableKey, node]));
    const issues: GraphConsistencyIssue[] = [];
    const checkNode = (stableKey: string, source: { archivedAt: Date | null; deletedAt: Date | null }) => {
      const node = nodeByStableKey.get(stableKey);
      if (!node) issues.push({ stableKey, kind: "missing" });
      else if (Boolean(node.archivedAt) !== Boolean(source.archivedAt) || Boolean(node.deletedAt) !== Boolean(source.deletedAt)) issues.push({ stableKey, kind: "lifecycle" });
    };
    for (const client of clients) checkNode(`client:${client.id}`, client);
    for (const contact of contacts) checkNode(`contact:${contact.id}`, contact);
    for (const task of tasks) checkNode(`task:${task.id}`, task);
    for (const key of Object.keys(hubRegistry) as HubKey[]) {
      const stableKey = key === "pipeline_crm" ? "hub:pipeline-crm" : `hub:${key}`;
      const hub = nodeByStableKey.get(stableKey);
      if (!hub) issues.push({ stableKey, kind: "missing" });
      else if (hub.archivedAt || hub.deletedAt) issues.push({ stableKey, kind: "lifecycle" });
    }
    const ownershipEdges = await database.graphEdge.findMany({
      where: { edgeType: GraphEdgeType.OWNERSHIP },
      include: { source: { select: { stableKey: true } }, target: { select: { stableKey: true } } },
    });
    const edgeByEndpoints = new Map(ownershipEdges.map((edge) => [`${edge.source.stableKey}\0${edge.target.stableKey}`, edge]));
    const checkEdge = (source: string, target: string, lifecycle: { archivedAt: Date | null; deletedAt: Date | null }) => {
      const stableKey = `${source}->${target}`;
      const edge = edgeByEndpoints.get(`${source}\0${target}`);
      if (!edge) issues.push({ stableKey, kind: "missing" });
      else if (edge.provenance !== GraphEdgeProvenance.SYSTEM_PROJECTION) issues.push({ stableKey, kind: "provenance" });
      else if (Boolean(edge.archivedAt) !== Boolean(lifecycle.archivedAt) || Boolean(edge.deletedAt) !== Boolean(lifecycle.deletedAt)) issues.push({ stableKey, kind: "lifecycle" });
    };
    for (const contact of contacts) checkEdge(`client:${contact.clientId}`, `contact:${contact.id}`, contact);
    for (const task of tasks) checkEdge(`client:${task.project.clientId}`, `task:${task.id}`, task);
    return {
      consistent: issues.length === 0,
      expected: { clients: clients.length, contacts: contacts.length, tasks: tasks.length, hubs: GRAPH_HUB_COUNT, projectedEdges: contacts.length + tasks.length },
      issues,
      checkedAt: new Date().toISOString(),
    };
  }
}

export function createGraphService(database: PrismaClient): PrismaGraphService {
  return new PrismaGraphService(database);
}
