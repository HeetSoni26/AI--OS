import { apiFetch } from "@/lib/api-client";

export type WorkflowValidation = {
  valid: boolean;
  issues: Array<{ code: string; message: string; nodeId?: string }>;
};

export type WorkflowSummaryDto = {
  id: string;
  clientId: string;
  clientName: string;
  agentId: string | null;
  name: string;
  description: string | null;
  provider: string;
  status: string;
  currentVersion: number | null;
  webhookUrl: string | null;
  totalExecutions: number;
  successRate: number;
  averageDurationMs: number | null;
  lastExecutedAt: string | null;
  latestValidation: WorkflowValidation | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowVersionDto = {
  id?: string;
  version: number;
  blueprint: Record<string, unknown>;
  humanPlan: string;
  assumptions?: string[];
  validation: WorkflowValidation | null;
  changeSummary: string | null;
  testedAt: string | null;
  deployedAt: string | null;
  createdAt: string | null;
};

export type WorkflowExecutionDto = {
  id: string;
  workflowId: string;
  status: string;
  providerExecutionId: string | null;
  failureStep: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
};

export type WorkflowDetailDto = WorkflowSummaryDto & {
  latestVersion: WorkflowVersionDto | null;
  versions: WorkflowVersionDto[];
  executions: WorkflowExecutionDto[];
};

export type WorkflowListResult = {
  items: WorkflowSummaryDto[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
};

export type WorkflowUpsertInput = {
  clientId: string;
  agentId?: string | null;
  name: string;
  description?: string | null;
  provider: "n8n" | "make";
  blueprint: { nodes: Array<{ id: string; type: string; name: string; parameters: Record<string, unknown> }>; connections: Array<{ from: string; to: string }>; trigger: string };
  humanPlan: string;
  assumptions: string[];
  changeSummary?: string | null;
};

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});

const data = <T>(path: string, init?: RequestInit) => apiFetch<T>(path, init).then((response) => response.data);

export const workflowApi = {
  list: (query: { clientId?: string; search?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    params.set("limit", String(query.limit ?? 100));
    if (query.clientId) params.set("clientId", query.clientId);
    if (query.search) params.set("search", query.search);
    return data<WorkflowListResult>(`/api/v1/workflows?${params.toString()}`);
  },
  detail: (workflowId: string) => data<WorkflowDetailDto>(`/api/v1/workflows/${workflowId}`),
  create: (input: WorkflowUpsertInput) => data<WorkflowDetailDto>("/api/v1/workflows", json("POST", input)),
  update: (workflowId: string, input: Partial<WorkflowUpsertInput>) =>
    data<WorkflowDetailDto>(`/api/v1/workflows/${workflowId}`, json("PATCH", input)),
  setStatus: (workflowId: string, action: "activate" | "pause" | "archive") =>
    data<WorkflowDetailDto>(`/api/v1/workflows/${workflowId}/status`, json("POST", { action })),
  recordTest: (workflowId: string, input: { status: "success" | "failed"; output?: Record<string, unknown>; errorMessage?: string | null }) =>
    data<WorkflowExecutionDto>(`/api/v1/workflows/${workflowId}/test`, json("POST", input)),
  executions: (workflowId?: string) =>
    data<{ items: WorkflowExecutionDto[] }>(`/api/v1/workflows/executions?limit=25${workflowId ? `&workflowId=${workflowId}` : ""}`),
};
