import "server-only";

import {
  agentConfigVersionSchema,
  agentDtoSchema,
  agentMemoryDtoSchema,
  agentRunDtoSchema,
  agentSummarySchema,
  approvalDtoSchema,
  type AuthContext,
} from "@aios/contracts";
import {
  AgentOperationsError,
  getDatabaseClient,
  PrismaAgentService,
  type AgentConfigVersionRecord,
  type AgentDetail,
  type AgentListItem,
  type AgentMemoryRecord,
  type AgentRunRecord,
  type ApprovalRecord,
  type OwnerIdentity,
} from "@aios/data";
import { z } from "zod";
import { withAuthenticatedApi, type AuthenticatedApiHandler, type AuthenticatedApiOptions } from "../api/auth";
import { ApiRequestError } from "../api/errors";
import { resolveOwnerRecord } from "../api/domain-service";
import { successResponse, type ApiSuccessOptions } from "../api/response";
import { idempotencyFingerprint, idempotencyKeySchema } from "@aios/platform";
import { IdempotencyStatus } from "@aios/data";

type Database = ReturnType<typeof getDatabaseClient>;
type DateLike = Date | null | undefined;
type DecimalLike = { toString(): string } | number | null | undefined;
type EntityRecord = Record<string, unknown>;

export interface AgentApiServiceContext {
  database: Database;
  identity: OwnerIdentity;
  service: PrismaAgentService;
}

function iso(value: DateLike): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function num(value: DecimalLike): number {
  return value == null ? 0 : Number(value.toString());
}

function apiEnum(value: unknown): string {
  return String(value).toLowerCase();
}

export function mapAgentOperationsError(error: unknown): ApiRequestError | unknown {
  if (!(error instanceof AgentOperationsError)) return error;
  const statusByCode: Record<string, number> = {
    INVALID_IDENTITY: 403,
    NOT_FOUND: 404,
    INVALID_INPUT: 422,
    CONFIG_INVALID: 422,
    CONFLICT: 409,
    BUDGET_EXCEEDED: 429,
    QUOTA_EXCEEDED: 429,
    CHAIN_CYCLE: 422,
    APPROVAL_STALE: 409,
    RUN_STATE_INVALID: 409,
  };
  return new ApiRequestError(error.code, error.message, { status: statusByCode[error.code] ?? 400, cause: error });
}

/** Adds the shared platform policy and converts safe agent-domain failures. */
export function withAgentApi<TRouteContext = unknown>(
  handler: AuthenticatedApiHandler<TRouteContext>,
  options: AuthenticatedApiOptions = {},
) {
  return withAuthenticatedApi<TRouteContext>(async (request, context, routeContext) => {
    try {
      return await handler(request, context, routeContext);
    } catch (error) {
      throw mapAgentOperationsError(error);
    }
  }, options);
}

export async function getAgentApiServiceContext(context: AuthContext): Promise<AgentApiServiceContext> {
  const database = getDatabaseClient();
  const owner = await resolveOwnerRecord(database, context.owner.id, context.owner.email);
  return {
    database,
    identity: {
      ownerSubject: owner.authSubject,
      ownerAccountId: owner.id,
      correlationId: context.requestId,
      actorType: "owner",
    },
    service: new PrismaAgentService(database),
  };
}

const toolAssignmentSchema = z.strictObject({
  id: z.string().trim().min(1).max(100),
  type: z.string().trim().min(1).max(50),
  config: z.record(z.string(), z.unknown()),
  enabled: z.boolean(),
});

const triggerConfigSchema = z.strictObject({
  type: z.enum(["manual", "scheduled", "event", "chain", "webhook"]),
  cronExpression: z.string().trim().max(100).nullable(),
  eventFilters: z.array(z.string().trim().min(1).max(100)),
  webhookPath: z.string().trim().max(200).nullable(),
  chainParentAgentId: z.string().uuid().nullable(),
});

