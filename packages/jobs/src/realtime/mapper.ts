import {
  GRAPH_REALTIME_SCHEMA_VERSION,
  edgeDataSchema,
  graphRealtimeEventSchema,
  nodeDataSchema,
  type EdgeData,
  type GraphRealtimeEvent,
  type NodeData,
} from "@aios/contracts";
import {
  GraphEdgeProvenance,
  GraphEdgeType,
  type PrismaClient,
} from "@aios/data";

import type { ClaimedOutboxEvent } from "../outbox/contracts";
import type { OwnerScopedRealtimeBroadcast } from "./contracts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DIRECT_REALTIME_EVENT_TYPE = "graph.realtime.v1" as const;

interface DurableEnvelope {
  readonly ownerId: string;
  readonly eventId: string;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
}

type GraphNodeIdentity = Pick<NodeData, "id" | "stableKey" | "entityId">;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function durableEnvelope(event: ClaimedOutboxEvent): DurableEnvelope {
  const outer = event.payload;
  const inner = record(outer.payload) ?? outer;
  if (outer.schemaVersion !== 1) throw new Error(`${event.eventType} requires durable schemaVersion 1.`);
  const ownerId = outer.ownerId;
  if (typeof ownerId !== "string" || !UUID_PATTERN.test(ownerId)) {
    throw new Error(`${event.eventType} requires a valid ownerId.`);
  }
  const eventId = typeof outer.eventId === "string" ? outer.eventId : event.id;
  const occurredAt = typeof outer.occurredAt === "string"
    ? outer.occurredAt
    : event.occurredAt.toISOString();
  return { ownerId, eventId, occurredAt, payload: inner };
}

function childEventId(parentId: string, suffix: string): string {
  return `${parentId}:${suffix}`;
}

function clientAction(status: string): NodeData["action"] {
  switch (status) {
    case "active": return "active_running";
    case "paused": return "blocked";
    case "churned": return "completed";
    case "prospect":
    case "onboarding": return "pending";
    default: return null;
  }
}

async function clientNode(database: PrismaClient, clientId: string): Promise<NodeData | null> {
  const [projection, client] = await Promise.all([
    database.graphNode.findUnique({
      where: { stableKey: `client:${clientId}` },
      select: {
        id: true,
        stableKey: true,
        entityId: true,
        label: true,
        archivedAt: true,
        deletedAt: true,
      },
    }),
    database.client.findFirst({
      where: { id: clientId, archivedAt: null, deletedAt: null },
      select: {
        name: true,
        industry: true,
        status: true,
        mrr: true,
        startDate: true,
        _count: { select: { projects: true } },
      },
    }),
  ]);
  if (!projection || projection.archivedAt || projection.deletedAt || !client) return null;
  const status = client.status.toLowerCase();
  return nodeDataSchema.parse({
    id: projection.id,
    stableKey: projection.stableKey,
    entityId: projection.entityId,
    type: "client",
    label: projection.label,
    summary: null,
    status,
    action: clientAction(status),
    tags: [],
    hubKeys: ["clients"],
    position: null,
    metadata: {
      name: client.name,
      industry: client.industry,
      mrr: Number(client.mrr.toString()),
      status,
      startDate: client.startDate?.toISOString().slice(0, 10) ?? null,
      projectsCount: client._count.projects,
    },
  });
}

async function contactNode(database: PrismaClient, contactId: string): Promise<NodeData | null> {
  const [projection, contact] = await Promise.all([
    database.graphNode.findUnique({
      where: { stableKey: `contact:${contactId}` },
      select: {
        id: true,
        stableKey: true,
        entityId: true,
        label: true,
        archivedAt: true,
        deletedAt: true,
      },
    }),
    database.contact.findFirst({
      where: { id: contactId, archivedAt: null, deletedAt: null },
      select: { name: true, lastContactAt: true },
    }),
  ]);
  if (!projection || projection.archivedAt || projection.deletedAt || !contact) return null;
  return nodeDataSchema.parse({
    id: projection.id,
    stableKey: projection.stableKey,
    entityId: projection.entityId,
    type: "human_contact",
    label: projection.label,
    summary: null,
    status: null,
    action: null,
    tags: [],
    hubKeys: ["clients"],
    position: null,
    metadata: {
      name: contact.name,
      role: null,
      company: null,
      email: null,
      lastContact: contact.lastContactAt?.toISOString() ?? null,
    },
  });
}

