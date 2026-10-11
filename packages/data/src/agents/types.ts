import type { Prisma } from "../generated/client/client";
import type { AgentRunStatus, AgentStatus, AgentTriggerType, MemoryKind } from "../generated/client/enums";

export type AgentLifecycle = "active" | "archived" | "all";

export interface AgentToolInput {
  id: string;
  type: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export interface AgentTriggerInput {
  type: AgentTriggerType | Lowercase<AgentTriggerType>;
  cronExpression?: string | null;
  eventFilters?: readonly string[];
  webhookPath?: string | null;
  chainParentAgentId?: string | null;
}

export interface CreateAgentInput {
  name: string;
  description?: string | null;
  type: AgentTypeInput;
  model: string;
  systemPrompt: string;
  temperature?: number | string;
  maxTokens?: number;
  topP?: number | string;
  frequencyPenalty?: number | string;
  tools?: readonly AgentToolInput[];
  trigger?: AgentTriggerInput;
  dailyTokenBudget?: number | null;
  clientIds?: readonly string[];
  approvalRequired?: boolean;
  memoryEnabled?: boolean;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string | null;
  type?: AgentTypeInput;
  model?: string;
  systemPrompt?: string;
  temperature?: number | string;
  maxTokens?: number;
  topP?: number | string;
  frequencyPenalty?: number | string;
  tools?: readonly AgentToolInput[];
  trigger?: AgentTriggerInput;
  dailyTokenBudget?: number | null;
  clientIds?: readonly string[];
  approvalRequired?: boolean;
  memoryEnabled?: boolean;
  changeSummary?: string | null;
}

export type AgentTypeInput = string;

export interface ListAgentsInput {
  q?: string;
  types?: readonly string[];
  statuses?: readonly string[];
  clientId?: string;
  lifecycle?: AgentLifecycle;
  cursor?: string;
  limit?: number;
}

export interface AgentToolAssignment {
  id: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface AgentTriggerConfig {
  type: Lowercase<AgentTriggerType>;
  cronExpression: string | null;
  eventFilters: string[];
  webhookPath: string | null;
  chainParentAgentId: string | null;
}

export interface AgentSettings {
  tools: AgentToolAssignment[];
  trigger: AgentTriggerConfig;
  approvalRequired: boolean;
  memoryEnabled: boolean;
  clientIds?: string[];
}

export interface AgentListItem {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: AgentStatus;
  model: string;
  systemPrompt: string;
  temperature: Prisma.Decimal;
  maxTokens: number;
  topP: Prisma.Decimal;
  frequencyPenalty: Prisma.Decimal;
  scheduleCron: string | null;
  dailyTokenBudget: number | null;
  totalRuns: number;
  totalCostUsd: Prisma.Decimal;
  successRate: Prisma.Decimal;
  lastRunAt: Date | null;
  lastRunStatus: AgentRunStatus | null;
  currentConfigVersionId: string | null;
  settings: AgentSettings;
  clientIds: string[];
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListAgentsResult {
  items: AgentListItem[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface AgentConfigVersionRecord {
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
}

export interface AgentRunRecord {
  id: string;
  agentId: string;
  clientId: string | null;
  configVersionId: string | null;
  parentRunId: string | null;
  status: AgentRunStatus;
  triggerType: AgentTriggerType;
  idempotencyKey: string | null;
  inputText: string | null;
  outputText: string | null;
  partialOutput: string | null;
  tokensInput: number;
  tokensOutput: number;
  costUsd: Prisma.Decimal;
  durationMs: number | null;
  attempt: number;
  errorMessage: string | null;
  metadata: Prisma.JsonValue | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AgentDetail extends AgentListItem {
  configVersion: AgentConfigVersionRecord | null;
  recentRuns: AgentRunRecord[];
  configVersions: AgentConfigVersionRecord[];
  memoryCount: number;
  pendingApprovals: number;
  tokensUsedToday: number;
}

export interface DispatchRunInput {
  inputText?: string | null;
  triggerType?: AgentTriggerType | Lowercase<AgentTriggerType>;
  idempotencyKey?: string | null;
  clientId?: string | null;
  parentRunId?: string | null;
  chainDepth?: number;
}

export interface ListRunsInput {
  agentId?: string;
  clientId?: string;
  statuses?: readonly string[];
  triggerTypes?: readonly string[];
  fromDate?: Date;
  toDate?: Date;
  cursor?: string;
  limit?: number;
}

export interface ListRunsResult {
  items: AgentRunRecord[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface CreateMemoryInput {
  clientId?: string | null;
  sourceRunId?: string | null;
  kind: MemoryKind | Lowercase<MemoryKind>;
  key?: string | null;
  value: string;
  sourceIds?: readonly string[];
}

export interface UpdateMemoryInput {
  key?: string | null;
  value?: string;
  sourceIds?: readonly string[];
}

export interface ListMemoriesInput {
  clientId?: string;
  kinds?: readonly string[];
  cursor?: string;
  limit?: number;
}

export interface AgentMemoryRecord {
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
}

export interface ListMemoriesResult {
  items: AgentMemoryRecord[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface BudgetStatus {
  agentId: string;
  dailyTokenBudget: number | null;
  tokensUsedToday: number;
  tokensRemaining: number | null;
  budgetExceeded: boolean;
}

export interface RequestApprovalInput {
  agentId?: string | null;
  agentRunId?: string | null;
  configVersionId?: string | null;
  entityType: string;
  entityId: string;
  entityVersion?: number | null;
  payloadHash: string;
  expiresAt?: Date | null;
  note?: string | null;
}

export interface DecideApprovalInput {
  decision: "approve" | "reject";
  note?: string | null;
  decidedBy?: string | null;
}

export interface ApprovalRecord {
  id: string;
  action: string;
  status: string;
  agentId: string | null;
  agentRunId: string | null;
  configVersionId: string | null;
  entityType: string;
  entityId: string;
  entityVersion: number | null;
  requestedBy: string | null;
  decidedBy: string | null;
  requestedAt: Date;
  decidedAt: Date | null;
  expiresAt: Date | null;
  decisionNote: string | null;
  payloadHash: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
