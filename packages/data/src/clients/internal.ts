import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/client/client";
import { AssignmentType, GraphEdgeProvenance, GraphEdgeType, GraphNodeType } from "../generated/client/enums";
import {
  taskEventPayload as graphTaskEventPayload,
  upsertTaskGraphProjection as upsertBaseTaskGraphProjection,
  type TaskProjectionSource,
} from "../graph/projections";
import { appendAuditOutboxRecords, type AuditRecordInput, type OutboxRecordInput } from "../durable";
import { ClientOperationsError } from "./errors";
import type { OwnerIdentity } from "./types";

export const EVENT_SCHEMA_VERSION = 1;
const SENSITIVE_KEYS = /(?:body|content|email|phone|notes?|summary|nextAction|token|secret|credential|authorization|cookie|address)/i;

export function requireNonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ClientOperationsError("INVALID_INPUT", `${field} is required.`);
  return normalized;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || !normalized.includes("@") || normalized.length > 320) {
    throw new ClientOperationsError("INVALID_INPUT", "A valid email address is required.");
  }
  return normalized;
}

export function assertDateRange(start: Date | null | undefined, end: Date | null | undefined, field = "end"): void {
  if (start && end && end < start) throw new ClientOperationsError("INVALID_INPUT", `${field} must not be before the start date.`);
}

export function assertIdentityShape(identity: OwnerIdentity): void {
  if (!identity.ownerSubject?.trim() || !identity.ownerAccountId?.trim() || !identity.correlationId?.trim()) {
    throw new ClientOperationsError("INVALID_IDENTITY", "Active owner subject, database identity, and correlation ID are required.");
  }
  if (identity.correlationId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(identity.correlationId)) {
    throw new ClientOperationsError("INVALID_IDENTITY", "The correlation ID is invalid.");
  }
}

export async function requireActiveOwner(database: PrismaClient, identity: OwnerIdentity) {
  assertIdentityShape(identity);
  const owner = await database.ownerAccount.findFirst({
    where: { id: identity.ownerAccountId, authSubject: identity.ownerSubject, active: true },
    select: { id: true, authSubject: true },
  });
  if (!owner) throw new ClientOperationsError("INVALID_IDENTITY", "The owner identity is not active or does not match the database identity.");
  return owner;
}

export async function requireActiveOwnerInTransaction(transaction: Prisma.TransactionClient, identity: OwnerIdentity) {
  assertIdentityShape(identity);
  const owner = await transaction.ownerAccount.findFirst({
    where: { id: identity.ownerAccountId, authSubject: identity.ownerSubject, active: true },
    select: { id: true, authSubject: true },
  });
  if (!owner) throw new ClientOperationsError("INVALID_IDENTITY", "The owner identity is not active or does not match the database identity.");
  return owner;
}

export function safeAuditSummary(changedFields: readonly string[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  const safeExtra = Object.fromEntries(Object.entries(extra).filter(([key]) => !SENSITIVE_KEYS.test(key)));
  return { schemaVersion: EVENT_SCHEMA_VERSION, changedFields: [...new Set(changedFields)].sort(), ...safeExtra };
}

export function sanitizeAuditValue(value: Prisma.JsonValue | null): Prisma.JsonValue | null {
  if (Array.isArray(value)) return value.map((entry) => sanitizeAuditValue(entry) as Prisma.JsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_KEYS.test(key))
        .map(([key, entry]) => [key, sanitizeAuditValue(entry as Prisma.JsonValue)]),
    ) as Prisma.JsonObject;
  }
  return value;
}

export interface DurableMutationRecord {
  entityType: string;
  entityId: string;
  action: string;
  eventType: string;
  payload: Record<string, unknown>;
  changedFields?: readonly string[];
  auditExtra?: Record<string, unknown>;
  occurredAt?: Date;
}

export async function appendMutationRecords(
  transaction: Prisma.TransactionClient,
  identity: OwnerIdentity,
  records: readonly DurableMutationRecord[],
): Promise<void> {
  if (!records.length) return;
  const audits: AuditRecordInput[] = [];
  const outbox: OutboxRecordInput[] = [];
  for (const record of records) {
    const eventId = randomUUID();
    const occurredAt = record.occurredAt ?? new Date();
    audits.push({
      actorSubject: identity.ownerSubject,
      actorType: identity.actorType ?? "owner",
      action: record.action,
      entityType: record.entityType,
      entityId: record.entityId,
      correlationId: identity.correlationId,
      changeSummary: safeAuditSummary(record.changedFields ?? [], record.auditExtra),
      ipHash: identity.ipHash,
    });
    outbox.push({
      id: eventId,
      aggregateType: record.entityType,
      aggregateId: record.entityId,
      eventType: record.eventType,
      payload: {
        eventId,
        schemaVersion: EVENT_SCHEMA_VERSION,
        ownerId: identity.ownerAccountId,
        correlationId: identity.correlationId,
        occurredAt: occurredAt.toISOString(),
        eventType: record.eventType,
        entityType: record.entityType,
        aggregateId: record.entityId,
        payload: record.payload,
      },
      correlationId: identity.correlationId,
      idempotencyKey: `${identity.correlationId}:${record.eventType}:${record.entityId}`,
      occurredAt,
    });
  }
  await appendAuditOutboxRecords(transaction, { audit: audits, outbox });
}

