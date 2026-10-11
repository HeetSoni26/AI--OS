import type { Prisma, PrismaClient } from "../generated/client/client";
import {
  AgentRunStatus,
  AgentStatus,
  AgentTriggerType,
  AgentType,
  ApprovalAction,
  ApprovalStatus,
  MemoryKind,
} from "../generated/client/enums";
import { randomUUID } from "node:crypto";
import { AgentOperationsError } from "./errors";
import {
  assertDailyBudgetAvailable,
  requireActiveAgent,
  tokensUsedToday,
  upsertAgentGraphProjection,
} from "./internal";
import {
  MAX_RUN_ATTEMPTS,
  MODEL_CATALOG,
  agentStatusToDb,
  canTransitionRunStatus,
  chainDepthExceeded,
  computePayloadHash,
  detectChainCycle,
  normalizeCronExpression,
  triggerTypeToDb,
  validateCronExpression,
} from "./policy";
import type { OwnerIdentity } from "../clients/types";
import { requireActiveOwnerInTransaction } from "../clients/internal";
import { recordNotification } from "../knowledge/service";
import { NotificationPriority, NotificationType } from "../generated/client/enums";
import type {
  AgentConfigVersionRecord,
  AgentDetail,
  AgentListItem,
  AgentRunRecord,
  AgentSettings,
  ApprovalRecord,
  BudgetStatus,
  CreateAgentInput,
  CreateMemoryInput,
  DecideApprovalInput,
  DispatchRunInput,
  ListAgentsInput,
  ListAgentsResult,
  ListMemoriesInput,
  ListMemoriesResult,
  ListRunsInput,
  ListRunsResult,
  RequestApprovalInput,
  UpdateAgentInput,
  UpdateMemoryInput,
  AgentMemoryRecord,
} from "./types";

const AGENT_LIST_LIMIT = 50;
const MAX_AGENT_LIST_LIMIT = 100;
const RUN_LIST_LIMIT = 25;
const MEMORY_LIST_LIMIT = 50;
const MAX_CHAIN_OUT_DEGREE = 5;
const OUTPUT_MEMORY_MAX_CHARS = 4_000;

const MAX_TEMPERATURE = 2;
const MAX_TOP_P = 1;
const MAX_FREQUENCY_PENALTY = 2;
const MAX_TOKENS_LIMIT = 128_000;
const MAX_DAILY_TOKEN_BUDGET = 10_000_000;

type Database = PrismaClient;
type Transaction = Prisma.TransactionClient;
type AgentRow = Awaited<ReturnType<Database["agent"]["findFirstOrThrow"]>>;
type RunRow = Awaited<ReturnType<Database["agentRun"]["findUniqueOrThrow"]>>;

const DEFAULT_SETTINGS: AgentSettings = {
  tools: [],
  trigger: { type: "manual", cronExpression: null, eventFilters: [], webhookPath: null, chainParentAgentId: null },
  approvalRequired: false,
  memoryEnabled: true,
};

function decodeSettings(value: Prisma.JsonValue | null): AgentSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_SETTINGS, trigger: { ...DEFAULT_SETTINGS.trigger }, tools: [] };
  }
  const record = value as Record<string, unknown>;
  const defaults = DEFAULT_SETTINGS.trigger;
  let trigger = { ...defaults };
  if (record.trigger && typeof record.trigger === "object" && !Array.isArray(record.trigger)) {
    const t = record.trigger as Record<string, unknown>;
    trigger = {
      type: typeof t.type === "string" ? (t.type as AgentSettings["trigger"]["type"]) : "manual",
      cronExpression: typeof t.cronExpression === "string" ? t.cronExpression : null,
      eventFilters: Array.isArray(t.eventFilters) ? t.eventFilters.filter((f): f is string => typeof f === "string") : [],
      webhookPath: typeof t.webhookPath === "string" ? t.webhookPath : null,
      chainParentAgentId: typeof t.chainParentAgentId === "string" ? t.chainParentAgentId : null,
    };
  }
  const tools = Array.isArray(record.tools)
    ? record.tools
      .filter((tool): tool is Record<string, unknown> => Boolean(tool) && typeof tool === "object" && !Array.isArray(tool))
      .map((tool) => ({
        id: typeof tool.id === "string" ? tool.id : randomUUID(),
        type: typeof tool.type === "string" ? tool.type : "custom",
        config: tool.config && typeof tool.config === "object" && !Array.isArray(tool.config) ? tool.config as Record<string, unknown> : {},
        enabled: tool.enabled !== false,
      }))
    : [];
  return {
    tools,
    trigger,
    approvalRequired: record.approvalRequired === true,
    memoryEnabled: record.memoryEnabled !== false,
    clientIds: Array.isArray(record.clientIds) ? record.clientIds.filter((id): id is string => typeof id === "string") : [],
  };
}

function numberOrThrow(value: number | string | undefined, field: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new AgentOperationsError("CONFIG_INVALID", `${field} must be between ${min} and ${max}.`);
  }
  return numeric;
}

function requireModel(model: string | undefined): string {
  if (model === undefined) throw new AgentOperationsError("CONFIG_INVALID", "A model is required.");
  if (!(model in MODEL_CATALOG)) {
    throw new AgentOperationsError("CONFIG_INVALID", `Model ${model} is not in the provider catalog.`);
  }
  return model;
}

function normalizeTrigger(input: CreateAgentInput["trigger"] | UpdateAgentInput["trigger"]): AgentSettings["trigger"] {
  const type = (input?.type ?? "manual").toLowerCase() as AgentSettings["trigger"]["type"];
  if (!["manual", "scheduled", "event", "chain", "webhook"].includes(type)) {
    throw new AgentOperationsError("CONFIG_INVALID", `Trigger type ${type} is not supported.`);
  }
  const cronExpression = normalizeCronExpression(input?.cronExpression ?? null);
  if (type === "scheduled") {
    if (!cronExpression) throw new AgentOperationsError("CONFIG_INVALID", "Scheduled triggers require a cron expression.");
    if (!validateCronExpression(cronExpression)) {
      throw new AgentOperationsError("CONFIG_INVALID", `The cron expression ${cronExpression} is invalid.`);
    }
  }
  const chainParentAgentId = input?.chainParentAgentId ?? null;
  if (type === "chain" && !chainParentAgentId) {
    throw new AgentOperationsError("CONFIG_INVALID", "Chained triggers require a parent agent.");
  }
  if (type === "webhook" && !input?.webhookPath?.trim()) {
    throw new AgentOperationsError("CONFIG_INVALID", "Webhook triggers require a webhook path.");
  }
  return {
    type,
    cronExpression: type === "scheduled" ? cronExpression : null,
    eventFilters: (input?.eventFilters ?? []).map((filter) => filter.trim()).filter(Boolean).slice(0, 20),
    webhookPath: input?.webhookPath?.trim() || null,
    chainParentAgentId,
  };
}

function normalizeTools(tools: CreateAgentInput["tools"] | undefined): AgentSettings["tools"] {
  const seen = new Set<string>();
  return (tools ?? []).map((tool) => {
    const id = tool.id?.trim() || randomUUID();
    if (seen.has(id)) throw new AgentOperationsError("CONFIG_INVALID", `Tool id ${id} is duplicated.`);
    seen.add(id);
    return {
      id,
      type: tool.type?.trim() || "custom",
      config: { ...(tool.config ?? {}) },
      enabled: tool.enabled !== false,
    };
  });
}

function statusForTrigger(trigger: AgentSettings["trigger"]): AgentStatus {
  return trigger.type === "scheduled" && trigger.cronExpression ? AgentStatus.SCHEDULED : AgentStatus.IDLE;
}

function configJsonFor(settings: AgentSettings): Prisma.InputJsonValue {
  return {
    tools: settings.tools.map((tool) => ({
      id: tool.id,
      type: tool.type,
      config: tool.config as unknown as Prisma.InputJsonObject,
      enabled: tool.enabled,
    })),
    trigger: settings.trigger as unknown as Prisma.InputJsonObject,
    approvalRequired: settings.approvalRequired,
    memoryEnabled: settings.memoryEnabled,
    ...(settings.clientIds ? { clientIds: settings.clientIds } : {}),
  } as unknown as Prisma.InputJsonValue;
}

function mapConfigVersion(row: {
  id: string;
  agentId: string;
  version: number;
  model: string;
  systemPrompt: string;
  temperature: Prisma.Decimal;
  maxTokens: number;
  topP: Prisma.Decimal;
  frequencyPenalty: Prisma.Decimal;
  tools: string[];
  triggerConfig: Prisma.JsonValue | null;
  configJson: Prisma.JsonValue | null;
  changeSummary: string | null;
  createdAt: Date;
  createdBy: string | null;
}): AgentConfigVersionRecord {
  return { ...row };
}

