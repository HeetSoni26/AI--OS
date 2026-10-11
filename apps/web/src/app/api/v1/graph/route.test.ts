import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class GraphOperationsError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly details?: Readonly<Record<string, unknown>>,
    ) {
      super(message);
      this.name = "GraphOperationsError";
    }
  }
  return {
    createGraphService: vi.fn(),
    getDatabaseClient: vi.fn(),
    getOwner: vi.fn(),
    GraphOperationsError,
    IdempotencyStatus: { PROCESSING: "PROCESSING", COMPLETED: "COMPLETED", FAILED: "FAILED" },
  };
});

vi.mock("@aios/data", () => ({
  createGraphService: mocks.createGraphService,
  getDatabaseClient: mocks.getDatabaseClient,
  GraphOperationsError: mocks.GraphOperationsError,
  IdempotencyStatus: mocks.IdempotencyStatus,
}));
vi.mock("@/lib/auth/guards", () => ({ getOwner: mocks.getOwner }));

import { GraphOperationsError, IdempotencyStatus } from "@aios/data";
import { resetMemoryApiRateLimits } from "@/lib/api/rate-limit";
import { GET as getGraph, OPTIONS as optionsGraph } from "./route";
import { GET as getDirectory, OPTIONS as optionsDirectory } from "./directory/route";
import { GET as listNodes, OPTIONS as optionsNodes } from "./nodes/route";
import { GET as getNode, OPTIONS as optionsNode } from "./nodes/[nodeId]/route";
import { GET as listEdges, OPTIONS as optionsEdges, POST as createEdge } from "./edges/route";
import { DELETE as deleteEdge, OPTIONS as optionsEdge } from "./edges/[edgeId]/route";
import { GET as searchGraph, OPTIONS as optionsSearch } from "./search/route";

const owner = { id: "7db01860-09c9-42c4-b993-283c5cfeb9d6", email: "owner@example.com", displayName: "Owner" };
const ownerRow = { id: "3f7760fe-b5c3-4f59-b1e0-884181ed99b3", authSubject: owner.id };
const nodeId = "e11791d8-d71f-4ea9-a2e2-46bbeb10618d";
const entityId = "89d555ac-adc8-4887-8703-dc519db7f528";
const targetNodeId = "65175aad-eeb1-452b-9a33-736b99e02972";
const edgeId = "7d31b783-df4b-4f82-b9c9-7f29d236299f";
const node = {
  id: nodeId,
  stableKey: `client:${entityId}`,
  entityId,
  type: "client" as const,
  label: "Acme Automation",
  summary: "Automation client",
  status: "active",
  action: "active_running" as const,
  tags: ["priority"],
  hubKeys: ["clients" as const],
  position: null,
  metadata: {
    name: "Acme Automation",
    industry: "Automation",
    mrr: 1250,
    status: "active" as const,
    startDate: "2026-07-01",
    projectsCount: 2,
  },
};
const edge = {
  id: edgeId,
  type: "assignment" as const,
  sourceNodeId: nodeId,
  targetNodeId,
  label: "owns",
  origin: "owner" as const,
  projectionKey: null,
  createdAt: "2026-08-01T10:00:00.000Z",
};
const directory = {
  groups: [{
    key: "clients" as const,
    label: "Clients",
    count: 1,
    items: [{
      nodeId,
      stableKey: node.stableKey,
      entityId,
      label: node.label,
      nodeType: node.type,
      status: node.status,
      statusLabel: "Active",
      secondaryLabel: "$1,250 MRR",
      hubKeys: node.hubKeys,
      sortValue: 1250,
    }],
  }],
  total: 1,
};

function request(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", "Bearer test-token");
  headers.set("x-request-id", "req_graph_route");
  return new Request(url, { ...init, headers });
}

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

type IdempotencyRow = {
  id: string;
  ownerSubject: string;
  idempotencyKey: string;
  operation: string;
  requestFingerprint: string;
  status: string;
  responseBody: unknown;
  expiresAt: Date;
};

