import {
  edgeDataSchema,
  nodeDataSchema,
  type EdgeData,
  type GraphActionState,
  type GraphEdgeType as ExternalGraphEdgeType,
  type GraphNodeType as ExternalGraphNodeType,
  type HubKey,
  type NodeData,
} from "@aios/contracts";
import { hubRegistry } from "@aios/graph";
import type { Prisma } from "../generated/client/client";
import {
  GraphEdgeProvenance,
  GraphEdgeType,
  GraphNodeType,
  type AgentStatus,
  type ClientStatus,
  type IntegrationStatus,
  type TaskStatus,
} from "../generated/client/enums";

export const GRAPH_PROJECTION_KEY_METADATA = "projectionKey" as const;

export const prismaNodeTypeToExternal = {
  [GraphNodeType.CLIENT]: "client",
  [GraphNodeType.AGENT]: "ai_agent",
  [GraphNodeType.TOOL]: "tool",
  [GraphNodeType.SOP]: "sop",
  [GraphNodeType.HUMAN]: "human_contact",
  [GraphNodeType.TASK]: "task",
  [GraphNodeType.DECISION]: "decision",
  [GraphNodeType.KNOWLEDGE]: "knowledge_memory",
  [GraphNodeType.FINANCE]: "revenue_finance",
  [GraphNodeType.HUB]: "hub",
} as const satisfies Record<GraphNodeType, ExternalGraphNodeType>;

export const externalNodeTypeToPrisma = Object.freeze(Object.fromEntries(
  Object.entries(prismaNodeTypeToExternal).map(([prismaType, externalType]) => [externalType, prismaType]),
) as Record<ExternalGraphNodeType, GraphNodeType>);

export const prismaEdgeTypeToExternal = {
  [GraphEdgeType.OWNERSHIP]: "ownership",
  [GraphEdgeType.ASSIGNMENT]: "assignment",
  [GraphEdgeType.DATA_FLOW]: "data_flow",
  [GraphEdgeType.DEPENDENCY]: "dependency",
  [GraphEdgeType.TRIGGER]: "trigger",
  [GraphEdgeType.REFERENCE]: "reference",
  [GraphEdgeType.FINANCIAL]: "financial",
} as const satisfies Record<GraphEdgeType, ExternalGraphEdgeType>;

export const externalEdgeTypeToPrisma = Object.freeze(Object.fromEntries(
  Object.entries(prismaEdgeTypeToExternal).map(([prismaType, externalType]) => [externalType, prismaType]),
) as Record<ExternalGraphEdgeType, GraphEdgeType>);

export interface GraphNodeRow {
  id: string;
  type: GraphNodeType;
  entityId: string | null;
  stableKey: string;
  label: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  deletedAt: Date | null;
}

