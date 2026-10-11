import "server-only";

import {
  assignmentDtoSchema,
  clientDeletionImpactSchema,
  clientDeletionPlanSchema,
  clientDtoSchema,
  clientSummarySchema,
  communicationDtoSchema,
  contactDtoSchema,
  deliverableDtoSchema,
  entityIdSchema,
  invoiceRelationDtoSchema,
  projectDetailDtoSchema,
  projectDtoSchema,
  taskDtoSchema,
  timeAggregationSchema,
  timeEntryDtoSchema,
  type AuthContext,
} from "@aios/contracts";
import {
  AssignmentType,
  ClientOperationsError,
  IdempotencyStatus,
  createClientOperationsService,
  getDatabaseClient,
  type ClientStatus,
  type CommunicationDirection,
  type CommunicationType,
  type OwnerIdentity,
  type PrismaClientOperationsService,
  type ProjectStatus,
  type ProjectType,
  type TaskPriority,
  type TaskStatus,
} from "@aios/data";
import { idempotencyFingerprint, idempotencyKeySchema } from "@aios/platform";
import { z } from "zod";
import { withAuthenticatedApi, type AuthenticatedApiHandler, type AuthenticatedApiOptions } from "./auth";
import { ApiRequestError, formatZodIssues } from "./errors";
import { successResponse, type ApiSuccessOptions } from "./response";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

type Database = ReturnType<typeof getDatabaseClient>;
type DateLike = Date | null | undefined;
type DecimalLike = { toString(): string } | number | string | null | undefined;
type EntityRecord = Record<string, unknown>;

const clientAuditSummarySchema = z.strictObject({
  id: entityIdSchema,
  action: z.string().trim().min(1).max(100),
  entityType: z.string().trim().min(1).max(100),
  entityId: entityIdSchema,
  actorType: z.string().trim().min(1).max(50),
  correlationId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  changeSummary: z.json().nullable(),
  createdAt: z.string().datetime({ offset: true }),
});

export interface ClientApiServiceContext {
  database: Database;
  identity: OwnerIdentity;
  service: PrismaClientOperationsService;
}

export interface IdempotentResult<T> {
  data: T;
  replayed: boolean;
}

export { assignmentUpdateSchema, manualTimeEntryCreateSchema, manualTimeEntryUpdateSchema, projectStatusUpdateSchema } from "./client-route-schemas";

function iso(value: DateLike): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function dateOnly(value: DateLike): string | null {
  return value instanceof Date ? value.toISOString().slice(0, 10) : null;
}

function money(value: DecimalLike): number {
  return value == null ? 0 : Number(value.toString());
}

function apiEnum(value: unknown): string {
  return String(value).toLowerCase();
}

export function toDatabaseClientStatus(value: string): ClientStatus {
  return value.toUpperCase() as ClientStatus;
}

export function toDatabaseProjectType(value: string): ProjectType {
  return value.toUpperCase() as ProjectType;
}

export function toDatabaseProjectStatus(value: string): ProjectStatus {
  return value.toUpperCase() as ProjectStatus;
}

export function toDatabaseTaskStatus(value: string): TaskStatus {
  return value.toUpperCase() as TaskStatus;
}

export function toDatabaseTaskPriority(value: string): TaskPriority {
  return value.toUpperCase() as TaskPriority;
}

export function toDatabaseCommunicationType(value: string): CommunicationType {
  return value.toUpperCase() as CommunicationType;
}

export function toDatabaseCommunicationDirection(value: string): CommunicationDirection {
  return value.toUpperCase() as CommunicationDirection;
}

