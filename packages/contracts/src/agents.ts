import { z } from "zod";
import { cursorSchema, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./api";

export const agentTypes = [
  "chatbot_builder",
  "workflow_designer",
  "content_writer",
  "lead_generator",
  "invoice_chaser",
  "crm_manager",
  "reporter",
  "analyst",
  "custom",
] as const;
export const agentTypeSchema = z.enum(agentTypes);
export type AgentType = z.infer<typeof agentTypeSchema>;
export const AGENT_TYPE_LABELS = {
  chatbot_builder: "Chatbot Builder",
  workflow_designer: "Workflow Designer",
  content_writer: "Content Writer",
  lead_generator: "Lead Generator",
  invoice_chaser: "Invoice Chaser",
  crm_manager: "CRM Manager",
  reporter: "Weekly Reporter",
  analyst: "Research Analyst",
  custom: "Custom",
} as const satisfies Record<AgentType, string>;

export const agentStatuses = ["idle", "running", "error", "paused", "scheduled"] as const;
export const agentStatusSchema = z.enum(agentStatuses);
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export const AGENT_STATUS_LABELS = {
  idle: "Idle",
  running: "Running",
  error: "Error",
  paused: "Paused",
  scheduled: "Scheduled",
} as const satisfies Record<AgentStatus, string>;

export const agentRunStatuses = ["queued", "running", "success", "failed", "timeout", "cancelled"] as const;
export const agentRunStatusSchema = z.enum(agentRunStatuses);
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;
export const AGENT_RUN_STATUS_LABELS = {
  queued: "Queued",
  running: "Running",
  success: "Success",
  failed: "Failed",
  timeout: "Timeout",
  cancelled: "Cancelled",
} as const satisfies Record<AgentRunStatus, string>;

export const agentTriggerTypes = ["manual", "scheduled", "event", "chain", "webhook"] as const;
export const agentTriggerTypeSchema = z.enum(agentTriggerTypes);
export type AgentTriggerType = z.infer<typeof agentTriggerTypeSchema>;
export const AGENT_TRIGGER_TYPE_LABELS = {
  manual: "Manual",
  scheduled: "Scheduled",
  event: "Event",
  chain: "Chained",
  webhook: "Webhook",
} as const satisfies Record<AgentTriggerType, string>;

export const memoryKinds = ["key_value", "vector", "summary"] as const;
export const memoryKindSchema = z.enum(memoryKinds);
export type MemoryKind = z.infer<typeof memoryKindSchema>;
export const MEMORY_KIND_LABELS = {
  key_value: "Key-Value",
  vector: "Vector",
  summary: "Summary",
} as const satisfies Record<MemoryKind, string>;

export const approvalStatuses = ["pending", "approved", "rejected", "expired", "revoked"] as const;
export const approvalStatusSchema = z.enum(approvalStatuses);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;
export const APPROVAL_STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  revoked: "Revoked",
} as const satisfies Record<ApprovalStatus, string>;

export const approvalActions = [
  "agent_tool_use",
  "outreach_send",
  "workflow_deploy",
  "content_publish",
  "invoice_send",
  "proposal_send",
  "knowledge_promotion",
  "other",
] as const;
export const approvalActionSchema = z.enum(approvalActions);
export type ApprovalAction = z.infer<typeof approvalActionSchema>;
export const APPROVAL_ACTION_LABELS = {
  agent_tool_use: "Agent Tool Use",
  outreach_send: "Outreach Send",
  workflow_deploy: "Workflow Deploy",
  content_publish: "Content Publish",
  invoice_send: "Invoice Send",
  proposal_send: "Proposal Send",
  knowledge_promotion: "Knowledge Promotion",
  other: "Other",
} as const satisfies Record<ApprovalAction, string>;

const modelIdSchema = z.string().trim().min(1).max(100);
const temperatureSchema = z.number().finite().min(0).max(2);
const maxTokensSchema = z.int().positive().max(128_000);
const topPSchema = z.number().finite().min(0).max(1);
const frequencyPenaltySchema = z.number().finite().min(-2).max(2);
const dailyTokenBudgetSchema = z.int().positive().max(10_000_000).nullable().optional();
const cronExpressionSchema = z.string().trim().max(100).nullable().optional();

export const agentModelParametersSchema = z.strictObject({
  model: modelIdSchema,
  temperature: temperatureSchema.default(0.7),
  maxTokens: maxTokensSchema.default(4096),
  topP: topPSchema.default(1),
  frequencyPenalty: frequencyPenaltySchema.default(0),
});
export type AgentModelParameters = z.infer<typeof agentModelParametersSchema>;