describe("/api/v1/graph secured HTTP routes", () => {
  const rows = new Map<string, IdempotencyRow>();
  const ownerAccount = { findFirst: vi.fn() };
  const idempotencyRecord = {
    findUnique: vi.fn(async ({ where }: { where: { ownerSubject_idempotencyKey_operation: { ownerSubject: string; idempotencyKey: string; operation: string } } }) => {
      const key = Object.values(where.ownerSubject_idempotencyKey_operation).join("\0");
      return rows.get(key) ?? null;
    }),
    create: vi.fn(async ({ data }: { data: Omit<IdempotencyRow, "id" | "status" | "responseBody"> }) => {
      const row = { id: crypto.randomUUID(), ...data, status: IdempotencyStatus.PROCESSING, responseBody: null };
      rows.set([row.ownerSubject, row.idempotencyKey, row.operation].join("\0"), row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<IdempotencyRow> }) => {
      const entry = [...rows.entries()].find(([, row]) => row.id === where.id);
      if (!entry) throw new Error("Missing idempotency row");
      const updated = { ...entry[1], ...data };
      rows.set(entry[0], updated);
      return updated;
    }),
  };
  const database = { ownerAccount, idempotencyRecord };
  const service = {
    getGraph: vi.fn(),
    getDirectory: vi.fn(),
    listNodes: vi.fn(),
    getNodeDetail: vi.fn(),
    listEdges: vi.fn(),
    createEdge: vi.fn(),
    deleteEdge: vi.fn(),
    search: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetMemoryApiRateLimits();
    rows.clear();
    mocks.getOwner.mockResolvedValue(owner);
    ownerAccount.findFirst.mockResolvedValue(ownerRow);
    mocks.getDatabaseClient.mockReturnValue(database);
    mocks.createGraphService.mockReturnValue(service);
    service.getGraph.mockResolvedValue({ nodes: [node], edges: [edge], generatedAt: "2026-08-01T10:00:00.000Z", revision: "graph-v1-1" });
    service.getDirectory.mockResolvedValue(directory);
    service.listNodes.mockResolvedValue({ nodes: [node], meta: { total: 1, cursor: null, hasMore: false } });
    service.getNodeDetail.mockResolvedValue({ node, connections: [] });
    service.listEdges.mockResolvedValue({ edges: [edge], meta: { total: 1, cursor: null, hasMore: false } });
    service.createEdge.mockResolvedValue(edge);
    service.deleteEdge.mockResolvedValue(edge);
    service.search.mockResolvedValue({ results: [{ node, score: 0.98, matchedFields: ["label"] }], query: "Acme", total: 1 });
  });

  it("returns the complete graph in a no-store envelope with request and rate-limit headers", async () => {
    const response = await getGraph(request("http://localhost/api/v1/graph"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("req_graph_route");
    expect(response.headers.get("x-ratelimit-limit")).toBeTruthy();
    expect(await response.json()).toMatchObject({ data: { nodes: [{ id: nodeId }], edges: [{ id: edgeId }] }, meta: { total: 1, requestId: "req_graph_route" } });
  });

  it("returns the searched directory with repeated and comma-delimited groups in the secured envelope", async () => {
    const response = await getDirectory(request(
      "http://localhost/api/v1/graph/directory?query=Acme&groups=clients,tools&groups=knowledge",
      { headers: { origin: "http://localhost:3000" } },
    ));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("req_graph_route");
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(service.getDirectory).toHaveBeenCalledWith(expect.objectContaining({ ownerAccountId: ownerRow.id }), {
      query: "Acme",
      groups: ["clients", "tools", "knowledge"],
    });
    expect(await response.json()).toMatchObject({
      data: { groups: [{ key: "clients", items: [{ nodeId }] }], total: 1 },
      meta: { total: 1, requestId: "req_graph_route" },
    });
  });

  it("rejects invalid directory groups and query values before service execution", async () => {
    const badGroup = await getDirectory(request("http://localhost/api/v1/graph/directory?groups=clients,unknown"));
    expect(badGroup.status).toBe(422);
    expect(await badGroup.json()).toMatchObject({ error: { code: "VALIDATION_FAILED", message: "Query parameters are invalid." } });

    const badQuery = await getDirectory(request(`http://localhost/api/v1/graph/directory?query=${"a".repeat(201)}`));
    expect(badQuery.status).toBe(422);
    expect(service.getDirectory).not.toHaveBeenCalled();
  });

  it("masks unexpected graph directory service failures", async () => {
    service.getDirectory.mockRejectedValueOnce(new Error("private graph table and connection details"));
    const response = await getDirectory(request("http://localhost/api/v1/graph/directory"));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("req_graph_route");
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." },
      meta: { requestId: "req_graph_route", apiVersion: "v1" },
    });
  });

  it("lists nodes with repeated and comma-delimited array filters and stable pagination metadata", async () => {
    const response = await listNodes(request("http://localhost/api/v1/graph/nodes?types=client,task&types=human_contact&hubs=clients&hubs=command&actions=active_running&actions=blocked&limit=10"));
    expect(response.status).toBe(200);
    expect(service.listNodes).toHaveBeenCalledWith(expect.objectContaining({ ownerAccountId: ownerRow.id }), {
      types: ["client", "task", "human_contact"],
      hubs: ["clients", "command"],
      actions: ["active_running", "blocked"],
      limit: 10,
    });
    expect(await response.json()).toMatchObject({ data: { meta: { total: 1, hasMore: false } }, meta: { total: 1, cursor: null, hasMore: false } });
  });

  it("rejects invalid node filters and cursors before graph service execution", async () => {
    const badFilter = await listNodes(request("http://localhost/api/v1/graph/nodes?types=unknown"));
    expect(badFilter.status).toBe(422);
    expect(await badFilter.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });

    const badCursor = await listNodes(request("http://localhost/api/v1/graph/nodes?cursor=%25%25%25"));
    expect(badCursor.status).toBe(422);
    expect(service.listNodes).not.toHaveBeenCalled();

    service.listNodes.mockRejectedValueOnce(new GraphOperationsError("INVALID_CURSOR", "private filter fingerprint"));
    const staleCursor = await listNodes(request("http://localhost/api/v1/graph/nodes?cursor=YWJj"));
    expect(staleCursor.status).toBe(422);
    expect(await staleCursor.json()).toMatchObject({ error: { code: "INVALID_CURSOR", message: "The graph cursor is invalid or does not match the active filters." } });
  });

  it("gets node detail and rejects an invalid UUID or missing node safely", async () => {
    const success = await getNode(request(`http://localhost/api/v1/graph/nodes/${nodeId}`), context({ nodeId }));
    expect(success.status).toBe(200);
    expect(await success.json()).toMatchObject({ data: { node: { id: nodeId }, connections: [] } });

    const invalid = await getNode(request("http://localhost/api/v1/graph/nodes/not-a-uuid"), context({ nodeId: "not-a-uuid" }));
    expect(invalid.status).toBe(422);

    service.getNodeDetail.mockRejectedValueOnce(new GraphOperationsError("NOT_FOUND", "database table private_graph leaked"));
    const missing = await getNode(request(`http://localhost/api/v1/graph/nodes/${nodeId}`), context({ nodeId }));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: "NOT_FOUND", message: "The requested graph resource was not found." } });
  });

  it("lists edges with array filters and rejects a bad node UUID", async () => {
    const response = await listEdges(request(`http://localhost/api/v1/graph/edges?types=assignment&types=dependency&nodeId=${nodeId}`));
    expect(response.status).toBe(200);
    expect(service.listEdges).toHaveBeenCalledWith(expect.any(Object), { types: ["assignment", "dependency"], nodeId, limit: 25 });

    const invalid = await listEdges(request("http://localhost/api/v1/graph/edges?nodeId=bad"));
    expect(invalid.status).toBe(422);
  });

  it("validates edge bodies and maps invalid and duplicate edge failures safely", async () => {
    const malformed = await createEdge(request("http://localhost/api/v1/graph/edges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceNodeId: nodeId, targetNodeId: nodeId, type: "assignment" }),
    }));
    expect(malformed.status).toBe(422);
    expect(service.createEdge).not.toHaveBeenCalled();

    service.createEdge.mockRejectedValueOnce(new GraphOperationsError("INVALID_ENDPOINT_TYPES", "internal endpoint details"));
    const invalid = await createEdge(request("http://localhost/api/v1/graph/edges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceNodeId: nodeId, targetNodeId, type: "assignment" }),
    }));
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({ error: { code: "INVALID_ENDPOINT_TYPES", message: "The graph relationship does not support those endpoint types." } });

    service.createEdge.mockRejectedValueOnce(new GraphOperationsError("DUPLICATE_EDGE", "private duplicate diagnostics"));
    const duplicate = await createEdge(request("http://localhost/api/v1/graph/edges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceNodeId: nodeId, targetNodeId, type: "assignment" }),
    }));
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ error: { code: "DUPLICATE_EDGE", message: "That graph relationship already exists." } });
  });

  it("creates an edge once and replays the completed POST for the same idempotency key", async () => {
    const init = {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "graph_edge_create_001" },
      body: JSON.stringify({ sourceNodeId: nodeId, targetNodeId, type: "assignment", label: "owns" }),
    };
    const first = await createEdge(request("http://localhost/api/v1/graph/edges", init));
    const replay = await createEdge(request("http://localhost/api/v1/graph/edges", init));
    expect(first.status).toBe(201);
    expect(first.headers.get("idempotency-replayed")).toBe("false");
    expect(replay.status).toBe(200);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(service.createEdge).toHaveBeenCalledTimes(1);
  });

  it("deletes an edge once, replays DELETE, and rejects projected deletion safely", async () => {
    const init = { method: "DELETE", headers: { "idempotency-key": "graph_edge_delete_001" } };
    const first = await deleteEdge(request(`http://localhost/api/v1/graph/edges/${edgeId}`, init), context({ edgeId }));
    const replay = await deleteEdge(request(`http://localhost/api/v1/graph/edges/${edgeId}`, init), context({ edgeId }));
    expect(first.status).toBe(200);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(service.deleteEdge).toHaveBeenCalledTimes(1);

    service.deleteEdge.mockRejectedValueOnce(new GraphOperationsError("PROJECTED_EDGE_IMMUTABLE", "projection table details"));
    const projected = await deleteEdge(request(`http://localhost/api/v1/graph/edges/${edgeId}`, { method: "DELETE" }), context({ edgeId }));
    expect(projected.status).toBe(409);
    expect(await projected.json()).toMatchObject({ error: { code: "PROJECTED_EDGE_IMMUTABLE", message: "Projected graph relationships must be changed through their owning domain." } });
  });

  it("searches with normalized type arrays and validates required search input", async () => {
    const response = await searchGraph(request("http://localhost/api/v1/graph/search?query=Acme&types=client,task&limit=5"));
    expect(response.status).toBe(200);
    expect(service.search).toHaveBeenCalledWith(expect.any(Object), { query: "Acme", types: ["client", "task"], limit: 5 });
    expect(await response.json()).toMatchObject({ data: { query: "Acme", total: 1 }, meta: { total: 1 } });

    const invalid = await searchGraph(request("http://localhost/api/v1/graph/search?query=%20"));
    expect(invalid.status).toBe(422);
  });

  it("rejects cookie-authenticated graph mutations without a trusted origin", async () => {
    const response = await createEdge(new Request("http://localhost/api/v1/graph/edges", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "session=test" },
      body: JSON.stringify({ sourceNodeId: nodeId, targetNodeId, type: "assignment" }),
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "CSRF_REJECTED" } });
  });

  it("requires owner authentication for every graph operation before owner resolution", async () => {
    mocks.getOwner.mockResolvedValue(null);
    const calls = [
      () => getGraph(new Request("http://localhost/api/v1/graph")),
      () => getDirectory(new Request("http://localhost/api/v1/graph/directory")),
      () => listNodes(new Request("http://localhost/api/v1/graph/nodes")),
      () => getNode(new Request(`http://localhost/api/v1/graph/nodes/${nodeId}`), context({ nodeId })),
      () => listEdges(new Request("http://localhost/api/v1/graph/edges")),
      () => createEdge(new Request("http://localhost/api/v1/graph/edges", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })),
      () => deleteEdge(new Request(`http://localhost/api/v1/graph/edges/${edgeId}`, { method: "DELETE" }), context({ edgeId })),
      () => searchGraph(new Request("http://localhost/api/v1/graph/search?query=Acme")),
    ];
    for (const call of calls) {
      const response = await call();
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    }
    expect(ownerAccount.findFirst).not.toHaveBeenCalled();
  });

  it("serves exact unauthenticated CORS preflight methods for all graph routes", async () => {
    const specs = [
      { handler: optionsGraph, url: "http://localhost/api/v1/graph", method: "GET", allow: "GET, OPTIONS", routeContext: undefined },
      { handler: optionsDirectory, url: "http://localhost/api/v1/graph/directory", method: "GET", allow: "GET, OPTIONS", routeContext: undefined },
      { handler: optionsNodes, url: "http://localhost/api/v1/graph/nodes", method: "GET", allow: "GET, OPTIONS", routeContext: undefined },
      { handler: optionsNode, url: `http://localhost/api/v1/graph/nodes/${nodeId}`, method: "GET", allow: "GET, OPTIONS", routeContext: context({ nodeId }) },
      { handler: optionsEdges, url: "http://localhost/api/v1/graph/edges", method: "POST", allow: "GET, POST, OPTIONS", routeContext: undefined },
      { handler: optionsEdge, url: `http://localhost/api/v1/graph/edges/${edgeId}`, method: "DELETE", allow: "DELETE, OPTIONS", routeContext: context({ edgeId }) },
      { handler: optionsSearch, url: "http://localhost/api/v1/graph/search", method: "GET", allow: "GET, OPTIONS", routeContext: undefined },
    ];
    for (const spec of specs) {
      const preflight = new Request(spec.url, {
        method: "OPTIONS",
        headers: { origin: "http://localhost:3000", "access-control-request-method": spec.method },
      });
      const response = await spec.handler(preflight, spec.routeContext as never);
      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-methods")).toBe(spec.allow);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
});
