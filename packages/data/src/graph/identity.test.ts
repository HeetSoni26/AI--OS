import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/client/client";
import { ClientStatus, GraphEdgeProvenance, GraphEdgeType, GraphNodeType } from "../generated/client/enums";
import type { OwnerIdentity } from "../clients/types";
import { createHubNode, projectGraphEdge, projectGraphNode, type GraphNodeRow, type GraphSourceIndex } from "./mappers";
import { createGraphService } from "./service";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OWNER_SUBJECT = "00000000-0000-4000-8000-000000000002";
const CLIENT_GRAPH_ID = "00000000-0000-4000-8000-000000000101";
const CLIENT_ENTITY_ID = "00000000-0000-4000-8000-000000000201";
const CLIENTS_HUB_ID = "02ed5eda-41d1-52f4-b272-d030255b4b6f";
const STORED_EDGE_ID = "00000000-0000-4000-8000-000000000301";
const CREATED_EDGE_ID = "00000000-0000-4000-8000-000000000302";

const identity: OwnerIdentity = {
  ownerAccountId: OWNER_ID,
  ownerSubject: OWNER_SUBJECT,
  correlationId: "graph:identity:test",
};

const clientRow: GraphNodeRow = {
  id: CLIENT_GRAPH_ID,
  type: GraphNodeType.CLIENT,
  entityId: CLIENT_ENTITY_ID,
  stableKey: `client:${CLIENT_ENTITY_ID}`,
  label: "Acme",
  metadata: {},
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
  deletedAt: null,
};
const hubRow: GraphNodeRow = {
  id: CLIENTS_HUB_ID,
  type: GraphNodeType.HUB,
  entityId: null,
  stableKey: "hub:clients",
  label: "Clients",
  metadata: {},
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
  deletedAt: null,
};
const clientSource = {
  id: CLIENT_ENTITY_ID,
  name: "Acme",
  industry: "Services",
  status: ClientStatus.ACTIVE,
  mrr: { toNumber: () => 1_250 },
  startDate: new Date("2026-01-02T00:00:00.000Z"),
  archivedAt: null,
  deletedAt: null,
  _count: { projects: 2 },
};

function sourceIndex(): GraphSourceIndex {
  return {
    clients: new Map([[CLIENT_ENTITY_ID, clientSource]]) as GraphSourceIndex["clients"],
    contacts: new Map(),
    tasks: new Map(),
    agents: new Map(),
    tools: new Map(),
    sops: new Map(),
    knowledge: new Map(),
    invoices: new Map(),
    expenses: new Map(),
    graphNodeIdByEntity: new Map([[CLIENT_ENTITY_ID, CLIENT_GRAPH_ID]]),
  };
}

function fakeDatabase(storedEdges: readonly Record<string, unknown>[] = []) {
  const auditRows: Record<string, unknown>[] = [];
  const outboxRows: Record<string, unknown>[] = [];
  const createdEdges: Record<string, unknown>[] = [];
  const database = {
    ownerAccount: {
      findFirst: vi.fn().mockResolvedValue({ id: OWNER_ID, authSubject: OWNER_SUBJECT }),
    },
    graphNode: {
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
        if (args.where.type === GraphNodeType.HUB) return [hubRow];
        if (typeof args.where.type === "object") return [clientRow];
        if (typeof args.where.id === "object") return [hubRow, clientRow];
        return [];
      }),
    },
    client: {
      findMany: vi.fn().mockResolvedValue([clientSource]),
    },
    graphEdge: {
      findMany: vi.fn().mockResolvedValue(storedEdges),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const row = { id: CREATED_EDGE_ID, ...args.data, createdAt: NOW, updatedAt: NOW, archivedAt: null, deletedAt: null };
        createdEdges.push(row);
        return row;
      }),
    },
    auditEvent: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        auditRows.push(args.data);
        return args.data;
      }),
    },
    outboxEvent: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        outboxRows.push(args.data);
        return args.data;
      }),
    },
  };
  const transaction = database as unknown as PrismaClient;
  Object.assign(database, { $transaction: (operation: (tx: PrismaClient) => Promise<unknown>) => operation(transaction) });
  return { database: database as unknown as PrismaClient, mocks: database, auditRows, outboxRows, createdEdges };
}