function mapRun(row: RunRow): AgentRunRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    clientId: row.clientId,
    configVersionId: row.configVersionId,
    parentRunId: row.parentRunId,
    status: row.status,
    triggerType: row.triggerType,
    idempotencyKey: row.idempotencyKey,
    inputText: row.inputText,
    outputText: row.outputText,
    partialOutput: row.partialOutput,
    tokensInput: row.tokensInput,
    tokensOutput: row.tokensOutput,
    costUsd: row.costUsd,
    durationMs: row.durationMs,
    attempt: row.attempt,
    errorMessage: row.errorMessage,
    metadata: row.metadata,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function mapAgentListItem(row: AgentRow): AgentListItem {
  const settings = decodeSettings(row.configJson);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    status: row.status,
    model: row.model,
    systemPrompt: row.systemPrompt,
    temperature: row.temperature,
    maxTokens: row.maxTokens,
    topP: row.topP,
    frequencyPenalty: row.frequencyPenalty,
    scheduleCron: row.scheduleCron,
    dailyTokenBudget: row.dailyTokenBudget,
    totalRuns: row.totalRuns,
    totalCostUsd: row.totalCostUsd,
    successRate: row.successRate,
    lastRunAt: row.lastRunAt,
    lastRunStatus: row.lastRunStatus,
    currentConfigVersionId: row.currentConfigVersionId,
    settings,
    clientIds: settings.clientIds ?? [],
    archivedAt: row.archivedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as AgentListItem;
}

async function assertClientIdsExist(transaction: Transaction, clientIds: readonly string[]): Promise<void> {
  if (!clientIds.length) return;
  const found = await transaction.client.findMany({
    where: { id: { in: [...clientIds] }, deletedAt: null },
    select: { id: true },
  });
  if (found.length !== new Set(clientIds).size) {
    throw new AgentOperationsError("INVALID_INPUT", "One or more assigned clients do not exist.");
  }
}

async function systemIdentity(database: Database, correlationId: string) {
  const owner = await database.ownerAccount.findFirst({
    where: { active: true },
    select: { id: true, authSubject: true },
  });
  if (!owner) throw new AgentOperationsError("INVALID_IDENTITY", "No active owner account exists for worker actions.");
  return {
    ownerSubject: owner.authSubject,
    ownerAccountId: owner.id,
    correlationId,
    actorType: "worker" as const,
  };
}

interface DirectRealtimeEventInput {
  channel: "agent:status" | "graph:updates";
  event: "status_changed" | "run_completed" | "run_failed" | "node_updated";
  payload: Record<string, unknown>;
}

/**
 * Writes durable direct realtime events. The outbox publisher validates and
 * broadcasts them to the owner's private Supabase channels without reconstruction.
 */
async function emitDirectRealtimeEvents(
  transaction: Transaction,
  ownerAccountId: string,
  correlationId: string,
  events: readonly DirectRealtimeEventInput[],
): Promise<void> {
  for (const event of events) {
    const eventId = randomUUID();
    const occurredAt = new Date();
    // node_updated payloads identify the node by nodeId/entityId; status and run
    // events use agentId (the graph node id). All must resolve to uuid columns.
    const aggregateId = firstUuidLike(
      event.payload.agentId,
      event.payload.nodeId,
      event.payload.entityId,
    ) ?? eventId;
    await transaction.outboxEvent.create({
      data: {
        id: eventId,
        aggregateType: "agent",
        aggregateId,
        eventType: "graph.realtime.v1",
        payload: {
          eventId,
          schemaVersion: 1,
          ownerId: ownerAccountId,
          correlationId,
          occurredAt: occurredAt.toISOString(),
          eventType: "graph.realtime.v1",
          entityType: "agent",
          aggregateId,
          payload: {
            realtimeEvent: {
              eventId,
              schemaVersion: 1,
              occurredAt: occurredAt.toISOString(),
              channel: event.channel,
              event: event.event,
              payload: event.payload as unknown as Prisma.InputJsonObject,
            },
          } as unknown as Prisma.InputJsonObject,
        } as unknown as Prisma.InputJsonValue,
        correlationId,
        idempotencyKey: `${eventId}:realtime`,
        occurredAt,
      },
    });
  }
}

function firstUuidLike(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return value;
    }
  }
  return null;
}

/**
 * Creates the pending human-in-the-loop approval checkpoint for a queued run.
 * The payload hash pins the exact config version, prompt, model, and input so
 * approval cannot be replayed against mutated artifacts.
 */
async function createRunApprovalRecord(
  transaction: Transaction,
  requestedBy: string,
  agent: { id: string; model: string; systemPrompt: string; currentConfigVersionId: string | null },
  run: { id: string; configVersionId: string | null; inputText: string | null },
): Promise<void> {
  const existing = await transaction.approval.findFirst({
    where: { agentRunId: run.id, status: ApprovalStatus.PENDING, deletedAt: null },
  });
  if (existing) return;
  await transaction.approval.create({
    data: {
      action: ApprovalAction.AGENT_TOOL_USE,
      status: ApprovalStatus.PENDING,
      agentId: agent.id,
      agentRunId: run.id,
      configVersionId: run.configVersionId,
      entityType: "agent_run",
      entityId: run.id,
      requestedBy,
      payloadHash: computePayloadHash({
        runId: run.id,
        configVersionId: run.configVersionId,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        inputText: run.inputText,
      }),
      decisionNote: "Human-in-the-loop checkpoint before consequential execution.",
    },
  });
}

async function agentGraphNodeId(transaction: Transaction, agentId: string): Promise<string> {
  const node = await transaction.graphNode.findUnique({
    where: { stableKey: `agent:${agentId}` },
    select: { id: true },
  });
  return node?.id ?? agentId;
}

function agentGraphAction(status: string): "active_running" | "failed" | "scheduled" | "blocked" | null {
  if (status === "RUNNING") return "active_running";
  if (status === "ERROR") return "failed";
  if (status === "SCHEDULED") return "scheduled";
  if (status === "PAUSED") return "blocked";
  return null;
}

/**
 * Builds the pair of realtime events for an agent status change: the
 * `agent:status` channel event and a `graph:updates` node update so the
 * knowledge graph reflects live status without a reload.
 */
async function agentStatusEvents(
  transaction: Transaction,
  agent: { id: string; name: string; type: string; status: string; lastRunAt: Date | null; totalRuns: number },
  message?: string,
): Promise<DirectRealtimeEventInput[]> {
  const nodeId = await agentGraphNodeId(transaction, agent.id);
  const status = String(agent.status).toLowerCase().slice(0, 100);
  const tag = String(agent.type).toLowerCase().slice(0, 100);
  return [
    {
      channel: "agent:status",
      event: "status_changed",
      payload: {
        agentId: nodeId,
        status: status as "running" | "idle" | "error" | "scheduled" | "paused",
        ...(message ? { message: message.slice(0, 500) } : {}),
      },
    },
    {
      channel: "graph:updates",
      event: "node_updated",
      payload: {
        nodeId,
        stableKey: `agent:${agent.id}`,
        entityId: agent.id,
        changes: {
          label: agent.name.slice(0, 255),
          summary: `${tag.replaceAll("_", " ")} agent`.slice(0, 1_000),
          status,
          action: agentGraphAction(agent.status),
          tags: [tag],
          hubKeys: ["agents"],
          position: null,
          metadata: {
            name: agent.name.slice(0, 255),
            status: status as "running" | "idle" | "error" | "scheduled" | "paused",
            lastRun: agent.lastRunAt?.toISOString() ?? null,
            tasksCompleted: agent.totalRuns,
          },
        },
      },
    },
  ];
}

export class PrismaAgentService {
  constructor(private readonly database: Database) {}

  // ── Configuration ─────────────────────────────────────────────────────────