export function parseDateOnly(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

export function parseDateTime(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

export function parseEntityId(value: string, field = "id"): string {
  const parsed = entityIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiRequestError("VALIDATION_FAILED", `${field} must be a valid UUID.`, {
      status: 422,
      details: formatZodIssues(parsed.error),
    });
  }
  return parsed.data;
}

export function assertPathId(bodyId: string, pathId: string, field: string): void {
  if (bodyId !== pathId) {
    throw new ApiRequestError("VALIDATION_FAILED", `${field} must match the route parameter.`, {
      status: 422,
      details: [{ code: "custom", path: field, message: `${field} must match the route parameter.` }],
    });
  }
}

export function mapClientOperationsError(error: unknown): ApiRequestError | unknown {
  if (!(error instanceof ClientOperationsError)) return error;
  const statusByCode: Record<string, number> = {
    INVALID_IDENTITY: 403,
    NOT_FOUND: 404,
    INVALID_INPUT: 422,
    CONFLICT: 409,
    DELIVERY_BLOCKED: 409,
    DELETION_BLOCKED: 409,
  };
  return new ApiRequestError(error.code, error.message, {
    status: statusByCode[error.code] ?? 400,
    details: error.details,
    cause: error,
  });
}

/** Adds the shared platform policy and converts safe client-domain failures. */
export function withClientApi<TRouteContext = unknown>(
  handler: AuthenticatedApiHandler<TRouteContext>,
  options: AuthenticatedApiOptions = {},
) {
  return withAuthenticatedApi<TRouteContext>(async (request, context, routeContext) => {
    try {
      return await handler(request, context, routeContext);
    } catch (error) {
      throw mapClientOperationsError(error);
    }
  }, options);
}

export async function getClientApiServiceContext(context: AuthContext): Promise<ClientApiServiceContext> {
  const database = getDatabaseClient();
  const owner = await database.ownerAccount.findFirst({
    where: {
      active: true,
      OR: [
        ...(UUID_PATTERN.test(context.owner.id) ? [{ authSubject: context.owner.id }] : []),
        { email: { equals: context.owner.email, mode: "insensitive" as const } },
      ],
    },
    select: { id: true, authSubject: true },
  });
  if (!owner) throw new ApiRequestError("FORBIDDEN", "The authenticated owner is not active.", { status: 403 });
  return {
    database,
    identity: {
      ownerSubject: owner.authSubject,
      ownerAccountId: owner.id,
      correlationId: context.requestId,
      actorType: "owner",
    },
    service: createClientOperationsService(database),
  };
}

function countOf(row: EntityRecord, relation: string): number {
  const count = row._count as EntityRecord | undefined;
  const value = count?.[relation];
  if (typeof value === "number") return value;
  const related = row[relation];
  return Array.isArray(related) ? related.length : 0;
}

export function mapClientSummary(row: EntityRecord, primaryContact?: EntityRecord | null) {
  return clientSummarySchema.parse({
    id: row.id,
    name: row.name,
    industry: row.industry ?? null,
    status: apiEnum(row.status),
    website: row.website ?? null,
    logoFileId: row.logoFileId ?? null,
    mrr: money(row.mrr as DecimalLike),
    totalRevenue: money(row.totalRevenue as DecimalLike),
    startDate: dateOnly(row.startDate as DateLike),
    primaryContactId: primaryContact?.id ?? null,
    primaryContactName: primaryContact?.name ?? row.contactName ?? null,
    projectCount: typeof row.projectCount === "number" ? row.projectCount : countOf(row, "projects"),
    contactCount: typeof row.contactCount === "number" ? row.contactCount : countOf(row, "contacts"),
    archivedAt: iso(row.archivedAt as DateLike),
    createdAt: iso(row.createdAt as DateLike),
    updatedAt: iso(row.updatedAt as DateLike),
  });
}

export function mapClientDto(row: EntityRecord) {
  const contacts = Array.isArray(row.contacts) ? row.contacts as EntityRecord[] : [];
  const primary = contacts.find((contact) => contact.isPrimary === true) ?? null;
  const client = clientDtoSchema.parse({
    ...mapClientSummary(row, primary),
    contactName: row.contactName ?? null,
    contactEmail: row.contactEmail ?? null,
    contactPhone: row.contactPhone ?? null,
    notes: row.notes ?? null,
    deletedAt: iso(row.deletedAt as DateLike),
  });
  if (!Array.isArray(row.auditSummaries)) return client;
  return {
    ...client,
    auditSummaries: row.auditSummaries.map((audit) => {
      const summary = audit as EntityRecord;
      return clientAuditSummarySchema.parse({ ...summary, createdAt: iso(summary.createdAt as DateLike) });
    }),
  };
}

export function mapContactDto(row: EntityRecord) {
  return contactDtoSchema.parse({
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    role: row.role ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    notes: row.notes ?? null,
    isPrimary: row.isPrimary,
    lastContactAt: iso(row.lastContactAt as DateLike),
    archivedAt: iso(row.archivedAt as DateLike),
    createdAt: iso(row.createdAt as DateLike),
    updatedAt: iso(row.updatedAt as DateLike),
  });
}

export function mapProjectDto(row: EntityRecord) {
  return projectDtoSchema.parse({
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    type: apiEnum(row.type),
    status: apiEnum(row.status),
    description: row.description ?? null,
    startDate: dateOnly(row.startDate as DateLike),
    dueDate: dateOnly(row.dueDate as DateLike),
    price: row.price == null ? null : money(row.price as DecimalLike),
    hoursSpent: money(row.hoursSpent as DecimalLike),
    taskCount: countOf(row, "tasks"),
    deliverableCount: countOf(row, "deliverables"),
    archivedAt: iso(row.archivedAt as DateLike),
    createdAt: iso(row.createdAt as DateLike),
    updatedAt: iso(row.updatedAt as DateLike),
  });
}

export function mapProjectDetailDto(row: EntityRecord) {
  const history = Array.isArray(row.statusHistory) ? row.statusHistory as EntityRecord[] : [];
  return projectDetailDtoSchema.parse({
    ...mapProjectDto(row),
    statusHistory: history.map((item) => ({
      id: item.id,
      projectId: item.projectId,
      fromStatus: item.fromStatus == null ? null : apiEnum(item.fromStatus),
      toStatus: apiEnum(item.toStatus),
      changedAt: iso(item.changedAt as DateLike),
      changedBy: item.changedBy ?? null,
      reason: item.reason ?? null,
    })),
  });
}

export function mapTaskDto(row: EntityRecord) {
  return taskDtoSchema.parse({
    id: row.id,
    projectId: row.projectId,
    parentTaskId: row.parentTaskId ?? null,
    title: row.title,
    description: row.description ?? null,
    status: apiEnum(row.status),
    priority: apiEnum(row.priority),
    dueAt: iso(row.dueAt as DateLike),
    completedAt: iso(row.completedAt as DateLike),
    archivedAt: iso(row.archivedAt as DateLike),
    createdAt: iso(row.createdAt as DateLike),
    updatedAt: iso(row.updatedAt as DateLike),
  });
}

export function mapAssignmentDto(row: EntityRecord) {
  return assignmentDtoSchema.parse({
    id: row.id,
    projectId: row.projectId,
    taskId: row.taskId ?? null,
    assigneeType: apiEnum(row.assigneeType),
    agentId: row.agentId ?? null,
    ownerSubject: row.ownerSubject ?? null,
    role: row.role ?? null,
    assignedAt: iso(row.assignedAt as DateLike),
    completedAt: iso(row.completedAt as DateLike),
    archivedAt: iso(row.archivedAt as DateLike),
  });
}

export function mapTimeEntryDto(row: EntityRecord) {
  return timeEntryDtoSchema.parse({
    id: row.id,
    projectId: row.projectId,
    taskId: row.taskId ?? null,
    agentRunId: row.agentRunId ?? null,
    source: apiEnum(row.source),
    description: row.description ?? null,
    startedAt: iso(row.startedAt as DateLike),
    endedAt: iso(row.endedAt as DateLike),
    minutes: row.minutes,
    hourlyRate: row.hourlyRate == null ? null : money(row.hourlyRate as DecimalLike),
    archivedAt: iso(row.archivedAt as DateLike),
    createdAt: iso(row.createdAt as DateLike),
    updatedAt: iso(row.updatedAt as DateLike),
  });
}

export function mapTimeAggregation(row: EntityRecord) {
  return timeAggregationSchema.parse({
    projectId: row.projectId,
    totalMinutes: row.totalMinutes,
    manualMinutes: row.manualMinutes,
    agentRunMinutes: row.agentRunMinutes,
    billableAmount: money(row.billableAmount as DecimalLike),
  });
}

export function mapDeliverableDto(row: EntityRecord) {
  return deliverableDtoSchema.parse({
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description ?? null,
    position: row.position,
    isRequired: row.isRequired,
    completedAt: iso(row.completedAt as DateLike),
    archivedAt: iso(row.archivedAt as DateLike),
    createdAt: iso(row.createdAt as DateLike),
    updatedAt: iso(row.updatedAt as DateLike),
  });
}

export function mapCommunicationDto(row: EntityRecord) {
  return communicationDtoSchema.parse({
    id: row.id,
    clientId: row.clientId,
    contactId: row.contactId ?? null,
    type: apiEnum(row.type),
    direction: apiEnum(row.direction),
    occurredAt: iso(row.occurredAt as DateLike),
    summary: row.summary,
    body: row.body ?? null,
    nextAction: row.nextAction ?? null,
    source: row.source ?? null,
    providerMessageId: row.providerMessageId ?? null,
    archivedAt: iso(row.archivedAt as DateLike),
    createdAt: iso(row.createdAt as DateLike),
    updatedAt: iso(row.updatedAt as DateLike),
  });
}

export function mapInvoiceDto(row: EntityRecord) {
  return invoiceRelationDtoSchema.parse({
    id: row.id,
    clientId: row.clientId,
    type: apiEnum(row.type),
    status: apiEnum(row.status),
    amount: money(row.amount as DecimalLike),
    currency: row.currency,
    dueDate: dateOnly(row.dueDate as DateLike),
    paidAt: iso(row.paidAt as DateLike),
    sentAt: iso(row.sentAt as DateLike),
    hostedInvoiceUrl: row.hostedInvoiceUrl ?? null,
    createdAt: iso(row.createdAt as DateLike),
  });
}

function mapDeletionImpact(impact: EntityRecord) {
  return clientDeletionImpactSchema.parse({
    clientId: impact.clientId,
    items: (impact.items as EntityRecord[]).map((item) => ({
      resourceType: item.resourceType,
      count: item.count,
      deletionMode: item.deletionMode,
    })),
    legalHold: impact.legalHold,
    blockers: impact.blockers,
  });
}

export function mapDeletionPlan(plan: EntityRecord) {
  return clientDeletionPlanSchema.parse({
    id: plan.id,
    clientId: plan.clientId,
    status: apiEnum(plan.status),
    requestedAt: iso(plan.requestedAt as DateLike),
    notBefore: iso((plan.executeAfter ?? plan.notBefore) as DateLike),
    cancelledAt: iso(plan.cancelledAt as DateLike),
    completedAt: iso(plan.completedAt as DateLike),
    impact: mapDeletionImpact(plan.impact as EntityRecord),
    version: plan.version,
  });
}

export async function requireProjectForClient(
  serviceContext: ClientApiServiceContext,
  clientId: string,
  projectId: string,
): Promise<EntityRecord> {
  const project = await serviceContext.service.work.getProject(serviceContext.identity, projectId) as unknown as EntityRecord;
  if (project.clientId !== clientId) throw new ClientOperationsError("NOT_FOUND", "Project not found for this client.");
  return project;
}

export function requireNestedEntity(project: EntityRecord, relation: string, entityId: string, label: string): EntityRecord {
  const entities = Array.isArray(project[relation]) ? project[relation] as EntityRecord[] : [];
  const entity = entities.find((candidate) => candidate.id === entityId);
  if (!entity) throw new ClientOperationsError("NOT_FOUND", `${label} not found for this project.`);
  return entity;
}

/** Optional Idempotency-Key support for every JSON domain mutation. */
export async function executeIdempotent<T>(
  request: Request,
  context: ClientApiServiceContext,
  operation: string,
  payload: unknown,
  execute: () => Promise<T>,
): Promise<IdempotentResult<T>> {
  const rawKey = request.headers.get("idempotency-key");
  if (!rawKey) return { data: await execute(), replayed: false };
  const parsedKey = idempotencyKeySchema.safeParse(rawKey);
  if (!parsedKey.success) {
    throw new ApiRequestError("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key is invalid.", {
      status: 422,
      details: formatZodIssues(parsedKey.error),
    });
  }
  if (operation.length > 150) throw new Error("Idempotency operation names must not exceed 150 characters.");
  const key = parsedKey.data;
  const fingerprint = idempotencyFingerprint(key, operation, payload);
  const unique = { ownerSubject: context.identity.ownerSubject, idempotencyKey: key, operation };
  let record = await context.database.idempotencyRecord.findUnique({
    where: { ownerSubject_idempotencyKey_operation: unique },
  });
  if (record) {
    if (record.requestFingerprint !== fingerprint) {
      throw new ApiRequestError("IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used with a different request.", { status: 409 });
    }
    if (record.status === IdempotencyStatus.COMPLETED && record.responseBody && typeof record.responseBody === "object" && !Array.isArray(record.responseBody)) {
      const data = (record.responseBody as { data?: T }).data;
      if (data !== undefined) return { data, replayed: true };
    }
    if (record.status === IdempotencyStatus.PROCESSING && record.expiresAt > new Date()) {
      throw new ApiRequestError("IDEMPOTENCY_IN_PROGRESS", "An identical request is already processing.", {
        status: 409,
        headers: { "retry-after": "2" },
      });
    }
    record = await context.database.idempotencyRecord.update({
      where: { id: record.id },
      data: { status: IdempotencyStatus.PROCESSING, expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS) },
    });
  } else {
    try {
      record = await context.database.idempotencyRecord.create({
        data: {
          ownerSubject: context.identity.ownerSubject,
          idempotencyKey: key,
          operation,
          requestFingerprint: fingerprint,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        },
      });
    } catch {
      const concurrent = await context.database.idempotencyRecord.findUnique({
        where: { ownerSubject_idempotencyKey_operation: unique },
      });
      if (!concurrent || concurrent.requestFingerprint !== fingerprint) {
        throw new ApiRequestError("IDEMPOTENCY_CONFLICT", "Idempotency-Key could not be acquired.", { status: 409 });
      }
      throw new ApiRequestError("IDEMPOTENCY_IN_PROGRESS", "An identical request is already processing.", {
        status: 409,
        headers: { "retry-after": "2" },
      });
    }
  }

  try {
    const data = await execute();
    await context.database.idempotencyRecord.update({
      where: { id: record.id },
      data: {
        status: IdempotencyStatus.COMPLETED,
        responseStatus: 200,
        responseBody: JSON.parse(JSON.stringify({ data })),
      },
    });
    return { data, replayed: false };
  } catch (error) {
    await context.database.idempotencyRecord.update({ where: { id: record.id }, data: { status: IdempotencyStatus.FAILED } }).catch(() => undefined);
    throw error;
  }
}

export function idempotentSuccessResponse<T>(
  result: IdempotentResult<T>,
  requestId: string,
  options: Omit<ApiSuccessOptions, "requestId"> = {},
): Response {
  const headers = new Headers(options.headers);
  headers.set("idempotency-replayed", String(result.replayed));
  return successResponse(result.data, { ...options, requestId, headers });
}

export const assignmentTypeForService = {
  agent: AssignmentType.AGENT,
  human: AssignmentType.HUMAN,
} as const;