export const agentToolAssignmentSchema = z.strictObject({
  id: z.string().trim().min(1).max(100),
  type: z.string().trim().min(1).max(50),
  config: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
});
export type AgentToolAssignment = z.infer<typeof agentToolAssignmentSchema>;

export const agentTriggerConfigSchema = z.strictObject({
  type: agentTriggerTypeSchema.default("manual"),
  cronExpression: cronExpressionSchema,
  eventFilters: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  webhookPath: z.string().trim().max(200).nullable().optional(),
  chainParentAgentId: z.uuid().nullable().optional(),
});
export type AgentTriggerConfig = z.infer<typeof agentTriggerConfigSchema>;

export const agentCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2_000).nullable().optional(),
  type: agentTypeSchema,
  modelParameters: agentModelParametersSchema,
  systemPrompt: z.string().trim().min(1).max(50_000),
  tools: z.array(agentToolAssignmentSchema).max(50).default([]),
  trigger: agentTriggerConfigSchema.default({
    type: "manual",
    cronExpression: null,
    eventFilters: [],
    webhookPath: null,
    chainParentAgentId: null,
  }),
  dailyTokenBudget: dailyTokenBudgetSchema,
  clientIds: z.array(z.uuid()).max(100).default([]),
  approvalRequired: z.boolean().optional(),
  memoryEnabled: z.boolean().optional(),
});
export type AgentCreateInput = z.infer<typeof agentCreateSchema>;

export const agentUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  type: agentTypeSchema.optional(),
  modelParameters: agentModelParametersSchema.partial().optional(),
  systemPrompt: z.string().trim().min(1).max(50_000).optional(),
  tools: z.array(agentToolAssignmentSchema).max(50).optional(),
  trigger: agentTriggerConfigSchema.optional(),
  dailyTokenBudget: dailyTokenBudgetSchema,
  status: agentStatusSchema.optional(),
  clientIds: z.array(z.uuid()).max(100).optional(),
  approvalRequired: z.boolean().optional(),
  memoryEnabled: z.boolean().optional(),
  changeSummary: z.string().trim().max(500).optional(),
}).refine((data) => Object.keys(data).length > 0, "At least one field is required.");
export type AgentUpdateInput = z.infer<typeof agentUpdateSchema>;

export const agentConfigVersionSchema = z.strictObject({
  version: z.int().positive(),
  model: modelIdSchema,
  systemPrompt: z.string().trim().min(1).max(50_000),
  temperature: temperatureSchema,
  maxTokens: maxTokensSchema,
  topP: topPSchema,
  frequencyPenalty: frequencyPenaltySchema,
  tools: z.array(z.string().trim().min(1).max(100)).default([]),
  triggerConfig: z.record(z.string(), z.unknown()).nullable().optional(),
  configJson: z.record(z.string(), z.unknown()).nullable().optional(),
  changeSummary: z.string().trim().max(500).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }),
  createdBy: z.string().trim().max(255).nullable().optional(),
  deletedAt: z.string().datetime({ offset: true }).nullable().optional(),
});
export type AgentConfigVersion = z.infer<typeof agentConfigVersionSchema>;

export const agentDtoSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2_000).nullable(),
  type: agentTypeSchema,
  status: agentStatusSchema,
  model: modelIdSchema,
  systemPrompt: z.string().trim().min(1).max(50_000),
  temperature: temperatureSchema,
  maxTokens: maxTokensSchema,
  topP: topPSchema,
  frequencyPenalty: frequencyPenaltySchema,
  scheduleCron: z.string().trim().max(100).nullable(),
  dailyTokenBudget: dailyTokenBudgetSchema,
  totalRuns: z.int().nonnegative(),
  totalCostUsd: z.number().finite().nonnegative(),
  successRate: z.number().finite().min(0).max(100),
  lastRunAt: z.string().datetime({ offset: true }).nullable(),
  lastRunStatus: agentRunStatusSchema.nullable(),
  currentConfigVersionId: z.uuid().nullable(),
  tools: z.array(agentToolAssignmentSchema),
  trigger: agentTriggerConfigSchema,
  clientIds: z.array(z.uuid()),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  archivedAt: z.string().datetime({ offset: true }).nullable(),
  deletedAt: z.string().datetime({ offset: true }).nullable(),
});
export type AgentDto = z.infer<typeof agentDtoSchema>;

