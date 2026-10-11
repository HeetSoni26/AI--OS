import type {
  AgentConfigVersion,
  AgentDto,
  AgentRunDto,
  AgentSummary,
  ApprovalDto,
  agentMemoryDtoSchema,
} from "@aios/contracts";
import type { z } from "zod";
import { apiFetch } from "@/lib/api-client";

export type AgentMemoryDto = z.infer<typeof agentMemoryDtoSchema>;

export type AgentDetailDto = AgentDto & {
  settings: { approvalRequired: boolean; memoryEnabled: boolean };
  memoryCount: number;
  pendingApprovals: number;
  tokensUsedToday: number;
  recentRuns: readonly AgentRunDto[];
  configVersions: readonly AgentConfigVersion[];
};

export type AgentListDto = {
  items: readonly AgentSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
};

export type AgentRunListDto = {
  items: readonly AgentRunDto[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
};

export type AgentMemoryListDto = {
  items: readonly AgentMemoryDto[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
};

export type RuntimeStatusDto = {
  started: boolean;
  activeRuns: number;
  delayedRuns: number;
  schedulerRunning: boolean;
  providers: { openai: boolean; anthropic: boolean };
  liveProviderEnabled: boolean;
  queue: { queued: number; running: number; oldestQueuedAgeMs: number | null };
};

export type AgentListQuery = {
  limit?: number;
  cursor?: string;
  search?: string;
  statuses?: readonly string[];
  archiveScope?: "active" | "archived" | "all";
};

export type AgentTriggerType = "manual" | "scheduled" | "event" | "chain" | "webhook";

export type AgentUpsertInput = {
  name: string;
  description?: string | null;
  type: string;
  modelParameters: {
    model: string;
    temperature: number;
    maxTokens: number;
    topP: number;
    frequencyPenalty: number;
  };
  systemPrompt: string;
  tools: Array<{ id: string; type: string; config: Record<string, unknown>; enabled: boolean }>;
  trigger: {
    type: AgentTriggerType;
    cronExpression: string | null;
    eventFilters: string[];
    webhookPath: string | null;
    chainParentAgentId: string | null;
  };
  dailyTokenBudget: number | null;
  clientIds: string[];
  approvalRequired: boolean;
  memoryEnabled: boolean;
};

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});

const data = <T>(path: string, init?: RequestInit) => apiFetch<T>(path, init).then((response) => response.data);

export const agentApi = {
  list: (query: AgentListQuery = {}) => {
    const params = new URLSearchParams();
    params.set("limit", String(query.limit ?? 100));
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.search) params.set("search", query.search);
    if (query.archiveScope) params.set("archiveScope", query.archiveScope);
    for (const status of query.statuses ?? []) params.append("statuses", status);
    return data<AgentListDto>(`/api/v1/agents?${params.toString()}`);
  },
  detail: (agentId: string) => data<AgentDetailDto>(`/api/v1/agents/${agentId}`),
  create: (input: AgentUpsertInput) => data<AgentDetailDto>("/api/v1/agents", json("POST", input)),
  update: (agentId: string, input: Partial<AgentUpsertInput> & { changeSummary?: string }) =>
    data<AgentDetailDto>(`/api/v1/agents/${agentId}`, json("PATCH", input)),
  delete: (agentId: string) => data<{ deleted: boolean }>(`/api/v1/agents/${agentId}`, json("DELETE")),

  run: (agentId: string, inputText?: string) =>
    data<AgentRunDto>(`/api/v1/agents/${agentId}/run`, json("POST", { inputText: inputText?.trim() || undefined })),
  pause: (agentId: string) => data<AgentDetailDto>(`/api/v1/agents/${agentId}/pause`, json("POST")),
  resume: (agentId: string) => data<AgentDetailDto>(`/api/v1/agents/${agentId}/resume`, json("POST")),

  runs: (query: { agentId?: string; limit?: number; statuses?: readonly string[]; cursor?: string } = {}) => {
    const params = new URLSearchParams();
    params.set("limit", String(query.limit ?? 20));
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.agentId) params.set("agentId", query.agentId);
    for (const status of query.statuses ?? []) params.append("statuses", status);
    return data<AgentRunListDto>(`/api/v1/agents/runs?${params.toString()}`);
  },

  memory: (agentId: string, limit = 50) =>
    data<AgentMemoryListDto>(`/api/v1/agents/${agentId}/memory?limit=${limit}`),
  createMemory: (agentId: string, input: { kind: "key_value" | "vector" | "summary"; key?: string | null; value: string; clientId?: string | null }) =>
    data<AgentMemoryDto>(`/api/v1/agents/${agentId}/memory`, json("POST", input)),
  updateMemory: (agentId: string, memoryId: string, input: { key?: string | null; value: string }) =>
    data<AgentMemoryDto>(`/api/v1/agents/${agentId}/memory/${memoryId}`, json("PATCH", input)),
  deleteMemory: (agentId: string, memoryId: string) =>
    data<{ deleted: boolean }>(`/api/v1/agents/${agentId}/memory/${memoryId}`, json("DELETE")),

  approvals: (limit = 25) =>
    data<{ items: readonly ApprovalDto[] }>(`/api/v1/agents/approvals?limit=${limit}`),
  decideApproval: (approvalId: string, decision: "approve" | "reject", payloadHash: string, note?: string) =>
    data<ApprovalDto>(`/api/v1/agents/approvals/${approvalId}`, json("POST", { decision, payloadHash, note })),

  runtime: () => data<RuntimeStatusDto>("/api/v1/agents/runtime"),
};