describe("graph identity materialization", () => {
  it("projects source and hub identities without collapsing graph UUIDs into stable keys", () => {
    const projected = projectGraphNode(clientRow, sourceIndex());
    expect(projected?.node).toMatchObject({
      id: CLIENT_GRAPH_ID,
      stableKey: `client:${CLIENT_ENTITY_ID}`,
      entityId: CLIENT_ENTITY_ID,
      type: "client",
    });
    expect(new Set([projected?.node.id, projected?.node.stableKey, projected?.node.entityId])).toHaveLength(3);

    const hub = createHubNode(hubRow, projected ? [projected.node] : []);
    expect(hub?.node).toMatchObject({ id: CLIENTS_HUB_ID, stableKey: "hub:clients", entityId: null, type: "hub" });
  });

  it("projects stored edge endpoints as graph UUIDs and preserves the authoritative projection key", () => {
    const edge = projectGraphEdge({
      id: STORED_EDGE_ID,
      sourceId: CLIENTS_HUB_ID,
      targetId: CLIENT_GRAPH_ID,
      edgeType: GraphEdgeType.OWNERSHIP,
      provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
      label: "contains",
      metadata: { projectionKey: "clients.core" },
      createdAt: NOW,
    }, new Set([CLIENTS_HUB_ID, CLIENT_GRAPH_ID]));
    expect(edge).toMatchObject({
      sourceNodeId: CLIENTS_HUB_ID,
      targetNodeId: CLIENT_GRAPH_ID,
      origin: "projection",
      projectionKey: "clients.core",
    });
    expect(projectGraphEdge({
      id: STORED_EDGE_ID,
      sourceId: CLIENTS_HUB_ID,
      targetId: CLIENT_GRAPH_ID,
      edgeType: GraphEdgeType.OWNERSHIP,
      provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
      label: null,
      metadata: {},
      createdAt: NOW,
    }, new Set([CLIENTS_HUB_ID, CLIENT_GRAPH_ID]))).toBeNull();
  });
});

describe("PrismaGraphService graph UUID semantics", () => {
  it("loads stored edges, directory items, and details with exact graph identities", async () => {
    const storedEdge = {
      id: STORED_EDGE_ID,
      sourceId: CLIENTS_HUB_ID,
      targetId: CLIENT_GRAPH_ID,
      edgeType: GraphEdgeType.OWNERSHIP,
      provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
      label: "contains",
      metadata: { projectionVersion: 1, projectionKey: "clients.core" },
      createdAt: NOW,
    };
    const { database } = fakeDatabase([storedEdge]);
    const service = createGraphService(database);

    const graph = await service.getCompleteGraph(identity);
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: CLIENT_GRAPH_ID, stableKey: `client:${CLIENT_ENTITY_ID}`, entityId: CLIENT_ENTITY_ID }),
      expect.objectContaining({ id: CLIENTS_HUB_ID, stableKey: "hub:clients", entityId: null }),
    ]));
    expect(graph.edges).toContainEqual(expect.objectContaining({ id: STORED_EDGE_ID, sourceNodeId: CLIENTS_HUB_ID, targetNodeId: CLIENT_GRAPH_ID, projectionKey: "clients.core" }));

    const detail = await service.getNodeDetail(identity, CLIENT_GRAPH_ID);
    expect(detail.node).toMatchObject({ id: CLIENT_GRAPH_ID, stableKey: `client:${CLIENT_ENTITY_ID}`, entityId: CLIENT_ENTITY_ID });
    const directory = await service.getDirectory(identity, { groups: ["clients"] });
    expect(directory.groups[0]?.items[0]).toMatchObject({ nodeId: CLIENT_GRAPH_ID, stableKey: `client:${CLIENT_ENTITY_ID}`, entityId: CLIENT_ENTITY_ID });
  });

  it("queries and creates owner edges by graph UUID and emits the accepted PII-free durable envelope", async () => {
    const { database, mocks, outboxRows, createdEdges } = fakeDatabase();
    const service = createGraphService(database);
    const sensitiveLabel = "Private owner note";

    const edge = await service.createEdge(identity, {
      sourceNodeId: CLIENTS_HUB_ID,
      targetNodeId: CLIENT_GRAPH_ID,
      type: "data_flow",
      label: sensitiveLabel,
    });

    expect(edge).toMatchObject({ id: CREATED_EDGE_ID, sourceNodeId: CLIENTS_HUB_ID, targetNodeId: CLIENT_GRAPH_ID, label: sensitiveLabel });
    expect(mocks.graphNode.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [CLIENTS_HUB_ID, CLIENT_GRAPH_ID] }, archivedAt: null, deletedAt: null },
    }));
    expect(createdEdges[0]).toMatchObject({ sourceId: CLIENTS_HUB_ID, targetId: CLIENT_GRAPH_ID });
    expect(outboxRows[0]).toMatchObject({
      aggregateType: "graph_edge",
      aggregateId: CREATED_EDGE_ID,
      eventType: "graph.realtime.v1",
      payload: {
        schemaVersion: 1,
        ownerId: OWNER_ID,
        payload: { realtimeEvent: { event: "edge_created", payload: { edge: { id: CREATED_EDGE_ID, sourceNodeId: CLIENTS_HUB_ID, targetNodeId: CLIENT_GRAPH_ID, label: null } } } },
      },
    });
    expect(JSON.stringify(outboxRows[0])).not.toContain(sensitiveLabel);
  });
});