export function mapAgentDto(detail: AgentDetail) {
  const core = agentDtoSchema.parse({
    id: detail.id,
    name: detail.name,
    description: detail.description,
    type: apiEnum(detail.type),
    status: apiEnum(detail.status),
    model: detail.model,
    systemPrompt: detail.systemPrompt,
    temperature: num(detail.temperature),
    maxTokens: detail.maxTokens,
    topP: num(detail.topP),
    frequencyPenalty: num(detail.frequencyPenalty),
    scheduleCron: detail.scheduleCron,
    dailyTokenBudget: detail.dailyTokenBudget,
    totalRuns: detail.totalRuns,
    totalCostUsd: num(detail.totalCostUsd),
    successRate: num(detail.successRate),
    lastRunAt: iso(detail.lastRunAt),
    lastRunStatus: detail.lastRunStatus ? apiEnum(detail.lastRunStatus) : null,
    currentConfigVersionId: detail.currentConfigVersionId,
    tools: detail.settings.tools,
    trigger: detail.settings.trigger,
    clientIds: detail.clientIds,
    createdAt: iso(detail.createdAt),
    updatedAt: iso(detail.updatedAt),
    archivedAt: iso(detail.archivedAt),
    deletedAt: iso(detail.deletedAt),
  });
  return {
    ...core,
    settings: {
      approvalRequired: detail.settings.approvalRequired,
      memoryEnabled: detail.settings.memoryEnabled,
    },
    memoryCount: detail.memoryCount,
    pendingApprovals: detail.pendingApprovals,
    tokensUsedToday: detail.tokensUsedToday,
    recentRuns: detail.recentRuns.map(mapRunDto),
    configVersions: detail.configVersions.map(mapConfigVersionDto),
  };
}

export function mapAgentSummary(agent: AgentListItem) {
  return agentSummarySchema.parse({
    id: agent.id,
    name: agent.name,
    type: apiEnum(agent.type),
    status: apiEnum(agent.status),
    model: agent.model,
    lastRunAt: iso(agent.lastRunAt),
    lastRunStatus: agent.lastRunStatus ? apiEnum(agent.lastRunStatus) : null,
    totalRuns: agent.totalRuns,
    totalCostUsd: num(agent.totalCostUsd),
    successRate: num(agent.successRate),
  });
}

export function mapRunDto(run: AgentRunRecord) {
  return agentRunDtoSchema.parse({
    id: run.id,
    agentId: run.agentId,
    clientId: run.clientId,
    configVersionId: run.configVersionId,
    parentRunId: run.parentRunId,
    status: apiEnum(run.status),
    triggerType: apiEnum(run.triggerType),
    idempotencyKey: run.idempotencyKey,
    inputText: run.inputText,
    outputText: run.outputText,
    partialOutput: run.partialOutput,
    tokensInput: run.tokensInput,
    tokensOutput: run.tokensOutput,
    costUsd: num(run.costUsd),
    durationMs: run.durationMs,
    attempt: run.attempt,
    errorMessage: run.errorMessage,
    metadata: (run.metadata && typeof run.metadata === "object" && !Array.isArray(run.metadata)
      ? run.metadata as EntityRecord
      : null),
    startedAt: iso(run.startedAt),
    completedAt: iso(run.completedAt),
    createdAt: iso(run.createdAt),
    updatedAt: iso(run.updatedAt),
    deletedAt: iso(run.deletedAt),
  });
}

export function mapRunSummary(run: AgentRunRecord) {
  return {
    id: run.id,
    agentId: run.agentId,
    clientId: run.clientId,
    status: apiEnum(run.status),
    triggerType: apiEnum(run.triggerType),
    tokensInput: run.tokensInput,
    tokensOutput: run.tokensOutput,
    costUsd: num(run.costUsd),
    durationMs: run.durationMs,
    attempt: run.attempt,
    errorMessage: run.errorMessage,
    startedAt: iso(run.startedAt),
    completedAt: iso(run.completedAt),
    createdAt: iso(run.createdAt),
  };
}

