import { describe, expect, it } from "vitest";
import {
  GRAPH_NODE_VISUALS,
  agentRunCompletedEventSchema,
  agentRunFailedEventSchema,
  agentStatusChangedEventSchema,
  edgeDataSchema,
  financePaymentReceivedEventSchema,
  graphDirectoryResponseSchema,
  graphEdgeCreateInputSchema,
  graphEdgeDeleteInputSchema,
  graphEdgeListQuerySchema,
  graphEdgeTypes,
  graphNotificationEventSchema,
  graphNodeDetailSchema,
  graphNodeListQuerySchema,
  graphNodeTypes,
  graphRealtimeEventSchema,
  graphResponseSchema,
  graphSearchResponseSchema,
  hubKeys,
  lensFiltersSchema,
  lensUrlSearchParamsSchema,
  nodeDataSchema,
  type NodeData,
} from "@aios/contracts";

const occurredAt = "2026-08-01T12:00:00.000Z";
const graphId = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const entityId = (suffix: number) => `10000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const base = (index: number, stableKey: string, label: string, hubKey: "clients" | "agents" | "tools" | "knowledge" | "finance" = "clients") => ({
  id: graphId(index),
  stableKey,
  entityId: entityId(index),
  label,
  summary: `${label} summary`,
  status: "active",
  action: "active_running" as const,
  tags: ["example"],
  hubKeys: [hubKey],
  position: null,
});

const nodes: NodeData[] = [
  nodeDataSchema.parse({ ...base(1, `client:${entityId(1)}`, "Acme Dental"), type: "client", metadata: { name: "Acme Dental", industry: "Dental", mrr: 5_000, status: "active", startDate: "2026-01-01", projectsCount: 2 } }),
  nodeDataSchema.parse({ ...base(2, `agent:${entityId(2)}`, "Chatbot Builder", "agents"), type: "ai_agent", metadata: { name: "Chatbot Builder", status: "running", lastRun: occurredAt, tasksCompleted: 42 } }),
  nodeDataSchema.parse({ ...base(3, `tool:${entityId(3)}`, "OpenAI", "tools"), type: "tool", metadata: { name: "OpenAI", category: "AI", connectionStatus: "connected", lastSync: occurredAt } }),
  nodeDataSchema.parse({ ...base(4, `sop:${entityId(4)}`, "Onboarding SOP", "knowledge"), type: "sop", metadata: { title: "Onboarding SOP", lastUpdated: occurredAt, stepsCount: 7, linkedClientIds: [graphId(1)] } }),
  nodeDataSchema.parse({ ...base(5, `contact:${entityId(5)}`, "John"), type: "human_contact", metadata: { name: "John", role: "Owner", company: "Acme Dental", email: "john@example.com", lastContact: occurredAt } }),
  nodeDataSchema.parse({ ...base(6, `task:${entityId(6)}`, "Build chatbot"), type: "task", metadata: { title: "Build chatbot", status: "in_progress", dueDate: "2026-08-01", assignedAgentId: graphId(2), assignedPersonId: null } }),
  nodeDataSchema.parse({ ...base(7, `decision:${entityId(7)}`, "Use Claude", "knowledge"), type: "decision", metadata: { title: "Use Claude", date: "2026-08-01", rationale: "Better fit", outcome: null } }),
  nodeDataSchema.parse({ ...base(8, `knowledge:${entityId(8)}`, "Brand voice", "knowledge"), type: "knowledge_memory", metadata: { title: "Brand voice", category: "Brand", lastAccessed: occurredAt, wordCount: 900 } }),
  nodeDataSchema.parse({ ...base(9, `invoice:${entityId(9)}`, "Acme invoice", "finance"), type: "revenue_finance", metadata: { amount: 5_000, type: "income", date: "2026-08-01", clientId: graphId(1), status: "paid" } }),
  nodeDataSchema.parse({ id: "02ed5eda-41d1-52f4-b272-d030255b4b6f", stableKey: "hub:clients", entityId: null, label: "Clients", summary: "Clients summary", status: null, action: null, tags: [], hubKeys: [], position: null, type: "hub", metadata: { hubKey: "clients", name: "Clients", entityCount: 3, summaryStat: "$5,000 MRR" } }),
];

const ownerEdge = edgeDataSchema.parse({
  id: "edge:1",
  type: "assignment",
  sourceNodeId: graphId(2),
  targetNodeId: graphId(1),
  label: "Assigned to",
  origin: "owner",
  projectionKey: null,
  createdAt: occurredAt,
});
const eventBase = { eventId: "event:1", schemaVersion: 1 as const, occurredAt };

function expectedRealtimeEvents() {
  const clientIdentity = { nodeId: graphId(1), stableKey: `client:${entityId(1)}`, entityId: entityId(1) };
  return [
    { ...eventBase, channel: "graph:updates", event: "node_created", payload: { node: nodes[0] } },
    { ...eventBase, eventId: "event:2", channel: "graph:updates", event: "node_updated", payload: { ...clientIdentity, changes: { status: "paused" } } },
    { ...eventBase, eventId: "event:3", channel: "graph:updates", event: "node_deleted", payload: clientIdentity },
    { ...eventBase, eventId: "event:4", channel: "graph:updates", event: "edge_created", payload: { edge: ownerEdge } },
    { ...eventBase, eventId: "event:5", channel: "graph:updates", event: "edge_deleted", payload: { edgeId: "edge:1" } },
    { ...eventBase, eventId: "event:6", channel: "agent:status", event: "status_changed", payload: { agentId: graphId(2), status: "running", message: "Processing" } },
    { ...eventBase, eventId: "event:7", channel: "agent:status", event: "run_completed", payload: { agentId: graphId(2), runId: "run:1", summary: "Completed successfully" } },
    { ...eventBase, eventId: "event:8", channel: "agent:status", event: "run_failed", payload: { agentId: graphId(2), runId: "run:1", error: "Provider unavailable" } },
    { ...eventBase, eventId: "event:9", channel: "finance:updates", event: "payment_received", payload: { invoiceId: graphId(9), amount: 5_000 } },
    { ...eventBase, eventId: "event:10", channel: "notifications:new", event: "notification", payload: { notification: { id: "notification:1", title: "Run failed", message: "Review the run", severity: "error", relatedNodeId: graphId(2), createdAt: occurredAt } } },
  ];
}

describe("graph node and edge contracts", () => {
  it("keeps persistent graph, stable projection, and source business identities separate", () => {
    const client = nodes[0]!;
    expect(client).toMatchObject({ id: graphId(1), stableKey: `client:${entityId(1)}`, entityId: entityId(1) });
    expect(new Set([client.id, client.stableKey, client.entityId])).toHaveLength(3);
    expect(nodes[9]).toMatchObject({ id: "02ed5eda-41d1-52f4-b272-d030255b4b6f", stableKey: "hub:clients", entityId: null });
    expect(nodeDataSchema.safeParse({ ...client, id: client.stableKey }).success).toBe(false);
    expect(nodeDataSchema.safeParse({ ...client, entityId: null }).success).toBe(false);
  });

  it("defines all ten exact SRS node variants with strict metadata", () => {
    expect(graphNodeTypes).toHaveLength(10);
    expect(nodes.map((node) => node.type)).toEqual(graphNodeTypes);
    expect(Object.keys(GRAPH_NODE_VISUALS)).toEqual(graphNodeTypes);
    expect(nodeDataSchema.safeParse({ ...nodes[0], metadata: nodes[1]!.metadata }).success).toBe(false);
    expect(nodeDataSchema.safeParse({ ...nodes[0], metadata: { ...nodes[0]!.metadata, secret: "must-not-pass" } }).success).toBe(false);
  });

  it("defines all seven relationships and requires graph UUID endpoints", () => {
    expect(graphEdgeTypes).toEqual(["ownership", "assignment", "data_flow", "dependency", "trigger", "reference", "financial"]);
    expect(edgeDataSchema.safeParse({ ...ownerEdge, sourceNodeId: nodes[1]!.stableKey }).success).toBe(false);
    expect(edgeDataSchema.safeParse({ ...ownerEdge, origin: "projection", projectionKey: null }).success).toBe(false);
    expect(edgeDataSchema.safeParse({ ...ownerEdge, targetNodeId: ownerEdge.sourceNodeId }).success).toBe(false);
  });
});

describe("graph API read and write contracts", () => {
  it("validates graph, list, detail, search, and identity-complete directory responses", () => {
    expect(graphResponseSchema.parse({ nodes, edges: [ownerEdge], generatedAt: occurredAt, revision: "revision:1" }).nodes).toHaveLength(10);
    expect(graphNodeListQuerySchema.parse({ limit: "100", types: ["client"], hubs: ["clients"] }).limit).toBe(100);
    expect(graphEdgeListQuerySchema.parse({ types: ["assignment"], nodeId: graphId(1) }).limit).toBe(25);
    expect(graphNodeDetailSchema.parse({ node: nodes[0], connections: [{ edge: ownerEdge, node: nodes[1], direction: "incoming" }] }).connections).toHaveLength(1);
    expect(graphSearchResponseSchema.parse({ query: "acme", total: 1, results: [{ node: nodes[0], score: 0.95, matchedFields: ["label", "tag"] }] }).total).toBe(1);
    expect(graphDirectoryResponseSchema.parse({ total: 1, groups: [{ key: "clients", label: "Clients", count: 1, items: [{ nodeId: graphId(1), stableKey: nodes[0]!.stableKey, entityId: entityId(1), label: "Acme Dental", nodeType: "client", status: "active", statusLabel: "Active", secondaryLabel: "$5,000 MRR", hubKeys: ["clients"], sortValue: 5_000 }] }] }).total).toBe(1);
  });

  it("accepts only graph UUID edge endpoints", () => {
    expect(graphEdgeCreateInputSchema.parse({ sourceNodeId: graphId(2), targetNodeId: graphId(1), type: "assignment" }).label).toBeNull();
    expect(graphEdgeCreateInputSchema.safeParse({ sourceNodeId: nodes[1]!.stableKey, targetNodeId: nodes[0]!.stableKey, type: "assignment" }).success).toBe(false);
    expect(graphEdgeCreateInputSchema.safeParse({ sourceNodeId: graphId(2), targetNodeId: graphId(2), type: "assignment" }).success).toBe(false);
    expect(graphEdgeDeleteInputSchema.safeParse({ id: "edge:1", force: true }).success).toBe(false);
  });
});

describe("LENS and realtime contracts", () => {
  it("accepts only canonical LENS choices and all nine hub keys", () => {
    expect(hubKeys).toHaveLength(9);
    expect(lensFiltersSchema.parse({})).toEqual({ entity: "all", function: "all", action: "all" });
    expect(lensUrlSearchParamsSchema.safeParse({ entity: "decision", function: "tools" }).success).toBe(true);
    expect(lensUrlSearchParamsSchema.safeParse({ entity: "not_real" }).success).toBe(false);
  });

  it("accepts exact realtime identities and rejects mismatches", () => {
    const events = expectedRealtimeEvents();
    expect(events.every((event) => graphRealtimeEventSchema.safeParse(event).success)).toBe(true);
    expect(agentStatusChangedEventSchema.safeParse(events[5]).success).toBe(true);
    expect(agentRunCompletedEventSchema.safeParse(events[6]).success).toBe(true);
    expect(agentRunFailedEventSchema.safeParse(events[7]).success).toBe(true);
    expect(financePaymentReceivedEventSchema.safeParse(events[8]).success).toBe(true);
    expect(graphNotificationEventSchema.safeParse(events[9]).success).toBe(true);
    expect(graphRealtimeEventSchema.safeParse({ ...events[1], payload: { nodeId: graphId(1), changes: {} } }).success).toBe(false);
  });
});