  async listAgents(identity: OwnerIdentity, input: ListAgentsInput = {}): Promise<ListAgentsResult> {
    const owner = await this.database.ownerAccount.findFirst({ where: { authSubject: identity.ownerSubject, active: true }, select: { id: true } });
    if (!owner) throw new AgentOperationsError("INVALID_IDENTITY", "The authenticated owner is not active.");
    const limit = Math.max(1, Math.min(input.limit ?? AGENT_LIST_LIMIT, MAX_AGENT_LIST_LIMIT));
    const where: Prisma.AgentWhereInput = { deletedAt: null };
    if (input.lifecycle === "active" || !input.lifecycle) where.archivedAt = null;
    if (input.lifecycle === "archived") where.archivedAt = { not: null };
    const types = (input.types ?? []).map((type) => type.toUpperCase());
    if (types.length) where.type = { in: types as Prisma.EnumAgentTypeFilter["in"] };
    const statuses = (input.statuses ?? []).map((status) => status.toUpperCase());
    if (statuses.length) where.status = { in: statuses as AgentStatus[] };
    const q = input.q?.trim();
    if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }];
    if (input.clientId) where.assignments = { some: { project: { clientId: input.clientId }, archivedAt: null, deletedAt: null } };
    const total = await this.database.agent.count({ where });

    const rows = await this.database.agent.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible.at(-1);
    return {
      items: visible.map(mapAgentListItem),
      hasMore,
      nextCursor: hasMore && last ? last.id : null,
      total,
    };
  }

  async getAgentDetail(identity: OwnerIdentity, agentId: string): Promise<AgentDetail> {
    await this.requireActiveOwner(identity);
    const agent = await this.database.agent.findFirst({
      where: { id: agentId, deletedAt: null },
      include: {
        currentConfigVersion: true,
        configVersions: { orderBy: [{ version: "desc" }, { id: "asc" }], take: 20, where: { deletedAt: null } },
        runs: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, where: { deletedAt: null } },
      },
    });
    if (!agent) throw new AgentOperationsError("NOT_FOUND", "Agent not found.");
    const [memoryCount, pendingApprovals, usedToday] = await Promise.all([
      this.database.agentMemory.count({ where: { agentId, deletedAt: null } }),
      this.database.approval.count({ where: { agentId, status: ApprovalStatus.PENDING, deletedAt: null } }),
      tokensUsedToday(this.database, agentId, new Date()),
    ]);
    return {
      ...mapAgentListItem(agent),
      configVersion: agent.currentConfigVersion ? mapConfigVersion(agent.currentConfigVersion) : null,
      recentRuns: agent.runs.map(mapRun),
      configVersions: agent.configVersions.map(mapConfigVersion),
      memoryCount,
      pendingApprovals,
      tokensUsedToday: usedToday,
    };
  }

  async createAgent(identity: OwnerIdentity, input: CreateAgentInput): Promise<AgentDetail> {
    const name = input.name?.trim();
    if (!name) throw new AgentOperationsError("CONFIG_INVALID", "Agent name is required.");
    const model = requireModel(input.model);
    const temperature = numberOrThrow(input.temperature, "temperature", 0, MAX_TEMPERATURE) ?? 0.7;
    const topP = numberOrThrow(input.topP, "top_p", 0, MAX_TOP_P) ?? 1;
    const frequencyPenalty = numberOrThrow(input.frequencyPenalty, "frequency_penalty", -MAX_FREQUENCY_PENALTY, MAX_FREQUENCY_PENALTY) ?? 0;
    const maxTokens = input.maxTokens ?? 4_096;
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_TOKENS_LIMIT) {
      throw new AgentOperationsError("CONFIG_INVALID", "maxTokens must be between 1 and 128000.");
    }
    if (input.dailyTokenBudget != null && (!Number.isInteger(input.dailyTokenBudget) || input.dailyTokenBudget < 1 || input.dailyTokenBudget > MAX_DAILY_TOKEN_BUDGET)) {
      throw new AgentOperationsError("CONFIG_INVALID", "dailyTokenBudget must be a positive integer.");
    }
    if (!input.systemPrompt?.trim()) throw new AgentOperationsError("CONFIG_INVALID", "A system prompt is required.");
    const settings: AgentSettings = {
      tools: normalizeTools(input.tools),
      trigger: normalizeTrigger(input.trigger),
      approvalRequired: input.approvalRequired === true,
      memoryEnabled: input.memoryEnabled !== false,
    };
    if (input.clientIds?.length) settings.clientIds = [...input.clientIds];
    const status = statusForTrigger(settings.trigger);
    const agentId = randomUUID();

    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      if (settings.clientIds?.length) await assertClientIdsExist(transaction, settings.clientIds);
      if (settings.trigger.type === "chain" && settings.trigger.chainParentAgentId) {
        await this.assertChainEdgeAllowed(transaction, settings.trigger.chainParentAgentId, agentId);
      }
      const agent = await transaction.agent.create({
        data: {
          id: agentId,
          name,
          description: input.description?.trim() || null,
          type: agentTypeToDb(input.type),
          status,
          model,
          systemPrompt: input.systemPrompt.trim(),
          temperature,
          maxTokens,
          topP,
          frequencyPenalty,
          scheduleCron: settings.trigger.cronExpression,
          dailyTokenBudget: input.dailyTokenBudget ?? null,
          configJson: configJsonFor(settings),
        },
      });
      const version = await transaction.agentConfigVersion.create({
        data: {
          agentId: agent.id,
          version: 1,
          model,
          systemPrompt: input.systemPrompt.trim(),
          temperature,
          maxTokens,
          topP,
          frequencyPenalty,
          tools: settings.tools.filter((tool) => tool.enabled).map((tool) => tool.id),
          triggerConfig: settings.trigger as unknown as Prisma.InputJsonValue,
          configJson: configJsonFor(settings),
          changeSummary: "Initial configuration",
          createdBy: identity.ownerSubject,
        },
      });
      await transaction.agent.update({ where: { id: agent.id }, data: { currentConfigVersionId: version.id } });
      await upsertAgentGraphProjection(transaction, { ...agent, status: agent.status });
      await this.emitStatusChange(transaction, identity.ownerAccountId, identity.correlationId, agent.id);
      await appendAgentMutationRecords(transaction, identity, [{
        entityType: "agent",
        entityId: agent.id,
        action: "create",
        eventType: "agent.created",
        payload: { name: agent.name, type: agent.type, model: agent.model },
        changedFields: ["name", "type", "model", "systemPrompt"],
      }]);
      return this.getAgentDetailInTransaction(transaction, agent.id);
    });
  }

  async updateAgent(identity: OwnerIdentity, agentId: string, input: UpdateAgentInput): Promise<AgentDetail> {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const agent = await requireActiveAgent(transaction, agentId);
      const currentSettings = decodeSettings(agent.configJson);
      const settings: AgentSettings = {
        tools: input.tools ? normalizeTools(input.tools) : currentSettings.tools,
        trigger: input.trigger ? normalizeTrigger(input.trigger) : currentSettings.trigger,
        approvalRequired: input.approvalRequired ?? currentSettings.approvalRequired,
        memoryEnabled: input.memoryEnabled ?? currentSettings.memoryEnabled,
      };
      if (input.clientIds !== undefined) settings.clientIds = [...input.clientIds];
      else if (currentSettings.clientIds) settings.clientIds = currentSettings.clientIds;

      const model = input.model !== undefined ? requireModel(input.model) : agent.model;
      const temperature = numberOrThrow(input.temperature, "temperature", 0, MAX_TEMPERATURE) ?? Number(agent.temperature);
      const topP = numberOrThrow(input.topP, "top_p", 0, MAX_TOP_P) ?? Number(agent.topP);
      const frequencyPenalty = numberOrThrow(input.frequencyPenalty, "frequency_penalty", -MAX_FREQUENCY_PENALTY, MAX_FREQUENCY_PENALTY) ?? Number(agent.frequencyPenalty);
      const maxTokens = input.maxTokens ?? agent.maxTokens;
      if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_TOKENS_LIMIT) {
        throw new AgentOperationsError("CONFIG_INVALID", "maxTokens must be between 1 and 128000.");
      }
      const systemPrompt = input.systemPrompt !== undefined ? input.systemPrompt.trim() : agent.systemPrompt;
      if (!systemPrompt) throw new AgentOperationsError("CONFIG_INVALID", "A system prompt is required.");
      if (input.dailyTokenBudget !== undefined && input.dailyTokenBudget !== null
        && (!Number.isInteger(input.dailyTokenBudget) || input.dailyTokenBudget < 1 || input.dailyTokenBudget > MAX_DAILY_TOKEN_BUDGET)) {
        throw new AgentOperationsError("CONFIG_INVALID", "dailyTokenBudget must be a positive integer.");
      }

      if (settings.trigger.type === "chain" && settings.trigger.chainParentAgentId) {
        await this.assertChainEdgeAllowed(transaction, settings.trigger.chainParentAgentId, agentId);
      }
      if (settings.clientIds?.length) await assertClientIdsExist(transaction, settings.clientIds);

      const configChanged = model !== agent.model
        || systemPrompt !== agent.systemPrompt
        || temperature !== Number(agent.temperature)
        || topP !== Number(agent.topP)
        || frequencyPenalty !== Number(agent.frequencyPenalty)
        || maxTokens !== agent.maxTokens
        || JSON.stringify(settings.tools) !== JSON.stringify(currentSettings.tools)
        || JSON.stringify(settings.trigger) !== JSON.stringify(currentSettings.trigger);

      const nextStatus = agent.status === AgentStatus.PAUSED || agent.status === AgentStatus.RUNNING
        ? agent.status
        : statusForTrigger(settings.trigger);

      const updated = await transaction.agent.update({
        where: { id: agentId },
        data: {
          name: input.name?.trim() || agent.name,
          description: input.description === undefined ? agent.description : input.description?.trim() || null,
          type: input.type ? agentTypeToDb(input.type) : agent.type,
          status: nextStatus,
          model,
          systemPrompt,
          temperature,
          maxTokens,
          topP,
          frequencyPenalty,
          scheduleCron: settings.trigger.cronExpression,
          dailyTokenBudget: input.dailyTokenBudget === undefined ? agent.dailyTokenBudget : input.dailyTokenBudget,
          configJson: configJsonFor(settings),
        },
      });

      if (configChanged) {
        const latest = await transaction.agentConfigVersion.findFirst({
          where: { agentId }, orderBy: { version: "desc" }, select: { version: true },
        });
        await transaction.agentConfigVersion.create({
          data: {
            agentId,
            version: (latest?.version ?? 0) + 1,
            model,
            systemPrompt,
            temperature,
            maxTokens,
            topP,
            frequencyPenalty,
            tools: settings.tools.filter((tool) => tool.enabled).map((tool) => tool.id),
            triggerConfig: settings.trigger as unknown as Prisma.InputJsonValue,
            configJson: configJsonFor(settings),
            changeSummary: input.changeSummary?.trim() || "Configuration updated",
            createdBy: identity.ownerSubject,
          },
        });
        // Editing a configuration invalidates approvals of pending runs (SRS authority rule).
        await transaction.approval.updateMany({
          where: { agentId, status: ApprovalStatus.PENDING, deletedAt: null },
          data: { status: ApprovalStatus.EXPIRED, decidedAt: new Date(), decisionNote: "Invalidated by configuration edit." },
        });
      }

      await upsertAgentGraphProjection(transaction, updated);
      if (nextStatus !== agent.status) {
        await this.emitStatusChange(transaction, identity.ownerAccountId, identity.correlationId, agentId);
      }
      await appendAgentMutationRecords(transaction, identity, [{
        entityType: "agent",
        entityId: agentId,
        action: "update",
        eventType: "agent.updated",
        payload: { name: updated.name, model: updated.model },
        changedFields: Object.keys(input),
      }]);
      return this.getAgentDetailInTransaction(transaction, agentId);
    });
  }

  async archiveAgent(identity: OwnerIdentity, agentId: string): Promise<AgentDetail> {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const agent = await requireActiveAgent(transaction, agentId);
      await this.cancelQueuedRuns(transaction, agentId, "Cancelled because the agent was archived.");
      const updated = await transaction.agent.update({
        where: { id: agentId },
        data: { archivedAt: new Date(), status: AgentStatus.PAUSED },
      });
      await upsertAgentGraphProjection(transaction, updated);
      await this.emitStatusChange(transaction, identity.ownerAccountId, identity.correlationId, agentId, "Agent archived.");
      await appendAgentMutationRecords(transaction, identity, [{
        entityType: "agent",
        entityId: agentId,
        action: "archive",
        eventType: "agent.archived",
        payload: { name: agent.name },
      }]);
      return this.getAgentDetailInTransaction(transaction, agentId);
    });
  }

  async deleteAgent(identity: OwnerIdentity, agentId: string): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const agent = await requireActiveAgent(transaction, agentId);
      await this.cancelQueuedRuns(transaction, agentId, "Cancelled because the agent was deleted.");
      const updated = await transaction.agent.update({
        where: { id: agentId },
        data: { deletedAt: new Date(), status: AgentStatus.PAUSED },
      });
      await upsertAgentGraphProjection(transaction, updated);
      await this.emitStatusChange(transaction, identity.ownerAccountId, identity.correlationId, agentId, "Agent deleted.");
      await appendAgentMutationRecords(transaction, identity, [{
        entityType: "agent",
        entityId: agentId,
        action: "delete",
        eventType: "agent.deleted",
        payload: { name: agent.name },
      }]);
    });
  }

  async setAgentStatus(identity: OwnerIdentity, agentId: string, next: "paused" | "resumed"): Promise<AgentDetail> {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const agent = await requireActiveAgent(transaction, agentId);
      if (agent.archivedAt) throw new AgentOperationsError("CONFLICT", "Archived agents cannot change status.");
      let status: AgentStatus;
      if (next === "paused") {
        if (agent.status === AgentStatus.PAUSED) return this.getAgentDetailInTransaction(transaction, agentId);
        await this.cancelQueuedRuns(transaction, agentId, "Cancelled because the agent was paused.");
        status = AgentStatus.PAUSED;
      } else {
        if (agent.status !== AgentStatus.PAUSED && agent.status !== AgentStatus.ERROR) {
          return this.getAgentDetailInTransaction(transaction, agentId);
        }
        const settings = decodeSettings(agent.configJson);
        status = statusForTrigger(settings.trigger);
      }
      const updated = await transaction.agent.update({ where: { id: agentId }, data: { status } });
      await upsertAgentGraphProjection(transaction, updated);
      await this.emitStatusChange(
        transaction,
        identity.ownerAccountId,
        identity.correlationId,
        agentId,
        next === "paused" ? "Paused by owner." : "Resumed by owner.",
      );
      await appendAgentMutationRecords(transaction, identity, [{
        entityType: "agent",
        entityId: agentId,
        action: next === "paused" ? "pause" : "resume",
        eventType: next === "paused" ? "agent.paused" : "agent.resumed",
        payload: { name: agent.name, status },
      }]);
      return this.getAgentDetailInTransaction(transaction, agentId);
    });
  }

  // ── Runs ──────────────────────────────────────────────────────────────────

  async dispatchRun(identity: OwnerIdentity, agentId: string, input: DispatchRunInput = {}): Promise<AgentRunRecord> {
    const triggerType = triggerTypeToDb((input.triggerType ?? "manual").toLowerCase());
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const agent = await requireActiveAgent(transaction, agentId);
      if (agent.archivedAt) throw new AgentOperationsError("CONFLICT", "Archived agents cannot run.");
      if (agent.status === AgentStatus.PAUSED) throw new AgentOperationsError("CONFLICT", "Paused agents cannot run. Resume the agent first.");
      await assertDailyBudgetAvailable(transaction, agentId, agent.dailyTokenBudget);
      if (input.clientId) await assertClientIdsExist(transaction, [input.clientId]);
      const settings = decodeSettings(agent.configJson);
      if (input.clientId && settings.clientIds?.length && !settings.clientIds.includes(input.clientId)) {
        throw new AgentOperationsError("INVALID_INPUT", "The client is not assigned to this agent.");
      }
      const metadata: Record<string, unknown> = {};
      if (settings.approvalRequired) metadata.awaitingApproval = true;
      if (input.parentRunId) {
        metadata.chainDepth = input.chainDepth ?? 1;
        metadata.parentRunId = input.parentRunId;
      }
      const run = await transaction.agentRun.create({
        data: {
          agentId,
          clientId: input.clientId ?? null,
          configVersionId: agent.currentConfigVersionId,
          parentRunId: input.parentRunId ?? null,
          status: AgentRunStatus.QUEUED,
          triggerType,
          idempotencyKey: input.idempotencyKey?.trim() || null,
          inputText: input.inputText?.trim() || null,
          metadata: metadata as Prisma.InputJsonValue,
        },
      }).catch(async (error: unknown) => {
        if (isUniqueViolation(error)) {
          const existing = await transaction.agentRun.findFirst({ where: { idempotencyKey: input.idempotencyKey!.trim() } });
          if (existing) return existing;
        }
        throw error;
      });
      if (settings.approvalRequired) {
        await createRunApprovalRecord(transaction, identity.ownerSubject, agent, run);
      }
      if (agent.status !== AgentStatus.RUNNING) {
        const updated = await transaction.agent.update({ where: { id: agentId }, data: { status: AgentStatus.RUNNING } });
        await upsertAgentGraphProjection(transaction, updated);
        await this.emitStatusChange(transaction, identity.ownerAccountId, identity.correlationId, agentId);
      }
      await appendAgentMutationRecords(transaction, identity, [{
        entityType: "agent_run",
        entityId: run.id,
        action: "queue",
        eventType: "agent.run.queued",
        payload: { agentId, triggerType, awaitingApproval: settings.approvalRequired },
      }]);
      return mapRun(run);
    });
  }

  async listRuns(identity: OwnerIdentity, input: ListRunsInput = {}): Promise<ListRunsResult> {
    await this.requireActiveOwner(identity);
    const limit = Math.max(1, Math.min(input.limit ?? RUN_LIST_LIMIT, 100));
    const where: Prisma.AgentRunWhereInput = { deletedAt: null };
    if (input.agentId) where.agentId = input.agentId;
    if (input.clientId) where.clientId = input.clientId;
    const statuses = (input.statuses ?? []).map((status) => status.toUpperCase());
    if (statuses.length) where.status = { in: statuses as AgentRunStatus[] };
    const triggerTypes = (input.triggerTypes ?? []).map((type) => type.toUpperCase());
    if (triggerTypes.length) where.triggerType = { in: triggerTypes as AgentTriggerType[] };
    if (input.fromDate || input.toDate) {
      where.createdAt = { ...(input.fromDate ? { gte: input.fromDate } : {}), ...(input.toDate ? { lte: input.toDate } : {}) };
    }
    const total = await this.database.agentRun.count({ where });
    const rows = await this.database.agentRun.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: visible.map(mapRun),
      hasMore,
      nextCursor: hasMore && visible.at(-1) ? visible.at(-1)!.id : null,
      total,
    };
  }

  async getRun(identity: OwnerIdentity, runId: string): Promise<AgentRunRecord> {
    await this.requireActiveOwner(identity);
    const run = await this.database.agentRun.findFirst({ where: { id: runId, deletedAt: null } });
    if (!run) throw new AgentOperationsError("NOT_FOUND", "Run not found.");
    return mapRun(run);
  }

  async cancelRun(identity: OwnerIdentity, runId: string): Promise<AgentRunRecord> {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const run = await transaction.agentRun.findFirst({ where: { id: runId, deletedAt: null } });
      if (!run) throw new AgentOperationsError("NOT_FOUND", "Run not found.");
      if (!canTransitionRunStatus(run.status, "cancelled")) {
        throw new AgentOperationsError("RUN_STATE_INVALID", `A ${run.status.toLowerCase()} run cannot be cancelled.`);
      }
      const updated = await transaction.agentRun.update({
        where: { id: runId },
        data: { status: AgentRunStatus.CANCELLED, completedAt: new Date(), errorMessage: "Cancelled by owner." },
      });
      await this.refreshAgentAggregates(transaction, run.agentId);
      return mapRun(updated);
    });
  }

  // ── Runtime-internal worker operations (no owner identity) ────────────────

  /** Worker-path dispatch used by the scheduler and chain triggers. */
  async dispatchSystemRun(correlationId: string, agentId: string, input: DispatchRunInput = {}): Promise<AgentRunRecord> {
    const triggerType = triggerTypeToDb((input.triggerType ?? "scheduled").toLowerCase());
    return this.database.$transaction(async (transaction) => {
      const agent = await transaction.agent.findFirst({ where: { id: agentId, deletedAt: null, archivedAt: null } });
      if (!agent) throw new AgentOperationsError("NOT_FOUND", "Agent not found.");
      if (agent.status === AgentStatus.PAUSED) throw new AgentOperationsError("CONFLICT", "Paused agents cannot run.");
      await assertDailyBudgetAvailable(transaction, agentId, agent.dailyTokenBudget);
      const settings = decodeSettings(agent.configJson);
      const metadata: Record<string, unknown> = {};
      if (settings.approvalRequired) metadata.awaitingApproval = true;
      if (input.parentRunId) {
        metadata.chainDepth = input.chainDepth ?? 1;
        metadata.parentRunId = input.parentRunId;
      }
      const run = await transaction.agentRun.create({
        data: {
          agentId,
          clientId: input.clientId ?? null,
          configVersionId: agent.currentConfigVersionId,
          parentRunId: input.parentRunId ?? null,
          status: AgentRunStatus.QUEUED,
          triggerType,
          idempotencyKey: input.idempotencyKey?.trim() || null,
          inputText: input.inputText?.trim() || null,
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
      if (settings.approvalRequired) {
        await createRunApprovalRecord(transaction, "system", agent, run);
      }
      const identity = await systemIdentity(this.database, correlationId);
      if (agent.status !== AgentStatus.RUNNING) {
        const updated = await transaction.agent.update({ where: { id: agentId }, data: { status: AgentStatus.RUNNING } });
        await upsertAgentGraphProjection(transaction, updated);
        await this.emitStatusChange(transaction, identity.ownerAccountId, correlationId, agentId);
      }
      return mapRun(run);
    });
  }

  /** Active agents with a due scheduled trigger, for the cron scheduler tick. */
  async listScheduledAgents(): Promise<Array<{ id: string; scheduleCron: string | null; status: AgentStatus }>> {
    const agents = await this.database.agent.findMany({
      where: { deletedAt: null, archivedAt: null },
      select: { id: true, scheduleCron: true, status: true, configJson: true },
    });
    return agents
      .filter((agent) => agent.status !== AgentStatus.PAUSED && decodeSettings(agent.configJson).trigger.type === "scheduled")
      .map((agent) => ({ id: agent.id, scheduleCron: agent.scheduleCron, status: agent.status }));
  }

  /** Creates (once) the pending approval checkpoint for a run that needs one. */
  async requestRunApproval(correlationId: string, runId: string): Promise<ApprovalRecord> {
    const identity = await systemIdentity(this.database, correlationId);
    return this.database.$transaction(async (transaction) => {
      const run = await transaction.agentRun.findFirst({
        where: { id: runId, deletedAt: null },
        include: { agent: true },
      });
      if (!run) throw new AgentOperationsError("NOT_FOUND", "Run not found.");
      await createRunApprovalRecord(transaction, identity.ownerSubject, run.agent, run);
      const approval = await transaction.approval.findFirstOrThrow({
        where: { agentRunId: runId, status: ApprovalStatus.PENDING, deletedAt: null },
      });
      return approval as unknown as ApprovalRecord;
    });
  }


  /** Claims the oldest queued, unblocked run. Returns null when the queue is empty. */
  async claimNextQueuedRun(correlationId: string): Promise<AgentRunRecord | null> {
    const identity = await systemIdentity(this.database, correlationId);
    return this.database.$transaction(async (transaction) => {
      const candidates = await transaction.agentRun.findMany({
        where: { status: AgentRunStatus.QUEUED, deletedAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 10,
        select: { id: true, agentId: true, metadata: true },
      });
      for (const candidate of candidates) {
        const metadata = (candidate.metadata ?? {}) as Record<string, unknown>;
        if (metadata.awaitingApproval === true) continue;
        const claimed = await transaction.agentRun.updateMany({
          where: { id: candidate.id, status: AgentRunStatus.QUEUED },
          data: { status: AgentRunStatus.RUNNING, startedAt: new Date() },
        });
        if (!claimed.count) continue;
        const agent = await transaction.agent.findFirst({ where: { id: candidate.agentId } });
        if (agent && agent.status !== AgentStatus.RUNNING) {
          const updated = await transaction.agent.update({ where: { id: agent.id }, data: { status: AgentStatus.RUNNING } });
          await upsertAgentGraphProjection(transaction, updated);
          await this.emitStatusChange(transaction, identity.ownerAccountId, correlationId, agent.id);
        }
        const run = await transaction.agentRun.findUniqueOrThrow({ where: { id: candidate.id } });
        return mapRun(run);
      }
      return null;
    });
  }

  /** Loads everything the executor needs to perform a run. */
  async getRunExecutionPlan(runId: string): Promise<{
    run: AgentRunRecord;
    agent: AgentListItem;
    configVersion: AgentConfigVersionRecord | null;
    memoryContext: string[];
  } | null> {
    const run = await this.database.agentRun.findFirst({
      where: { id: runId },
      include: {
        agent: true,
        configVersion: true,
      },
    });
    if (!run || run.agent.deletedAt) return null;
    const settings = decodeSettings(run.agent.configJson);
    const memories = await this.database.agentMemory.findMany({
      where: {
        agentId: run.agentId,
        deletedAt: null,
        OR: [{ clientId: null }, ...(run.clientId ? [{ clientId: run.clientId }] : [])],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 10,
      select: { kind: true, key: true, value: true },
    });
    return {
      run: mapRun(run),
      agent: mapAgentListItem(run.agent),
      configVersion: run.configVersion ? mapConfigVersion(run.configVersion) : null,
      memoryContext: memories.map((memory) => `${memory.kind === MemoryKind.KEY_VALUE && memory.key ? `${memory.key}: ` : ""}${memory.value}`),
    };
  }

  async persistPartialOutput(runId: string, partialOutput: string): Promise<void> {
    await this.database.agentRun.update({ where: { id: runId }, data: { partialOutput: partialOutput.slice(0, 100_000) } });
  }

  async completeRun(correlationId: string, runId: string, result: {
    outputText: string;
    tokensInput: number;
    tokensOutput: number;
    costUsd: number;
    durationMs: number;
    metadata?: Record<string, unknown>;
    model?: string;
  }): Promise<AgentRunRecord> {
    const identity = await systemIdentity(this.database, correlationId);
    return this.database.$transaction(async (transaction) => {
      const run = await transaction.agentRun.findFirst({ where: { id: runId, deletedAt: null } });
      if (!run) throw new AgentOperationsError("NOT_FOUND", "Run not found.");
      if (run.status !== AgentRunStatus.RUNNING) return mapRun(run);
      const updated = await transaction.agentRun.update({
        where: { id: runId },
        data: {
          status: AgentRunStatus.SUCCESS,
          outputText: result.outputText.slice(0, 100_000),
          tokensInput: result.tokensInput,
          tokensOutput: result.tokensOutput,
          costUsd: result.costUsd,
          durationMs: result.durationMs,
          completedAt: new Date(),
          metadata: mergeMetadata(run.metadata, result.metadata),
        },
      });
      await transaction.agent.update({
        where: { id: run.agentId },
        data: { lastRunAt: new Date(), lastRunStatus: AgentRunStatus.SUCCESS, totalCostUsd: { increment: result.costUsd } },
      });
      await transaction.costLedgerEntry.create({
        data: {
          agentId: run.agentId,
          agentRunId: run.id,
          clientId: run.clientId,
          entryType: "EXPENSE",
          category: "ai_usage",
          description: `Agent run usage (${result.model ?? "unknown"})`,
          amount: result.costUsd,
          occurredAt: new Date(),
          sourceType: "agent_run",
          sourceId: run.id,
          idempotencyKey: `agent_run:${run.id}:usage`,
        },
      }).catch(() => undefined);
      await this.refreshAgentAggregates(transaction, run.agentId);
      await this.settleAgentStatusAfterRun(transaction, identity, run.agentId);
      if (result.metadata?.simulated !== true) {
        // Memory writes only for real provider runs keep simulated noise out of durable memory.
        await this.writeRunMemory(transaction, run, result.outputText);
      }
      const nodeAgentId = await agentGraphNodeId(transaction, run.agentId);
      const summary = result.outputText.replace(/\s+/g, " ").trim().slice(0, 1000) || "Run completed.";
      await emitDirectRealtimeEvents(transaction, identity.ownerAccountId, correlationId, [
        { channel: "agent:status", event: "run_completed", payload: { agentId: nodeAgentId, runId: run.id, summary } },
      ]);
      await appendAgentMutationRecords(transaction, identity, [{
        entityType: "agent_run",
        entityId: run.id,
        action: "complete",
        eventType: "agent.run.completed",
        payload: { agentId: run.agentId, costUsd: result.costUsd, tokens: result.tokensInput + result.tokensOutput },
      }]);
      await this.enqueueChainChildren(transaction, identity, run, result.outputText);
      return mapRun(updated);
    });
  }

  async failRun(correlationId: string, runId: string, failure: {
    errorClass: "retryable" | "terminal" | "timeout";
    errorMessage: string;
    partialOutput?: string | null;
    tokensInput?: number;
    tokensOutput?: number;
    costUsd?: number;
    metadata?: Record<string, unknown>;
  }): Promise<AgentRunRecord | { retryScheduled: true; run: AgentRunRecord }> {
    const identity = await systemIdentity(this.database, correlationId);
    return this.database.$transaction(async (transaction) => {
      const run = await transaction.agentRun.findFirst({ where: { id: runId, deletedAt: null } });
      if (!run) throw new AgentOperationsError("NOT_FOUND", "Run not found.");
      if (run.status !== AgentRunStatus.RUNNING) return mapRun(run);
      const canRetry = failure.errorClass !== "terminal" && run.attempt < MAX_RUN_ATTEMPTS;
      if (canRetry) {
        const updated = await transaction.agentRun.update({
          where: { id: runId },
          data: {
            status: AgentRunStatus.QUEUED,
            attempt: run.attempt + 1,
            errorMessage: failure.errorMessage.slice(0, 5_000),
            partialOutput: failure.partialOutput?.slice(0, 100_000) ?? run.partialOutput,
            tokensInput: failure.tokensInput ?? run.tokensInput,
            tokensOutput: failure.tokensOutput ?? run.tokensOutput,
            metadata: mergeMetadata(run.metadata, { ...failure.metadata, nextAttemptAt: new Date(Date.now() + retryDelayForAttempt(run.attempt)).toISOString() }),
          },
        });
        await appendAgentMutationRecords(transaction, identity, [{
          entityType: "agent_run",
          entityId: run.id,
          action: "retry",
          eventType: "agent.run.retrying",
          payload: { agentId: run.agentId, attempt: run.attempt + 1, errorClass: failure.errorClass },
        }]);
        return { retryScheduled: true as const, run: mapRun(updated) };
      }
      const finalStatus = failure.errorClass === "timeout" ? AgentRunStatus.TIMEOUT : AgentRunStatus.FAILED;
      const updated = await transaction.agentRun.update({
        where: { id: runId },
        data: {
          status: finalStatus,
          errorMessage: failure.errorMessage.slice(0, 5_000),
          partialOutput: failure.partialOutput?.slice(0, 100_000) ?? run.partialOutput,
          tokensInput: failure.tokensInput ?? run.tokensInput,
          tokensOutput: failure.tokensOutput ?? run.tokensOutput,
          costUsd: failure.costUsd ?? run.costUsd,
          completedAt: new Date(),
          metadata: mergeMetadata(run.metadata, failure.metadata),
        },
      });
      await transaction.agent.update({
        where: { id: run.agentId },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: finalStatus,
          ...(failure.costUsd && failure.costUsd > 0 ? { totalCostUsd: { increment: failure.costUsd } } : {}),
        },
      });
      if (failure.costUsd && failure.costUsd > 0) {
        await transaction.costLedgerEntry.create({
          data: {
            agentId: run.agentId,
            agentRunId: run.id,
            clientId: run.clientId,
            entryType: "EXPENSE",
            category: "ai_usage",
            description: `Agent run failed attempt usage`,
            amount: failure.costUsd,
            occurredAt: new Date(),
            sourceType: "agent_run",
            sourceId: run.id,
            idempotencyKey: `agent_run:${run.id}:failed-usage`,
          },
        }).catch(() => undefined);
      }
      await this.refreshAgentAggregates(transaction, run.agentId);
      await this.settleAgentStatusAfterRun(transaction, identity, run.agentId, finalStatus);
      const nodeAgentId = await agentGraphNodeId(transaction, run.agentId);
      await emitDirectRealtimeEvents(transaction, identity.ownerAccountId, correlationId, [
        { channel: "agent:status", event: "run_failed", payload: { agentId: nodeAgentId, runId: run.id, error: failure.errorMessage.slice(0, 1000) || "Run failed." } },
      ]);
      await recordNotification(transaction, {
        type: NotificationType.AGENT_ERROR,
        priority: NotificationPriority.HIGH,
        title: `Agent run failed: ${failure.errorMessage.slice(0, 120) || "unknown error"}`,
        body: `Run ${run.id} of the agent failed (attempt ${run.attempt}).`,
        entityType: "agent_run",
        entityId: run.id,
      });
      await appendAgentMutationRecords(transaction, identity, [{
        entityType: "agent_run",
        entityId: run.id,
        action: "fail",
        eventType: "agent.run.failed",
        payload: { agentId: run.agentId, errorClass: failure.errorClass, attempt: run.attempt },
      }]);
      return mapRun(updated);
    });
  }

  async enqueueChainChildren(
    transaction: Transaction,
    identity: OwnerIdentity,
    parentRun: { id: string; agentId: string; clientId: string | null; metadata: Prisma.JsonValue | null },
    parentOutput: string,
  ): Promise<void> {
    const parentMetadata = (parentRun.metadata ?? {}) as Record<string, unknown>;
    const parentDepth = typeof parentMetadata.chainDepth === "number" ? parentMetadata.chainDepth : 0;
    const children = await transaction.agent.findMany({ where: { deletedAt: null, archivedAt: null } });
    for (const child of children) {
      const settings = decodeSettings(child.configJson);
      if (settings.trigger.type !== "chain" || settings.trigger.chainParentAgentId !== parentRun.agentId) continue;
      if (child.status === AgentStatus.PAUSED) continue;
      const depth = parentDepth + 1;
      if (chainDepthExceeded(depth)) continue;
      await assertDailyBudgetAvailable(transaction, child.id, child.dailyTokenBudget);
      const run = await transaction.agentRun.create({
        data: {
          agentId: child.id,
          clientId: parentRun.clientId,
          configVersionId: child.currentConfigVersionId,
          parentRunId: parentRun.id,
          status: AgentRunStatus.QUEUED,
          triggerType: AgentTriggerType.CHAIN,
          idempotencyKey: `chain:${parentRun.id}:${child.id}`,
          inputText: parentOutput.slice(0, 100_000),
          metadata: { chainDepth: depth, parentRunId: parentRun.id } as Prisma.InputJsonValue,
        },
      }).catch(() => null);
      if (run && child.status !== AgentStatus.RUNNING) {
        const updated = await transaction.agent.update({ where: { id: child.id }, data: { status: AgentStatus.RUNNING } });
        await upsertAgentGraphProjection(transaction, updated);
        await this.emitStatusChange(transaction, identity.ownerAccountId, identity.correlationId, child.id);
      }
    }
  }

  // ── Approvals ─────────────────────────────────────────────────────────────

  async listApprovals(identity: OwnerIdentity, input: {
    agentId?: string;
    agentRunId?: string;
    statuses?: readonly string[];
    limit?: number;
  } = {}): Promise<ApprovalRecord[]> {
    await this.requireActiveOwner(identity);
    const statuses = (input.statuses ?? ["pending"]).map((status) => status.toUpperCase());
    return this.database.approval.findMany({
      where: {
        deletedAt: null,
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
        ...(statuses.length ? { status: { in: statuses as ApprovalStatus[] } } : {}),
      },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      take: Math.max(1, Math.min(input.limit ?? 25, 100)),
    }) as unknown as Promise<ApprovalRecord[]>;
  }

  async requestApproval(identity: OwnerIdentity, input: RequestApprovalInput): Promise<ApprovalRecord> {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const approval = await transaction.approval.create({
        data: {
          action: ApprovalAction.AGENT_TOOL_USE,
          status: ApprovalStatus.PENDING,
          agentId: input.agentId ?? null,
          agentRunId: input.agentRunId ?? null,
          configVersionId: input.configVersionId ?? null,
          entityType: input.entityType,
          entityId: input.entityId,
          entityVersion: input.entityVersion ?? null,
          requestedBy: identity.ownerSubject,
          payloadHash: input.payloadHash,
          expiresAt: input.expiresAt ?? null,
          decisionNote: input.note ?? null,
        },
      });
      await appendAgentMutationRecords(transaction, identity, [{
        entityType: "approval",
        entityId: approval.id,
        action: "request",
        eventType: "approval.requested",
        payload: { entityType: input.entityType, entityId: input.entityId, agentId: input.agentId ?? null },
      }]);
      return approval as unknown as ApprovalRecord;
    });
  }

  /**
   * Decides a run-approval checkpoint. Approving re-queues the paused run for
   * execution (replay-safe: the executor re-reads the approved config version).
   * Rejecting fails the run terminally. The expected payload hash must match the
   * pending approval's hash so a stale view cannot approve mutated artifacts.
   */
  async decideRunApproval(identity: OwnerIdentity, approvalId: string, input: DecideApprovalInput, expectedPayloadHash: string): Promise<{ approval: ApprovalRecord; runId: string | null }> {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const approval = await transaction.approval.findFirst({ where: { id: approvalId, deletedAt: null } });
      if (!approval) throw new AgentOperationsError("NOT_FOUND", "Approval not found.");
      if (approval.status !== ApprovalStatus.PENDING) throw new AgentOperationsError("CONFLICT", "The approval was already decided.");
      if (approval.payloadHash !== expectedPayloadHash) throw new AgentOperationsError("APPROVAL_STALE", "The approval payload changed since it was requested. Refresh and retry.");
      const updated = await transaction.approval.update({
        where: { id: approvalId },
        data: {
          status: input.decision === "approve" ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
          decidedBy: identity.ownerSubject,
          decidedAt: new Date(),
          decisionNote: input.note?.trim() || null,
        },
      });
      let runId: string | null = approval.agentRunId;
      if (runId) {
        const run = await transaction.agentRun.findFirst({ where: { id: runId, deletedAt: null } });
        if (run) {
          if (input.decision === "approve") {
            const metadata = { ...((run.metadata ?? {}) as Record<string, unknown>) };
            delete metadata.awaitingApproval;
            metadata.approvedBy = identity.ownerSubject;
            metadata.approvedAt = new Date().toISOString();
            await transaction.agentRun.update({ where: { id: run.id }, data: { metadata: metadata as Prisma.InputJsonValue } });
          } else {
            await transaction.agentRun.update({
              where: { id: run.id },
              data: {
                status: AgentRunStatus.FAILED,
                errorMessage: "Rejected by owner at the approval checkpoint.",
                completedAt: new Date(),
              },
            });
            await this.refreshAgentAggregates(transaction, run.agentId);
            await this.settleAgentStatusAfterRun(transaction, identity, run.agentId, AgentRunStatus.FAILED);
          }
        }
      }
      await appendAgentMutationRecords(transaction, identity, [{
        entityType: "approval",
        entityId: approvalId,
        action: input.decision,
        eventType: `approval.${input.decision === "approve" ? "approved" : "rejected"}`,
        payload: { runId, agentId: approval.agentId },
      }]);
      return { approval: updated as unknown as ApprovalRecord, runId };
    });
  }

  // ── Memory ────────────────────────────────────────────────────────────────

  async listMemories(identity: OwnerIdentity, agentId: string, input: ListMemoriesInput = {}): Promise<ListMemoriesResult> {
    await this.requireActiveOwner(identity);
    const limit = Math.max(1, Math.min(input.limit ?? MEMORY_LIST_LIMIT, 100));
    const where: Prisma.AgentMemoryWhereInput = { agentId, deletedAt: null };
    if (input.clientId) where.clientId = input.clientId;
    const kinds = (input.kinds ?? []).map((kind) => kind.toUpperCase());
    if (kinds.length) where.kind = { in: kinds as MemoryKind[] };
    const total = await this.database.agentMemory.count({ where });
    const rows = await this.database.agentMemory.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: visible.map(mapMemory),
      hasMore,
      nextCursor: hasMore && visible.at(-1) ? visible.at(-1)!.id : null,
      total,
    };
  }

  async createMemory(identity: OwnerIdentity, agentId: string, input: CreateMemoryInput): Promise<AgentMemoryRecord> {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const agent = await requireActiveAgent(transaction, agentId);
      const settings = decodeSettings(agent.configJson);
      if (input.clientId) {
        await assertClientIdsExist(transaction, [input.clientId]);
        if (settings.clientIds?.length && !settings.clientIds.includes(input.clientId)) {
          throw new AgentOperationsError("INVALID_INPUT", "Memories cannot reference a client that is not assigned to the agent.");
        }
      }
      if (!input.value?.trim()) throw new AgentOperationsError("INVALID_INPUT", "Memory value is required.");
      const memory = await transaction.agentMemory.create({
        data: {
          agentId,
          clientId: input.clientId ?? null,
          sourceRunId: input.sourceRunId ?? null,
          kind: kindToDb(input.kind),
          key: input.key?.trim() || null,
          value: input.value.trim(),
          sourceIds: [...(input.sourceIds ?? [])],
          tokenCount: estimateTokens(input.value),
        },
      });
      await appendAgentMutationRecords(transaction, identity, [{
        entityType: "agent_memory",
        entityId: memory.id,
        action: "create",
        eventType: "agent.memory.created",
        payload: { agentId, kind: memory.kind },
        changedFields: ["value"],
      }]);
      return mapMemory(memory);
    });
  }

  async updateMemory(identity: OwnerIdentity, memoryId: string, input: UpdateMemoryInput): Promise<AgentMemoryRecord> {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const existing = await transaction.agentMemory.findFirst({ where: { id: memoryId, deletedAt: null } });
      if (!existing) throw new AgentOperationsError("NOT_FOUND", "Memory not found.");
      const value = input.value !== undefined ? input.value.trim() : existing.value;
      if (!value) throw new AgentOperationsError("INVALID_INPUT", "Memory value is required.");
      const memory = await transaction.agentMemory.update({
        where: { id: memoryId },
        data: {
          value,
          key: input.key === undefined ? existing.key : input.key?.trim() || null,
          sourceIds: input.sourceIds ? [...input.sourceIds] : existing.sourceIds,
          version: existing.version + 1,
          tokenCount: estimateTokens(value),
        },
      });
      await appendAgentMutationRecords(transaction, identity, [{
        entityType: "agent_memory",
        entityId: memoryId,
        action: "update",
        eventType: "agent.memory.updated",
        payload: { agentId: existing.agentId, version: memory.version },
        changedFields: Object.keys(input),
      }]);
      return mapMemory(memory);
    });
  }

  async deleteMemory(identity: OwnerIdentity, memoryId: string): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const existing = await transaction.agentMemory.findFirst({ where: { id: memoryId, deletedAt: null } });
      if (!existing) throw new AgentOperationsError("NOT_FOUND", "Memory not found.");
      await transaction.agentMemory.update({ where: { id: memoryId }, data: { deletedAt: new Date() } });
      await appendAgentMutationRecords(transaction, identity, [{
        entityType: "agent_memory",
        entityId: memoryId,
        action: "delete",
        eventType: "agent.memory.deleted",
        payload: { agentId: existing.agentId },
      }]);
    });
  }

  // ── Budget & health ───────────────────────────────────────────────────────

  async getBudgetStatus(agentId: string): Promise<BudgetStatus> {
    const agent = await this.database.agent.findFirst({ where: { id: agentId, deletedAt: null }, select: { dailyTokenBudget: true } });
    if (!agent) throw new AgentOperationsError("NOT_FOUND", "Agent not found.");
    const used = await tokensUsedToday(this.database, agentId, new Date());
    return {
      agentId,
      dailyTokenBudget: agent.dailyTokenBudget,
      tokensUsedToday: used,
      tokensRemaining: agent.dailyTokenBudget == null ? null : Math.max(0, agent.dailyTokenBudget - used),
      budgetExceeded: agent.dailyTokenBudget != null && used >= agent.dailyTokenBudget,
    };
  }

  async queueMetrics(): Promise<{ queued: number; running: number; oldestQueuedAgeMs: number | null }> {
    const now = Date.now();
    const [queued, running, oldest] = await Promise.all([
      this.database.agentRun.count({ where: { status: AgentRunStatus.QUEUED, deletedAt: null } }),
      this.database.agentRun.count({ where: { status: AgentRunStatus.RUNNING, deletedAt: null } }),
      this.database.agentRun.findFirst({
        where: { status: AgentRunStatus.QUEUED, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);
    return { queued, running, oldestQueuedAgeMs: oldest ? now - oldest.createdAt.getTime() : null };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async requireActiveOwner(identity: OwnerIdentity): Promise<void> {
    const owner = await this.database.ownerAccount.findFirst({ where: { authSubject: identity.ownerSubject, active: true }, select: { id: true } });
    if (!owner) throw new AgentOperationsError("INVALID_IDENTITY", "The authenticated owner is not active.");
  }

  private async getAgentDetailInTransaction(transaction: Transaction, agentId: string): Promise<AgentDetail> {
    const agent = await transaction.agent.findFirst({
      where: { id: agentId, deletedAt: null },
      include: {
        currentConfigVersion: true,
        configVersions: { orderBy: [{ version: "desc" }, { id: "asc" }], take: 20, where: { deletedAt: null } },
        runs: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, where: { deletedAt: null } },
      },
    });
    if (!agent) throw new AgentOperationsError("NOT_FOUND", "Agent not found.");
    const [memoryCount, pendingApprovals, usedToday] = await Promise.all([
      transaction.agentMemory.count({ where: { agentId, deletedAt: null } }),
      transaction.approval.count({ where: { agentId, status: ApprovalStatus.PENDING, deletedAt: null } }),
      tokensUsedToday(transaction, agentId, new Date()),
    ]);
    return {
      ...mapAgentListItem(agent),
      configVersion: agent.currentConfigVersion ? mapConfigVersion(agent.currentConfigVersion) : null,
      recentRuns: agent.runs.map(mapRun),
      configVersions: agent.configVersions.map(mapConfigVersion),
      memoryCount,
      pendingApprovals,
      tokensUsedToday: usedToday,
    };
  }

  private async assertChainEdgeAllowed(transaction: Transaction, parentAgentId: string, childAgentId: string): Promise<void> {
    const agents = await transaction.agent.findMany({
      where: { deletedAt: null },
      select: { id: true, configJson: true },
    });
    const edges = agents
      .map((agent) => ({ parentAgentId: decodeSettings(agent.configJson).trigger.chainParentAgentId, childAgentId: agent.id }))
      .filter((edge): edge is { parentAgentId: string; childAgentId: string } => Boolean(edge.parentAgentId));
    if (edges.filter((edge) => edge.parentAgentId === parentAgentId).length >= MAX_CHAIN_OUT_DEGREE) {
      throw new AgentOperationsError("CONFIG_INVALID", "The parent agent already has the maximum number of chained children.");
    }
    if (detectChainCycle(edges, { parentAgentId, childAgentId })) {
      throw new AgentOperationsError("CHAIN_CYCLE", "The chained trigger would create a cycle.");
    }
  }

  private async cancelQueuedRuns(transaction: Transaction, agentId: string, reason: string): Promise<void> {
    await transaction.agentRun.updateMany({
      where: { agentId, status: { in: [AgentRunStatus.QUEUED] }, deletedAt: null },
      data: { status: AgentRunStatus.CANCELLED, errorMessage: reason, completedAt: new Date() },
    });
  }

  private async emitStatusChange(
    transaction: Transaction,
    ownerAccountId: string,
    correlationId: string,
    agentId: string,
    message?: string,
  ): Promise<void> {
    const agent = await transaction.agent.findFirst({
      where: { id: agentId },
      select: { id: true, name: true, type: true, status: true, lastRunAt: true, totalRuns: true },
    });
    if (!agent) return;
    await emitDirectRealtimeEvents(
      transaction,
      ownerAccountId,
      correlationId,
      await agentStatusEvents(transaction, agent, message),
    );
  }

  /** Recomputes total runs and success rate from durable run rows. */
  private async refreshAgentAggregates(transaction: Transaction, agentId: string): Promise<void> {
    const grouped = await transaction.agentRun.groupBy({
      by: ["status"],
      where: { agentId, deletedAt: null },
      _count: { _all: true },
    });
    const countBy = (status: AgentRunStatus) => grouped.find((group) => group.status === status)?._count._all ?? 0;
    const totalRuns = grouped.reduce((sum, group) => sum + group._count._all, 0);
    const successes = countBy(AgentRunStatus.SUCCESS);
    const terminal = successes + countBy(AgentRunStatus.FAILED) + countBy(AgentRunStatus.TIMEOUT) + countBy(AgentRunStatus.CANCELLED);
    const successRate = terminal === 0 ? 100 : Math.round((successes / terminal) * 10_000) / 100;
    await transaction.agent.update({ where: { id: agentId }, data: { totalRuns, successRate } });
  }

  private async settleAgentStatusAfterRun(
    transaction: Transaction,
    identity: OwnerIdentity,
    agentId: string,
    finalStatus?: AgentRunStatus,
  ): Promise<void> {
    const activeRuns = await transaction.agentRun.count({
      where: { agentId, status: { in: [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING] }, deletedAt: null },
    });
    if (activeRuns > 0) return;
    const agent = await transaction.agent.findFirst({ where: { id: agentId }, select: { configJson: true, status: true } });
    if (!agent) return;
    const settings = decodeSettings(agent.configJson);
    const nextStatus = finalStatus === AgentRunStatus.FAILED || finalStatus === AgentRunStatus.TIMEOUT
      ? AgentStatus.ERROR
      : statusForTrigger(settings.trigger);
    if (agent.status === nextStatus) return;
    const updated = await transaction.agent.update({ where: { id: agentId }, data: { status: nextStatus } });
    await upsertAgentGraphProjection(transaction, updated);
    await this.emitStatusChange(
      transaction,
      identity.ownerAccountId,
      identity.correlationId,
      agentId,
      finalStatus === AgentRunStatus.FAILED || finalStatus === AgentRunStatus.TIMEOUT ? "Last run failed." : undefined,
    );
  }

  private async writeRunMemory(
    transaction: Transaction,
    run: { id: string; agentId: string; clientId: string | null },
    outputText: string,
  ): Promise<void> {
    const agent = await transaction.agent.findFirst({ where: { id: run.agentId }, select: { configJson: true } });
    if (!agent) return;
    const settings = decodeSettings(agent.configJson);
    if (!settings.memoryEnabled) return;
    const value = outputText.slice(0, OUTPUT_MEMORY_MAX_CHARS);
    if (!value.trim()) return;
    await transaction.agentMemory.create({
      data: {
        agentId: run.agentId,
        clientId: run.clientId,
        sourceRunId: run.id,
        kind: MemoryKind.KEY_VALUE,
        key: `run:${run.id}`,
        value,
        sourceIds: [run.id],
        tokenCount: estimateTokens(value),
      },
    });
  }
}

type MemoryRow = {
  id: string;
  agentId: string;
  clientId: string | null;
  sourceRunId: string | null;
  kind: MemoryKind;
  key: string | null;
  value: string;
  embeddingModel: string | null;
  version: number;
  tokenCount: number | null;
  sourceIds: string[];
  summarizedAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapMemory(row: MemoryRow): AgentMemoryRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    clientId: row.clientId,
    sourceRunId: row.sourceRunId,
    kind: row.kind,
    key: row.key,
    value: row.value,
    embeddingModel: row.embeddingModel,
    version: row.version,
    tokenCount: row.tokenCount,
    sourceIds: [...row.sourceIds],
    summarizedAt: row.summarizedAt,
    archivedAt: row.archivedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function agentTypeToDb(type: string): AgentType {
  return type.toUpperCase() as AgentType;
}

function kindToDb(kind: string): MemoryKind {
  return kind.toUpperCase() as MemoryKind;
}

function agentStatusToApi(status: AgentStatus): "running" | "idle" | "error" | "scheduled" | "paused" {
  return status.toLowerCase() as "running" | "idle" | "error" | "scheduled" | "paused";
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

function retryDelayForAttempt(attempt: number): number {
  const delays = [5_000, 30_000, 120_000];
  return delays[Math.min(attempt, delays.length - 1)] ?? 120_000;
}

function mergeMetadata(existing: Prisma.JsonValue | null, updates: Record<string, unknown> | undefined): Prisma.InputJsonValue {
  const base = (existing && typeof existing === "object" && !Array.isArray(existing) ? { ...(existing as Record<string, unknown>) } : {});
  return { ...base, ...(updates ?? {}) } as Prisma.InputJsonValue;
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

async function appendAgentMutationRecords(
  transaction: Transaction,
  identity: OwnerIdentity,
  records: readonly {
    entityType: string;
    entityId: string;
    action: string;
    eventType: string;
    payload: Record<string, unknown>;
    changedFields?: readonly string[];
  }[],
): Promise<void> {
  const { appendMutationRecords } = await import("../clients/internal");
  await appendMutationRecords(transaction, identity, records);
}
