import { edgeDataSchema, nodeDataSchema, type EdgeData, type NodeData } from "@aios/contracts";

export const TEST_NOW = "2026-08-01T12:00:00.000Z";
export const CLIENT_GRAPH_ID = "00000000-0000-4000-8000-000000000101";
export const CLIENT_ENTITY_ID = "00000000-0000-4000-8000-000000000201";
export const AGENT_GRAPH_ID = "00000000-0000-4000-8000-000000000102";
export const AGENT_ENTITY_ID = "00000000-0000-4000-8000-000000000202";
export const TASK_GRAPH_ID = "00000000-0000-4000-8000-000000000103";
export const TASK_ENTITY_ID = "00000000-0000-4000-8000-000000000203";
export const INVOICE_GRAPH_ID = "00000000-0000-4000-8000-000000000104";
export const INVOICE_ENTITY_ID = "00000000-0000-4000-8000-000000000204";
export const CLIENTS_HUB_GRAPH_ID = "02ed5eda-41d1-52f4-b272-d030255b4b6f";

export function makeClient(overrides: Record<string, unknown> = {}): NodeData {
  return nodeDataSchema.parse({
    id: CLIENT_GRAPH_ID,
    stableKey: `client:${CLIENT_ENTITY_ID}`,
    entityId: CLIENT_ENTITY_ID,
    type: "client",
    label: "Acme Dental",
    summary: "Active dental client",
    status: "active",
    action: "active_running",
    tags: ["dental", "retainer"],
    hubKeys: ["clients"],
    position: null,
    metadata: { name: "Acme Dental", industry: "Dental", mrr: 5_000, status: "active", startDate: "2026-01-01", projectsCount: 2 },
    ...overrides,
  });
}

export function makeAgent(overrides: Record<string, unknown> = {}): NodeData {
  return nodeDataSchema.parse({
    id: AGENT_GRAPH_ID,
    stableKey: `agent:${AGENT_ENTITY_ID}`,
    entityId: AGENT_ENTITY_ID,
    type: "ai_agent",
    label: "Chatbot Builder",
    summary: "Builds client chatbots",
    status: "idle",
    action: null,
    tags: ["chatbot"],
    hubKeys: ["agents", "clients"],
    position: null,
    metadata: { name: "Chatbot Builder", status: "idle", lastRun: TEST_NOW, tasksCompleted: 12 },
    ...overrides,
  });
}

export function makeTask(overrides: Record<string, unknown> = {}): NodeData {
  return nodeDataSchema.parse({
    id: TASK_GRAPH_ID,
    stableKey: `task:${TASK_ENTITY_ID}`,
    entityId: TASK_ENTITY_ID,
    type: "task",
    label: "Build chatbot",
    summary: "Client delivery task",
    status: "blocked",
    action: "blocked",
    tags: ["delivery"],
    hubKeys: ["clients", "automations"],
    position: null,
    metadata: { title: "Build chatbot", status: "blocked", dueDate: "2026-08-01", assignedAgentId: AGENT_GRAPH_ID, assignedPersonId: null },
    ...overrides,
  });
}

export function makeInvoice(overrides: Record<string, unknown> = {}): NodeData {
  return nodeDataSchema.parse({
    id: INVOICE_GRAPH_ID,
    stableKey: `invoice:${INVOICE_ENTITY_ID}`,
    entityId: INVOICE_ENTITY_ID,
    type: "revenue_finance",
    label: "Acme invoice",
    summary: "August invoice",
    status: "sent",
    action: "pending",
    tags: ["invoice"],
    hubKeys: ["finance"],
    position: null,
    metadata: { amount: 5_000, type: "income", date: "2026-08-01", clientId: CLIENT_GRAPH_ID, status: "sent" },
    ...overrides,
  });
}

export function makeHub(overrides: Record<string, unknown> = {}): NodeData {
  return nodeDataSchema.parse({
    id: CLIENTS_HUB_GRAPH_ID,
    stableKey: "hub:clients",
    entityId: null,
    type: "hub",
    label: "Clients",
    summary: "Client relationships",
    status: null,
    action: null,
    tags: [],
    hubKeys: [],
    position: null,
    metadata: { hubKey: "clients", name: "Clients", entityCount: 2, summaryStat: "$5,000 MRR" },
    ...overrides,
  });
}

export function makeEdge(overrides: Record<string, unknown> = {}): EdgeData {
  return edgeDataSchema.parse({
    id: "edge:1",
    type: "assignment",
    sourceNodeId: AGENT_GRAPH_ID,
    targetNodeId: CLIENT_GRAPH_ID,
    label: "Assigned to",
    origin: "owner",
    projectionKey: null,
    createdAt: TEST_NOW,
    ...overrides,
  });
}