export async function lockClient(transaction: Prisma.TransactionClient, clientId: string): Promise<void> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.clients WHERE id = ${clientId}::uuid FOR UPDATE`;
  if (!rows.length) throw new ClientOperationsError("NOT_FOUND", "Client not found.");
}

export async function upsertClientGraphProjection(
  transaction: Prisma.TransactionClient,
  client: { id: string; name: string; archivedAt: Date | null; deletedAt: Date | null },
) {
  return transaction.graphNode.upsert({
    where: { stableKey: `client:${client.id}` },
    create: {
      type: GraphNodeType.CLIENT,
      entityId: client.id,
      stableKey: `client:${client.id}`,
      label: client.name,
      metadata: { projectionVersion: EVENT_SCHEMA_VERSION },
      archivedAt: client.archivedAt,
      deletedAt: client.deletedAt,
    },
    update: {
      label: client.name,
      metadata: { projectionVersion: EVENT_SCHEMA_VERSION },
      archivedAt: client.archivedAt,
      deletedAt: client.deletedAt,
    },
  });
}

export async function upsertContactGraphProjection(
  transaction: Prisma.TransactionClient,
  contact: { id: string; clientId: string; name: string; archivedAt: Date | null; deletedAt: Date | null },
): Promise<void> {
  const clientNode = await transaction.graphNode.findUnique({ where: { type_entityId: { type: GraphNodeType.CLIENT, entityId: contact.clientId } } });
  if (!clientNode) throw new ClientOperationsError("NOT_FOUND", "Client graph projection not found.");
  const contactNode = await transaction.graphNode.upsert({
    where: { stableKey: `contact:${contact.id}` },
    create: {
      type: GraphNodeType.HUMAN,
      entityId: contact.id,
      stableKey: `contact:${contact.id}`,
      label: contact.name,
      metadata: { projectionVersion: EVENT_SCHEMA_VERSION, clientId: contact.clientId },
      archivedAt: contact.archivedAt,
      deletedAt: contact.deletedAt,
    },
    update: {
      label: contact.name,
      metadata: { projectionVersion: EVENT_SCHEMA_VERSION, clientId: contact.clientId },
      archivedAt: contact.archivedAt,
      deletedAt: contact.deletedAt,
    },
  });
  await transaction.graphEdge.upsert({
    where: {
      sourceId_sourceType_targetId_targetType_edgeType: {
        sourceId: clientNode.id,
        sourceType: GraphNodeType.CLIENT,
        targetId: contactNode.id,
        targetType: GraphNodeType.HUMAN,
        edgeType: GraphEdgeType.OWNERSHIP,
      },
    },
    create: {
      sourceId: clientNode.id,
      sourceType: GraphNodeType.CLIENT,
      targetId: contactNode.id,
      targetType: GraphNodeType.HUMAN,
      edgeType: GraphEdgeType.OWNERSHIP,
      provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
      label: "has contact",
      metadata: { projectionVersion: EVENT_SCHEMA_VERSION, projectionKey: "clients.contacts" },
      archivedAt: contact.archivedAt,
      deletedAt: contact.deletedAt,
    },
    update: {
      provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
      label: "has contact",
      archivedAt: contact.archivedAt,
      deletedAt: contact.deletedAt,
      metadata: { projectionVersion: EVENT_SCHEMA_VERSION, projectionKey: "clients.contacts" },
    },
  });
}

export const ASSIGNMENT_PROJECTION_KEY = "clients.assignments" as const;

export type ClientTaskProjectionSource = TaskProjectionSource & {
  status: string;
  dueAt: Date | null;
};

type ProjectionLifecycle = { archivedAt: Date | null; deletedAt: Date | null };
type AgentProjectionSource = ProjectionLifecycle & { id: string; name: string };
type AgentAssignmentProjectionSource = ProjectionLifecycle & {
  id: string;
  agentId: string | null;
  completedAt: Date | null;
  agent: AgentProjectionSource | null;
};

function firstLifecycleDate(...values: Array<Date | null>): Date | null {
  return values.filter((value): value is Date => value !== null).sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
}

async function upsertAgentGraphProjection(transaction: Prisma.TransactionClient, agent: AgentProjectionSource) {
  return transaction.graphNode.upsert({
    where: { stableKey: `agent:${agent.id}` },
    create: {
      type: GraphNodeType.AGENT,
      entityId: agent.id,
      stableKey: `agent:${agent.id}`,
      label: agent.name,
      metadata: { projectionVersion: EVENT_SCHEMA_VERSION },
      archivedAt: agent.archivedAt,
      deletedAt: agent.deletedAt,
    },
    update: {
      label: agent.name,
      metadata: { projectionVersion: EVENT_SCHEMA_VERSION },
      archivedAt: agent.archivedAt,
      deletedAt: agent.deletedAt,
    },
  });
}

async function reconcileAgentAssignmentEdges(
  transaction: Prisma.TransactionClient,
  targetNode: { id: string; type: typeof GraphNodeType.TASK | typeof GraphNodeType.CLIENT },
  targetLifecycle: ProjectionLifecycle,
  assignments: readonly AgentAssignmentProjectionSource[],
  label: string,
): Promise<void> {
  const assignmentsByAgent = new Map<string, AgentAssignmentProjectionSource[]>();
  for (const assignment of assignments) {
    if (!assignment.agentId || !assignment.agent) continue;
    assignmentsByAgent.set(assignment.agentId, [...(assignmentsByAgent.get(assignment.agentId) ?? []), assignment]);
  }

  const projectedSourceIds: string[] = [];
  for (const rows of assignmentsByAgent.values()) {
    const active = rows.find((row) =>
      !targetLifecycle.archivedAt && !targetLifecycle.deletedAt
      && !row.completedAt && !row.archivedAt && !row.deletedAt
      && !row.agent!.archivedAt && !row.agent!.deletedAt,
    );
    const source = active ?? rows[0]!;
    const agentNode = await upsertAgentGraphProjection(transaction, source.agent!);
    projectedSourceIds.push(agentNode.id);
    const deletedAt = active ? null : firstLifecycleDate(
      targetLifecycle.deletedAt,
      source.agent!.deletedAt,
      rows.every((row) => row.deletedAt !== null) ? firstLifecycleDate(...rows.map((row) => row.deletedAt)) : null,
    );
    const archivedAt = active ? null : firstLifecycleDate(
      targetLifecycle.archivedAt,
      source.agent!.archivedAt,
      ...rows.flatMap((row) => [row.archivedAt, row.completedAt, row.deletedAt]),
      deletedAt,
    );
    await transaction.graphEdge.upsert({
      where: {
        sourceId_sourceType_targetId_targetType_edgeType: {
          sourceId: agentNode.id,
          sourceType: GraphNodeType.AGENT,
          targetId: targetNode.id,
          targetType: targetNode.type,
          edgeType: GraphEdgeType.ASSIGNMENT,
        },
      },
      create: {
        sourceId: agentNode.id,
        sourceType: GraphNodeType.AGENT,
        targetId: targetNode.id,
        targetType: targetNode.type,
        edgeType: GraphEdgeType.ASSIGNMENT,
        provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
        label,
        metadata: { projectionVersion: EVENT_SCHEMA_VERSION, projectionKey: ASSIGNMENT_PROJECTION_KEY },
        archivedAt,
        deletedAt,
      },
      update: {
        provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
        label,
        metadata: { projectionVersion: EVENT_SCHEMA_VERSION, projectionKey: ASSIGNMENT_PROJECTION_KEY },
        archivedAt,
        deletedAt,
      },
    });
  }

  const reconciledAt = new Date();
  await transaction.graphEdge.updateMany({
    where: {
      sourceType: GraphNodeType.AGENT,
      targetId: targetNode.id,
      targetType: targetNode.type,
      edgeType: GraphEdgeType.ASSIGNMENT,
      provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
      metadata: { path: ["projectionKey"], equals: ASSIGNMENT_PROJECTION_KEY },
      deletedAt: null,
      ...(projectedSourceIds.length ? { sourceId: { notIn: projectedSourceIds } } : {}),
    },
    data: { archivedAt: reconciledAt, deletedAt: reconciledAt },
  });
}

/** Reconciles the base task projection plus source-derived agent assignments. */
export async function upsertTaskGraphProjection(
  transaction: Prisma.TransactionClient,
  task: ClientTaskProjectionSource,
): Promise<void> {
  await upsertBaseTaskGraphProjection(transaction, task);
  const taskNode = await transaction.graphNode.findUnique({ where: { stableKey: `task:${task.id}` } });
  if (!taskNode) throw new ClientOperationsError("NOT_FOUND", "Task graph projection was not found after reconciliation.");

  const assignments = await transaction.assignment.findMany({
    where: { taskId: task.id, assigneeType: AssignmentType.AGENT },
    select: {
      id: true,
      agentId: true,
      completedAt: true,
      archivedAt: true,
      deletedAt: true,
      agent: { select: { id: true, name: true, archivedAt: true, deletedAt: true } },
    },
  });
  await reconcileAgentAssignmentEdges(transaction, { id: taskNode.id, type: GraphNodeType.TASK }, task, assignments, "assigned to task");
}

export async function reconcileProjectAssignmentGraphProjections(
  transaction: Prisma.TransactionClient,
  projectId: string,
): Promise<void> {
  const project = await transaction.project.findUnique({
    where: { id: projectId },
    select: { clientId: true, client: { select: { id: true, name: true, archivedAt: true, deletedAt: true } } },
  });
  if (!project) throw new ClientOperationsError("NOT_FOUND", "Assignment project source was not found while updating its graph projection.");
  const clientNode = await upsertClientGraphProjection(transaction, project.client);
  const assignments = await transaction.assignment.findMany({
    where: { taskId: null, assigneeType: AssignmentType.AGENT, project: { clientId: project.clientId } },
    select: {
      id: true,
      agentId: true,
      completedAt: true,
      archivedAt: true,
      deletedAt: true,
      agent: { select: { id: true, name: true, archivedAt: true, deletedAt: true } },
      project: { select: { archivedAt: true, deletedAt: true } },
    },
  });
  const sources = assignments.map((assignment: AgentAssignmentProjectionSource & { project: ProjectionLifecycle }) => ({
    ...assignment,
    archivedAt: firstLifecycleDate(assignment.archivedAt, assignment.project.archivedAt),
    deletedAt: firstLifecycleDate(assignment.deletedAt, assignment.project.deletedAt),
  }));
  await reconcileAgentAssignmentEdges(transaction, { id: clientNode.id, type: GraphNodeType.CLIENT }, project.client, sources, "assigned to client");
}

export async function upsertAssignmentGraphProjection(
  transaction: Prisma.TransactionClient,
  assignment: { projectId: string; taskId: string | null },
): Promise<void> {
  if (assignment.taskId) {
    const task = await transaction.task.findUnique({ where: { id: assignment.taskId } });
    if (!task) throw new ClientOperationsError("NOT_FOUND", "Assignment task source was not found while updating its graph projection.");
    await upsertTaskGraphProjection(transaction, task);
    return;
  }
  await reconcileProjectAssignmentGraphProjections(transaction, assignment.projectId);
}

export function taskEventPayload(task: ClientTaskProjectionSource) {
  return graphTaskEventPayload(task);
}

export function clientEventPayload(client: {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  mrr: { toString(): string };
  archivedAt: Date | null;
}) {
  return {
    clientId: client.id,
    name: client.name,
    status: client.status.toLowerCase(),
    industry: client.industry,
    mrr: Number(client.mrr.toString()),
    archivedAt: client.archivedAt?.toISOString() ?? null,
  };
}

export function contactEventPayload(contact: {
  id: string;
  clientId: string;
  isPrimary: boolean;
  lastContactAt: Date | null;
  archivedAt: Date | null;
}) {
  return {
    contactId: contact.id,
    clientId: contact.clientId,
    isPrimary: contact.isPrimary,
    lastContactAt: contact.lastContactAt?.toISOString() ?? null,
    archivedAt: contact.archivedAt?.toISOString() ?? null,
  };
}

export function projectEventPayload(project: {
  id: string;
  clientId: string;
  name: string;
  type: string;
  status: string;
  archivedAt: Date | null;
}) {
  return {
    projectId: project.id,
    clientId: project.clientId,
    name: project.name,
    type: project.type.toLowerCase(),
    status: project.status.toLowerCase(),
    archivedAt: project.archivedAt?.toISOString() ?? null,
  };
}

export function communicationEventPayload(communication: {
  id: string;
  clientId: string;
  contactId: string | null;
  type: string;
  direction: string;
  occurredAt: Date;
  source: string | null;
  archivedAt: Date | null;
}) {
  return {
    communicationId: communication.id,
    clientId: communication.clientId,
    contactId: communication.contactId,
    type: communication.type.toLowerCase(),
    direction: communication.direction.toLowerCase(),
    occurredAt: communication.occurredAt.toISOString(),
    source: communication.source,
    archivedAt: communication.archivedAt?.toISOString() ?? null,
  };
}

export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor<T>(cursor: string): T {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as T;
  } catch {
    throw new ClientOperationsError("INVALID_INPUT", "The cursor is invalid.");
  }
}