function nodeChanges(node: NodeData): Extract<GraphRealtimeEvent, { event: "node_updated" }>["payload"]["changes"] {
  return {
    label: node.label,
    summary: node.summary,
    status: node.status,
    action: node.action,
    tags: node.tags,
    hubKeys: node.hubKeys,
    position: node.position,
    metadata: node.metadata,
  };
}

function nodeCreated(eventId: string, occurredAt: string, node: NodeData): GraphRealtimeEvent {
  return graphRealtimeEventSchema.parse({
    eventId,
    schemaVersion: GRAPH_REALTIME_SCHEMA_VERSION,
    occurredAt,
    channel: "graph:updates",
    event: "node_created",
    payload: { node },
  });
}

function nodeUpdated(eventId: string, occurredAt: string, node: NodeData): GraphRealtimeEvent {
  return graphRealtimeEventSchema.parse({
    eventId,
    schemaVersion: GRAPH_REALTIME_SCHEMA_VERSION,
    occurredAt,
    channel: "graph:updates",
    event: "node_updated",
    payload: {
      nodeId: node.id,
      stableKey: node.stableKey,
      entityId: node.entityId,
      changes: nodeChanges(node),
    },
  });
}

function nodeDeleted(
  eventId: string,
  occurredAt: string,
  node: GraphNodeIdentity,
): GraphRealtimeEvent {
  return graphRealtimeEventSchema.parse({
    eventId,
    schemaVersion: GRAPH_REALTIME_SCHEMA_VERSION,
    occurredAt,
    channel: "graph:updates",
    event: "node_deleted",
    payload: {
      nodeId: node.id,
      stableKey: node.stableKey,
      entityId: node.entityId,
    },
  });
}

async function graphNodeIdentity(
  database: PrismaClient,
  stableKey: string,
): Promise<GraphNodeIdentity | null> {
  return database.graphNode.findUnique({
    where: { stableKey },
    select: { id: true, stableKey: true, entityId: true },
  });
}

async function contactOwnershipEdge(database: PrismaClient, contactId: string): Promise<EdgeData | null> {
  const contactProjection = await database.graphNode.findUnique({
    where: { stableKey: `contact:${contactId}` },
    select: { id: true },
  });
  if (!contactProjection) return null;
  const edge = await database.graphEdge.findFirst({
    where: {
      targetId: contactProjection.id,
      edgeType: GraphEdgeType.OWNERSHIP,
      archivedAt: null,
      deletedAt: null,
    },
    select: {
      id: true,
      edgeType: true,
      provenance: true,
      label: true,
      metadata: true,
      createdAt: true,
      source: { select: { id: true } },
      target: { select: { id: true } },
    },
  });
  if (!edge) return null;
  const origin = edge.provenance === GraphEdgeProvenance.OWNER_EXPLICIT ? "owner" : "projection";
  const projectedKey = record(edge.metadata)?.projectionKey;
  if (origin === "projection" && (typeof projectedKey !== "string" || !projectedKey.trim())) return null;
  return edgeDataSchema.parse({
    id: edge.id,
    type: edge.edgeType.toLowerCase(),
    sourceNodeId: edge.source.id,
    targetNodeId: edge.target.id,
    label: edge.label,
    origin,
    projectionKey: origin === "owner" ? null : projectedKey,
    createdAt: edge.createdAt.toISOString(),
  });
}