export interface GraphEdgeRow {
  id: string;
  sourceId: string;
  targetId: string;
  edgeType: GraphEdgeType;
  provenance: GraphEdgeProvenance;
  label: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface ClientSource {
  id: string;
  name: string;
  industry: string | null;
  status: ClientStatus;
  mrr: Prisma.Decimal;
  startDate: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  _count: { projects: number };
}

export interface ContactSource {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  lastContactAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  client: { id: string; name: string; archivedAt: Date | null; deletedAt: Date | null };
}

export interface TaskSource {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  dueAt: Date | null;
  updatedAt: Date;
  archivedAt: Date | null;
  deletedAt: Date | null;
  project: {
    id: string;
    name: string;
    type: string;
    archivedAt: Date | null;
    deletedAt: Date | null;
    client: { id: string; name: string; archivedAt: Date | null; deletedAt: Date | null };
  };
  assignments: Array<{ assigneeType: string; agentId: string | null; ownerAccountId: string | null }>;
}

export interface AgentSource {
  id: string;
  name: string;
  type: string;
  status: AgentStatus;
  lastRunAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  _count: { runs: number };
}

export interface ToolSource {
  id: string;
  name: string;
  provider: string;
  status: IntegrationStatus;
  connectedAt: Date | null;
  lastHealthCheckAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  client: { archivedAt: Date | null; deletedAt: Date | null } | null;
}

export interface SopSource {
  id: string;
  title: string;
  clientId: string | null;
  updatedAt: Date;
  archivedAt: Date | null;
  deletedAt: Date | null;
  client: { archivedAt: Date | null; deletedAt: Date | null } | null;
  _count: { steps: number };
}

export interface KnowledgeSource {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
  lastAccessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  deletedAt: Date | null;
  client: { archivedAt: Date | null; deletedAt: Date | null } | null;
}

export interface InvoiceSource {
  id: string;
  clientId: string;
  status: string;
  amount: Prisma.Decimal;
  dueDate: Date;
  createdAt: Date;
  archivedAt: Date | null;
  deletedAt: Date | null;
  client: { name: string; archivedAt: Date | null; deletedAt: Date | null };
}

export interface ExpenseSource {
  id: string;
  clientId: string | null;
  vendor: string | null;
  category: string;
  amount: Prisma.Decimal;
  expenseDate: Date;
  archivedAt: Date | null;
  deletedAt: Date | null;
  client: { archivedAt: Date | null; deletedAt: Date | null } | null;
}

export interface GraphSourceIndex {
  clients: Map<string, ClientSource>;
  contacts: Map<string, ContactSource>;
  tasks: Map<string, TaskSource>;
  agents: Map<string, AgentSource>;
  tools: Map<string, ToolSource>;
  sops: Map<string, SopSource>;
  knowledge: Map<string, KnowledgeSource>;
  invoices: Map<string, InvoiceSource>;
  expenses: Map<string, ExpenseSource>;
  graphNodeIdByEntity: Map<string, string>;
}

export interface MaterializedGraphNode {
  node: NodeData;
  sourceUpdatedAt: Date;
  directorySortValue: number | null;
}

function record(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> | null {
  return value !== null && !Array.isArray(value) && typeof value === "object" ? value as Record<string, Prisma.JsonValue> : null;
}

export function isSyntheticGraphRow(row: Pick<GraphNodeRow, "stableKey" | "metadata">): boolean {
  return row.stableKey.startsWith("seed:") || record(row.metadata)?.synthetic === true;
}

function label(value: string): string {
  const normalized = value.trim();
  return (normalized || "Untitled").slice(0, 255);
}

function summary(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 1_000) : null;
}

function date(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function lower(value: string): string {
  return value.toLowerCase();
}

function safeTags(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)).map((value) => value.slice(0, 100)))].slice(0, 50);
}

function clientAction(status: string): GraphActionState | null {
  if (status === "ACTIVE") return "active_running";
  if (status === "PAUSED") return "blocked";
  if (status === "CHURNED") return "completed";
  return "pending";
}

function taskAction(status: string): GraphActionState | null {
  if (status === "IN_PROGRESS") return "active_running";
  if (status === "BLOCKED") return "blocked";
  if (status === "DONE" || status === "CANCELLED") return "completed";
  return "pending";
}

function agentAction(status: string): GraphActionState | null {
  if (status === "RUNNING") return "active_running";
  if (status === "ERROR") return "failed";
  if (status === "SCHEDULED") return "scheduled";
  if (status === "PAUSED") return "blocked";
  return null;
}

function toolStatus(status: string): "connected" | "disconnected" | "error" {
  if (status === "CONNECTED") return "connected";
  if (status === "ERROR" || status === "DEGRADED") return "error";
  return "disconnected";
}

function toolAction(status: ReturnType<typeof toolStatus>): GraphActionState | null {
  if (status === "connected") return "active_running";
  if (status === "error") return "failed";
  return "blocked";
}

function financeAction(status: string): GraphActionState {
  if (status === "PAID" || status === "CANCELLED" || status === "EXPENSE") return "completed";
  if (status === "OVERDUE") return "blocked";
  return "pending";
}

function live(...sources: Array<{ archivedAt: Date | null; deletedAt: Date | null } | null | undefined>): boolean {
  return sources.every((source) => Boolean(source) && !source!.archivedAt && !source!.deletedAt);
}