export const agentSummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(255),
  type: agentTypeSchema,
  status: agentStatusSchema,
  model: modelIdSchema,
  lastRunAt: z.string().datetime({ offset: true }).nullable(),
  lastRunStatus: agentRunStatusSchema.nullable(),
  totalRuns: z.int().nonnegative(),
  totalCostUsd: z.number().finite().nonnegative(),
  successRate: z.number().finite().min(0).max(100),
});
export type AgentSummary = z.infer<typeof agentSummarySchema>;

export const agentRunDtoSchema = z.strictObject({
  id: z.uuid(),
  agentId: z.uuid(),
  clientId: z.uuid().nullable(),
  configVersionId: z.uuid().nullable(),
  parentRunId: z.uuid().nullable(),
  status: agentRunStatusSchema,
  triggerType: agentTriggerTypeSchema,
  idempotencyKey: z.string().trim().max(255).nullable(),
  inputText: z.string().trim().max(100_000).nullable(),
  outputText: z.string().trim().max(100_000).nullable(),
  partialOutput: z.string().trim().max(100_000).nullable(),
  tokensInput: z.int().nonnegative(),
  tokensOutput: z.int().nonnegative(),
  costUsd: z.number().finite().nonnegative(),
  durationMs: z.int().positive().nullable(),
  attempt: z.int().positive(),
  errorMessage: z.string().trim().max(5_000).nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  startedAt: z.string().datetime({ offset: true }).nullable(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  deletedAt: z.string().datetime({ offset: true }).nullable(),
});
export type AgentRunDto = z.infer<typeof agentRunDtoSchema>;

export const agentRunSummarySchema = z.strictObject({
  id: z.uuid(),
  agentId: z.uuid(),
  clientId: z.uuid().nullable(),
  status: agentRunStatusSchema,
  triggerType: agentTriggerTypeSchema,
  tokensInput: z.int().nonnegative(),
  tokensOutput: z.int().nonnegative(),
  costUsd: z.number().finite().nonnegative(),
  durationMs: z.int().positive().nullable(),
  attempt: z.int().positive(),
  errorMessage: z.string().trim().max(5_000).nullable(),
  startedAt: z.string().datetime({ offset: true }).nullable(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});
export type AgentRunSummary = z.infer<typeof agentRunSummarySchema>;

export const agentRunCreateSchema = z.strictObject({
  inputText: z.string().trim().max(100_000).nullable().optional(),
  triggerType: agentTriggerTypeSchema.default("manual"),
  idempotencyKey: z.string().trim().max(255).optional(),
});
export type AgentRunCreateInput = z.infer<typeof agentRunCreateSchema>;

export const agentMemoryDtoSchema = z.strictObject({
  id: z.uuid(),
  agentId: z.uuid(),
  clientId: z.uuid().nullable(),
  sourceRunId: z.uuid().nullable(),
  kind: memoryKindSchema,
  key: z.string().trim().max(255).nullable(),
  value: z.string().trim().max(100_000),
  embeddingModel: z.string().trim().max(100).nullable(),
  version: z.int().positive(),
  tokenCount: z.int().nonnegative().nullable(),
  sourceIds: z.array(z.uuid()),
  summarizedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  archivedAt: z.string().datetime({ offset: true }).nullable(),
  deletedAt: z.string().datetime({ offset: true }).nullable(),
});
export type AgentMemoryDto = z.infer<typeof agentMemoryDtoSchema>;

export const agentMemoryCreateSchema = z.strictObject({
  clientId: z.uuid().nullable().optional(),
  sourceRunId: z.uuid().nullable().optional(),
  kind: memoryKindSchema,
  key: z.string().trim().max(255).nullable().optional(),
  value: z.string().trim().min(1).max(100_000),
  embeddingModel: z.string().trim().max(100).nullable().optional(),
  sourceIds: z.array(z.uuid()).max(100).default([]),
});
export type AgentMemoryCreateInput = z.infer<typeof agentMemoryCreateSchema>;

export const agentMemoryUpdateSchema = z.strictObject({
  value: z.string().trim().min(1).max(100_000).optional(),
  key: z.string().trim().max(255).nullable().optional(),
  sourceIds: z.array(z.uuid()).max(100).optional(),
}).refine((data) => Object.keys(data).length > 0, "At least one field is required.");
export type AgentMemoryUpdateInput = z.infer<typeof agentMemoryUpdateSchema>;

export const approvalDtoSchema = z.strictObject({
  id: z.uuid(),
  action: approvalActionSchema,
  status: approvalStatusSchema,
  agentId: z.uuid().nullable(),
  agentRunId: z.uuid().nullable(),
  configVersionId: z.uuid().nullable(),
  entityType: z.string().trim().min(1).max(100),
  entityId: z.uuid(),
  entityVersion: z.int().positive().nullable(),
  requestedBy: z.string().trim().max(255).nullable(),
  decidedBy: z.string().trim().max(255).nullable(),
  requestedAt: z.string().datetime({ offset: true }),
  decidedAt: z.string().datetime({ offset: true }).nullable(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  decisionNote: z.string().trim().max(2_000).nullable(),
  payloadHash: z.string().trim().max(128),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  deletedAt: z.string().datetime({ offset: true }).nullable(),
});
export type ApprovalDto = z.infer<typeof approvalDtoSchema>;

export const approvalRequestSchema = z.strictObject({
  action: approvalActionSchema,
  agentId: z.uuid().nullable().optional(),
  agentRunId: z.uuid().nullable().optional(),
  configVersionId: z.uuid().nullable().optional(),
  entityType: z.string().trim().min(1).max(100),
  entityId: z.uuid(),
  entityVersion: z.int().positive().nullable().optional(),
  payloadHash: z.string().trim().min(1).max(128),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().trim().max(2_000).nullable().optional(),
});
export type ApprovalRequestInput = z.infer<typeof approvalRequestSchema>;

export const approvalDecisionSchema = z.strictObject({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(2_000).nullable().optional(),
});
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

export const agentListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  types: z.array(agentTypeSchema).optional(),
  statuses: z.array(agentStatusSchema).optional(),
  clientId: z.uuid().optional(),
  hasDailyBudget: z.coerce.boolean().optional(),
  search: z.string().trim().max(200).optional(),
  archiveScope: z.enum(["active", "archived", "all"]).optional(),
});
export type AgentListQuery = z.infer<typeof agentListQuerySchema>;

export const agentRunListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  agentId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  statuses: z.array(agentRunStatusSchema).optional(),
  triggerTypes: z.array(agentTriggerTypeSchema).optional(),
  fromDate: z.string().datetime({ offset: true }).optional(),
  toDate: z.string().datetime({ offset: true }).optional(),
});
export type AgentRunListQuery = z.infer<typeof agentRunListQuerySchema>;