function directRealtimeEvent(event: ClaimedOutboxEvent, envelope: DurableEnvelope): GraphRealtimeEvent | null {
  if (event.eventType !== DIRECT_REALTIME_EVENT_TYPE) return null;
  const candidate = record(envelope.payload.realtimeEvent);
  if (!candidate) throw new Error("graph.realtime.v1 requires a realtimeEvent object.");
  return graphRealtimeEventSchema.parse({
    ...candidate,
    eventId: envelope.eventId,
    schemaVersion: GRAPH_REALTIME_SCHEMA_VERSION,
    occurredAt: envelope.occurredAt,
  });
}

async function mapGraphEvents(
  database: PrismaClient,
  event: ClaimedOutboxEvent,
  envelope: DurableEnvelope,
): Promise<readonly GraphRealtimeEvent[]> {
  const direct = directRealtimeEvent(event, envelope);
  if (direct) return [direct];

  switch (event.eventType) {
    case "client.created":
    case "client.recovered": {
      const node = await clientNode(database, event.aggregateId);
      return node ? [nodeCreated(envelope.eventId, envelope.occurredAt, node)] : [];
    }
    case "client.updated": {
      const node = await clientNode(database, event.aggregateId);
      return node ? [nodeUpdated(envelope.eventId, envelope.occurredAt, node)] : [];
    }
    case "client.archived":
    case "client.deleted": {
      const node = await graphNodeIdentity(database, `client:${event.aggregateId}`);
      return node ? [nodeDeleted(envelope.eventId, envelope.occurredAt, node)] : [];
    }
    case "contact.created": {
      const [node, edge] = await Promise.all([
        contactNode(database, event.aggregateId),
        contactOwnershipEdge(database, event.aggregateId),
      ]);
      if (!node) return [];
      return [
        nodeCreated(envelope.eventId, envelope.occurredAt, node),
        ...(edge ? [graphRealtimeEventSchema.parse({
          eventId: childEventId(envelope.eventId, "ownership"),
          schemaVersion: GRAPH_REALTIME_SCHEMA_VERSION,
          occurredAt: envelope.occurredAt,
          channel: "graph:updates",
          event: "edge_created",
          payload: { edge },
        })] : []),
      ];
    }
    case "contact.updated": {
      const node = await contactNode(database, event.aggregateId);
      if (node) return [nodeUpdated(envelope.eventId, envelope.occurredAt, node)];
      const identity = await graphNodeIdentity(database, `contact:${event.aggregateId}`);
      return identity ? [nodeDeleted(envelope.eventId, envelope.occurredAt, identity)] : [];
    }
    case "contact.deleted": {
      const node = await graphNodeIdentity(database, `contact:${event.aggregateId}`);
      return node ? [nodeDeleted(envelope.eventId, envelope.occurredAt, node)] : [];
    }
    default:
      return [];
  }
}

/**
 * Maps only reviewed durable contracts. Raw source payloads are never forwarded;
 * source events are rebuilt from the authoritative graph/domain rows instead.
 */
export class DurableGraphRealtimeMapper {
  constructor(private readonly database: PrismaClient) {}

  async map(event: ClaimedOutboxEvent): Promise<readonly OwnerScopedRealtimeBroadcast[]> {
    const supported = [
      "client.created",
      "client.updated",
      "client.archived",
      "client.recovered",
      "client.deleted",
      "contact.created",
      "contact.updated",
      "contact.deleted",
    ].includes(event.eventType)
      || event.eventType === DIRECT_REALTIME_EVENT_TYPE;
    if (!supported) return [];

    const envelope = durableEnvelope(event);
    const realtimeEvents = await mapGraphEvents(this.database, event, envelope);
    if (realtimeEvents.length === 0) return [];
    const owner = await this.database.ownerAccount.findFirst({
      where: { id: envelope.ownerId, active: true },
      select: { authSubject: true },
    });
    if (!owner) throw new Error("Realtime event owner is missing or inactive.");
    return realtimeEvents.map((realtimeEvent) => ({
      ownerAuthSubject: owner.authSubject,
      event: realtimeEvent,
    }));
  }
}