function position(row: GraphNodeRow): { x: number; y: number; fixed: boolean } | null {
  const value = record(row.metadata)?.position;
  if (value === null || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = value as Record<string, Prisma.JsonValue>;
  return typeof candidate.x === "number" && Number.isFinite(candidate.x)
    && typeof candidate.y === "number" && Number.isFinite(candidate.y)
    && typeof candidate.fixed === "boolean"
    ? { x: candidate.x, y: candidate.y, fixed: candidate.fixed }
    : null;
}

export function hubKeyFromStableKey(stableKey: string): HubKey | null {
  const normalized = stableKey === "hub:pipeline-crm" ? "pipeline_crm" : stableKey.slice(4);
  return stableKey.startsWith("hub:") && normalized in hubRegistry ? normalized as HubKey : null;
}

export function projectGraphNode(row: GraphNodeRow, sources: GraphSourceIndex): MaterializedGraphNode | null {
  if (row.archivedAt || row.deletedAt || isSyntheticGraphRow(row)) return null;
  const common = { id: row.id, stableKey: row.stableKey, entityId: row.entityId, label: label(row.label), position: position(row) };

  if (row.type === GraphNodeType.CLIENT && row.entityId) {
    const client = sources.clients.get(row.entityId);
    if (!client || !live(client)) return null;
    const status = lower(client.status);
    const node = nodeDataSchema.parse({
      ...common,
      type: "client",
      label: label(client.name),
      summary: summary(`${client.industry ?? "Client"} · ${status}`),
      status,
      action: clientAction(client.status),
      tags: safeTags([client.industry, status]),
      hubKeys: ["clients"],
      metadata: {
        name: label(client.name),
        industry: client.industry?.trim().slice(0, 100) || null,
        mrr: Math.max(0, client.mrr.toNumber()),
        status,
        startDate: date(client.startDate),
        projectsCount: client._count.projects,
      },
    });
    return { node, sourceUpdatedAt: row.updatedAt, directorySortValue: client.mrr.toNumber() };
  }

  if (row.type === GraphNodeType.HUMAN && row.entityId) {
    const contact = sources.contacts.get(row.entityId);
    if (!contact || !live(contact, contact.client)) return null;
    const node = nodeDataSchema.parse({
      ...common,
      type: "human_contact",
      label: label(contact.name),
      summary: summary(`${contact.role ?? "Contact"} at ${contact.client.name}`),
      status: null,
      action: null,
      tags: safeTags([contact.role, "contact"]),
      hubKeys: ["clients", "pipeline_crm"],
      metadata: {
        name: label(contact.name),
        role: contact.role?.trim().slice(0, 150) || null,
        company: label(contact.client.name),
        email: contact.email?.trim().toLowerCase() || null,
        lastContact: contact.lastContactAt?.toISOString() ?? null,
      },
    });
    return { node, sourceUpdatedAt: row.updatedAt, directorySortValue: contact.lastContactAt?.getTime() ?? null };
  }

  if (row.type === GraphNodeType.TASK && row.entityId) {
    const task = sources.tasks.get(row.entityId);
    if (!task || !live(task, task.project, task.project.client)) return null;
    const status = lower(task.status);
    const agentId = task.assignments.find((assignment) => assignment.assigneeType === "AGENT" && assignment.agentId)?.agentId ?? null;
    const node = nodeDataSchema.parse({
      ...common,
      type: "task",
      label: label(task.title),
      summary: summary(`${task.project.name} · ${task.project.client.name}`),
      status,
      action: taskAction(task.status),
      tags: safeTags([lower(task.priority), status]),
      hubKeys: ["clients", ...(task.project.type === "CONTENT" ? ["content" as const] : []), ...(task.project.type === "WORKFLOW" ? ["automations" as const] : [])],
      metadata: {
        title: label(task.title),
        status,
        dueDate: date(task.dueAt),
        assignedAgentId: agentId ? sources.graphNodeIdByEntity.get(agentId) ?? null : null,
        assignedPersonId: null,
      },
    });
    return { node, sourceUpdatedAt: task.updatedAt, directorySortValue: task.updatedAt.getTime() };
  }

  if (row.type === GraphNodeType.AGENT && row.entityId) {
    const agent = sources.agents.get(row.entityId);
    if (!agent || !live(agent)) return null;
    const status = lower(agent.status) as "running" | "idle" | "error" | "scheduled" | "paused";
    const node = nodeDataSchema.parse({
      ...common,
      type: "ai_agent",
      label: label(agent.name),
      summary: summary(`${lower(agent.type).replaceAll("_", " ")} agent`),
      status,
      action: agentAction(agent.status),
      tags: safeTags([lower(agent.type)]),
      hubKeys: ["agents"],
      metadata: { name: label(agent.name), status, lastRun: agent.lastRunAt?.toISOString() ?? null, tasksCompleted: agent._count.runs },
    });
    return { node, sourceUpdatedAt: row.updatedAt, directorySortValue: agent.lastRunAt?.getTime() ?? null };
  }

  if (row.type === GraphNodeType.TOOL && row.entityId) {
    const tool = sources.tools.get(row.entityId);
    if (!tool || !live(tool) || (tool.client && !live(tool.client))) return null;
    const status = toolStatus(tool.status);
    const node = nodeDataSchema.parse({
      ...common,
      type: "tool",
      label: label(tool.name),
      summary: summary(`${lower(tool.provider).replaceAll("_", " ")} integration`),
      status,
      action: toolAction(status),
      tags: safeTags([lower(tool.provider), "integration"]),
      hubKeys: ["tools"],
      metadata: { name: label(tool.name), category: lower(tool.provider).slice(0, 100), connectionStatus: status, lastSync: tool.lastHealthCheckAt?.toISOString() ?? tool.connectedAt?.toISOString() ?? null },
    });
    return { node, sourceUpdatedAt: row.updatedAt, directorySortValue: tool.lastHealthCheckAt?.getTime() ?? null };
  }

  if (row.type === GraphNodeType.SOP && row.entityId) {
    const sop = sources.sops.get(row.entityId);
    if (!sop || !live(sop) || (sop.client && !live(sop.client))) return null;
    const node = nodeDataSchema.parse({
      ...common,
      type: "sop",
      label: label(sop.title),
      summary: summary(`${sop._count.steps} steps`),
      status: null,
      action: null,
      tags: ["sop"],
      hubKeys: ["knowledge"],
      metadata: { title: label(sop.title), lastUpdated: sop.updatedAt.toISOString(), stepsCount: sop._count.steps, linkedClientIds: sop.clientId ? [sources.graphNodeIdByEntity.get(sop.clientId)].filter((id): id is string => Boolean(id)) : [] },
    });
    return { node, sourceUpdatedAt: sop.updatedAt, directorySortValue: sop.updatedAt.getTime() };
  }

  if ((row.type === GraphNodeType.KNOWLEDGE || row.type === GraphNodeType.DECISION) && row.entityId) {
    const knowledge = sources.knowledge.get(row.entityId);
    if (!knowledge || !live(knowledge) || (knowledge.client && !live(knowledge.client))) return null;
    if (row.type === GraphNodeType.DECISION) {
      const node = nodeDataSchema.parse({
        ...common,
        type: "decision",
        label: label(knowledge.title),
        summary: summary("Recorded decision"),
        status: "recorded",
        action: "completed",
        tags: safeTags(["decision", ...knowledge.tags]),
        hubKeys: ["knowledge", "pipeline_crm"],
        metadata: { title: label(knowledge.title), date: date(knowledge.createdAt), rationale: knowledge.content.trim().slice(0, 5_000) || "Recorded decision.", outcome: null },
      });
      return { node, sourceUpdatedAt: knowledge.updatedAt, directorySortValue: knowledge.updatedAt.getTime() };
    }
    const node = nodeDataSchema.parse({
      ...common,
      type: "knowledge_memory",
      label: label(knowledge.title),
      summary: summary(`${lower(knowledge.category).replaceAll("_", " ")} knowledge`),
      status: null,
      action: null,
      tags: safeTags([lower(knowledge.category), ...knowledge.tags]),
      hubKeys: ["knowledge"],
      metadata: {
        title: label(knowledge.title),
        category: lower(knowledge.category).slice(0, 100),
        lastAccessed: knowledge.lastAccessedAt?.toISOString() ?? null,
        wordCount: knowledge.content.trim() ? knowledge.content.trim().split(/\s+/u).length : 0,
      },
    });
    return { node, sourceUpdatedAt: knowledge.updatedAt, directorySortValue: knowledge.updatedAt.getTime() };
  }

  if (row.type === GraphNodeType.FINANCE && row.entityId) {
    const invoice = sources.invoices.get(row.entityId);
    if (invoice && live(invoice, invoice.client)) {
      const status = lower(invoice.status);
      const node = nodeDataSchema.parse({
        ...common,
        type: "revenue_finance",
        label: label(row.label || `${invoice.client.name} invoice`),
        summary: summary(`${invoice.client.name} invoice`),
        status,
        action: financeAction(invoice.status),
        tags: ["invoice", status],
        hubKeys: ["finance"],
        metadata: { amount: Math.max(0, invoice.amount.toNumber()), type: "income", date: date(invoice.dueDate), clientId: sources.graphNodeIdByEntity.get(invoice.clientId) ?? null, status },
      });
      return { node, sourceUpdatedAt: row.updatedAt, directorySortValue: invoice.amount.toNumber() };
    }
    const expense = sources.expenses.get(row.entityId);
    if (expense && live(expense) && (!expense.client || live(expense.client))) {
      const node = nodeDataSchema.parse({
        ...common,
        type: "revenue_finance",
        label: label(expense.vendor ?? `${lower(expense.category)} expense`),
        summary: summary(`${lower(expense.category).replaceAll("_", " ")} expense`),
        status: "recorded",
        action: "completed",
        tags: safeTags(["expense", lower(expense.category)]),
        hubKeys: ["finance"],
        metadata: { amount: Math.max(0, expense.amount.toNumber()), type: "expense", date: date(expense.expenseDate), clientId: expense.clientId ? sources.graphNodeIdByEntity.get(expense.clientId) ?? null : null, status: "recorded" },
      });
      return { node, sourceUpdatedAt: row.updatedAt, directorySortValue: expense.amount.toNumber() };
    }
  }

  return null;
}

export function createHubNode(row: GraphNodeRow, nodes: readonly NodeData[]): MaterializedGraphNode | null {
  if (row.archivedAt || row.deletedAt || isSyntheticGraphRow(row)) return null;
  const key = hubKeyFromStableKey(row.stableKey);
  if (!key) return null;
  const definition = hubRegistry[key];
  const contents = nodes.filter((node) => node.type !== "hub" && node.hubKeys.includes(key));
  let summaryStat = `${contents.length} entities`;
  if (key === "clients") {
    const clients = contents.filter((node) => node.type === "client");
    const mrr = clients.reduce((total, node) => total + (node.type === "client" ? node.metadata.mrr : 0), 0);
    summaryStat = `${clients.length} clients · $${Math.round(mrr).toLocaleString("en-US")} MRR`;
  } else if (key === "agents") {
    const agents = contents.filter((node) => node.type === "ai_agent");
    summaryStat = `${agents.length} agents · ${agents.filter((node) => node.status === "running").length} running`;
  } else if (key === "finance") {
    const finances = contents.filter((node) => node.type === "revenue_finance");
    const net = finances.reduce((total, node) => total + (node.type === "revenue_finance" ? node.metadata.amount * (node.metadata.type === "income" ? 1 : -1) : 0), 0);
    summaryStat = `${finances.length} records · $${Math.round(net).toLocaleString("en-US")} net`;
  }
  if (row.id !== definition.nodeId || row.entityId !== null || row.stableKey !== definition.stableKey) return null;
  const node = nodeDataSchema.parse({
    id: row.id,
    stableKey: row.stableKey,
    entityId: null,
    type: "hub",
    label: definition.label,
    summary: definition.summary,
    status: null,
    action: null,
    tags: [],
    hubKeys: [],
    position: { x: definition.normalizedPosition.x, y: definition.normalizedPosition.y, fixed: true },
    metadata: { hubKey: key, name: definition.label, entityCount: contents.length, summaryStat },
  });
  return { node, sourceUpdatedAt: row.updatedAt, directorySortValue: contents.length };
}

function projectionKey(metadata: Prisma.JsonValue | null): string | null {
  const value = record(metadata)?.[GRAPH_PROJECTION_KEY_METADATA];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
}

export function projectGraphEdge(row: GraphEdgeRow, visibleNodeIds: ReadonlySet<string>): EdgeData | null {
  if (!visibleNodeIds.has(row.sourceId) || !visibleNodeIds.has(row.targetId)) return null;
  const sourceNodeId = row.sourceId;
  const targetNodeId = row.targetId;
  const origin = row.provenance === GraphEdgeProvenance.SYSTEM_PROJECTION ? "projection" : "owner";
  const projectedKey = origin === "projection" ? projectionKey(row.metadata) : null;
  if (origin === "projection" && projectedKey === null) return null;
  return edgeDataSchema.parse({
    id: row.id,
    type: prismaEdgeTypeToExternal[row.edgeType],
    sourceNodeId,
    targetNodeId,
    label: row.label?.trim().slice(0, 255) || null,
    origin,
    projectionKey: projectedKey,
    createdAt: row.createdAt.toISOString(),
  });
}