export const agentMemoryListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  agentId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  kinds: z.array(memoryKindSchema).optional(),
  hasEmbedding: z.coerce.boolean().optional(),
});
export type AgentMemoryListQuery = z.infer<typeof agentMemoryListQuerySchema>;

export const approvalListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  agentId: z.uuid().optional(),
  agentRunId: z.uuid().optional(),
  statuses: z.array(approvalStatusSchema).optional(),
  actions: z.array(approvalActionSchema).optional(),
});
export type ApprovalListQuery = z.infer<typeof approvalListQuerySchema>;

export const agentCostLedgerEntrySchema = z.strictObject({
  id: z.uuid(),
  agentId: z.uuid(),
  agentRunId: z.uuid().nullable(),
  model: modelIdSchema,
  tokensInput: z.int().nonnegative(),
  tokensOutput: z.int().nonnegative(),
  costUsd: z.number().finite().nonnegative(),
  provider: z.string().trim().min(1).max(50),
  recordedAt: z.string().datetime({ offset: true }),
});
export type AgentCostLedgerEntry = z.infer<typeof agentCostLedgerEntrySchema>;

export const agentBudgetStatusSchema = z.strictObject({
  agentId: z.uuid(),
  dailyTokenBudget: z.int().positive().nullable(),
  tokensUsedToday: z.int().nonnegative(),
  tokensRemaining: z.int().nonnegative(),
  budgetExceeded: z.boolean(),
  lastResetAt: z.string().datetime({ offset: true }).nullable(),
});
export type AgentBudgetStatus = z.infer<typeof agentBudgetStatusSchema>;

export const agentHealthSchema = z.strictObject({
  agentId: z.uuid(),
  queueDepth: z.int().nonnegative(),
  oldestQueuedAgeMs: z.int().nonnegative().nullable(),
  activeWorkers: z.int().nonnegative(),
  lastSuccessAt: z.string().datetime({ offset: true }).nullable(),
  lastFailureAt: z.string().datetime({ offset: true }).nullable(),
  consecutiveFailures: z.int().nonnegative(),
});
export type AgentHealth = z.infer<typeof agentHealthSchema>;