export function mapMemoryDto(memory: AgentMemoryRecord) {
  return agentMemoryDtoSchema.parse({
    id: memory.id,
    agentId: memory.agentId,
    clientId: memory.clientId,
    sourceRunId: memory.sourceRunId,
    kind: apiEnum(memory.kind),
    key: memory.key,
    value: memory.value,
    embeddingModel: memory.embeddingModel,
    version: memory.version,
    tokenCount: memory.tokenCount,
    sourceIds: memory.sourceIds,
    summarizedAt: iso(memory.summarizedAt),
    createdAt: iso(memory.createdAt),
    updatedAt: iso(memory.updatedAt),
    archivedAt: iso(memory.archivedAt),
    deletedAt: iso(memory.deletedAt),
  });
}

export function mapConfigVersionDto(version: AgentConfigVersionRecord) {
  return agentConfigVersionSchema.parse({
    version: version.version,
    model: version.model,
    systemPrompt: version.systemPrompt,
    temperature: num(version.temperature),
    maxTokens: version.maxTokens,
    topP: num(version.topP),
    frequencyPenalty: num(version.frequencyPenalty),
    tools: version.tools,
    triggerConfig: (version.triggerConfig && typeof version.triggerConfig === "object" && !Array.isArray(version.triggerConfig)
      ? version.triggerConfig as EntityRecord
      : null),
    configJson: (version.configJson && typeof version.configJson === "object" && !Array.isArray(version.configJson)
      ? version.configJson as EntityRecord
      : null),
    changeSummary: version.changeSummary,
    createdAt: iso(version.createdAt),
    createdBy: version.createdBy,
    deletedAt: null,
  });
}

export function mapApprovalDto(approval: ApprovalRecord) {
  return approvalDtoSchema.parse({
    id: approval.id,
    action: apiEnum(approval.action),
    status: apiEnum(approval.status),
    agentId: approval.agentId,
    agentRunId: approval.agentRunId,
    configVersionId: approval.configVersionId,
    entityType: approval.entityType,
    entityId: approval.entityId,
    entityVersion: approval.entityVersion,
    requestedBy: approval.requestedBy,
    decidedBy: approval.decidedBy,
    requestedAt: iso(approval.requestedAt),
    decidedAt: iso(approval.decidedAt),
    expiresAt: iso(approval.expiresAt),
    decisionNote: approval.decisionNote,
    payloadHash: approval.payloadHash,
    createdAt: iso(approval.createdAt),
    updatedAt: iso(approval.updatedAt),
    deletedAt: iso(approval.deletedAt),
  });
}

export { successResponse, withAuthenticatedApi };
export type { ApiSuccessOptions };

/** Success envelope without an `error` key (the client treats any error key as failure). */
export function agentSuccessResponse(data: unknown, requestId: string, options: { status?: number; meta?: Record<string, unknown> } = {}): ReturnType<typeof successResponse> {
  return successResponse(data, { requestId, ...(options.status ? { status: options.status } : {}), ...(options.meta ? { meta: options.meta as never } : {}) });
}
export { toolAssignmentSchema, triggerConfigSchema };

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

export interface IdempotentResult<T> {
  data: T;
  replayed: boolean;
}

/** Optional Idempotency-Key support for agent JSON mutations. */
export async function executeIdempotent<T>(
  request: Request,
  context: AgentApiServiceContext,
  operation: string,
  payload: unknown,
  execute: () => Promise<T>,
): Promise<IdempotentResult<T>> {
  const rawKey = request.headers.get("idempotency-key");
  if (!rawKey) return { data: await execute(), replayed: false };
  const parsedKey = idempotencyKeySchema.safeParse(rawKey);
  if (!parsedKey.success) {
    throw new ApiRequestError("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key is invalid.", { status: 422 });
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
      throw new ApiRequestError("IDEMPOTENCY_IN_PROGRESS", "An identical request is already processing.", { status: 409, headers: { "retry-after": "2" } });
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
      throw new ApiRequestError("IDEMPOTENCY_IN_PROGRESS", "An identical request is already processing.", { status: 409, headers: { "retry-after": "2" } });
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
