import { apiFetch } from "@/lib/api-client";

export type KnowledgeEntryDto = {
  id: string;
  clientId: string | null;
  title: string;
  category: string;
  content: string;
  tags: string[];
  version: number;
  accessCount: number;
  lastAccessedAt: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  versions: Array<{ version: number; title: string; changeSummary: string | null; createdBy: string | null; createdAt: string | null }>;
};

export type SopStepDto = {
  id: string;
  position: number;
  title: string;
  instructions: string;
  expectedResult: string | null;
  isOptional: boolean;
};

export type SopDto = {
  id: string;
  clientId: string | null;
  title: string;
  materials: string[];
  expectedOutcome: string;
  currentVersion: number;
  usageCount: number;
  lastExecutedAt: string | null;
  lastTestedAt: string | null;
  steps: SopStepDto[];
  executions: Array<{ id: string; status: string; errorMessage: string | null; completedAt: string | null; createdAt: string | null }>;
  updatedAt: string | null;
};

export type NotificationDto = {
  id: string;
  type: string;
  priority: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: string;
};

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});

const data = <T>(path: string, init?: RequestInit) => apiFetch<T>(path, init).then((response) => response.data);

export const knowledgeApi = {
  entries: (search?: string, searchMode?: "keyword" | "semantic") =>
    data<{ items: KnowledgeEntryDto[]; total: number }>(`/api/v1/knowledge?limit=100${search ? `&search=${encodeURIComponent(search)}` : ""}${searchMode ? `&searchMode=${searchMode}` : ""}`),
  entry: (entryId: string) => data<KnowledgeEntryDto>(`/api/v1/knowledge/${entryId}`),
  createEntry: (input: { title: string; category: string; content: string; tags?: string[] }) =>
    data<KnowledgeEntryDto>("/api/v1/knowledge", json("POST", input)),
  updateEntry: (entryId: string, input: { title?: string; content?: string; changeSummary?: string }) =>
    data<KnowledgeEntryDto>(`/api/v1/knowledge/${entryId}`, json("PATCH", input)),

  sops: () => data<{ items: SopDto[] }>("/api/v1/knowledge/sops"),
  createSop: (input: {
    title: string;
    expectedOutcome: string;
    materials?: string[];
    steps: Array<{ title: string; instructions: string; expectedResult?: string | null; isOptional?: boolean }>;
  }) => data<SopDto>("/api/v1/knowledge/sops", json("POST", input)),
  recordSopExecution: (sopId: string, input: { status: "completed" | "failed"; stepResults: Array<{ position: number; done: boolean }> }) =>
    data<{ id: string; status: string }>(`/api/v1/knowledge/sops/${sopId}/executions`, json("POST", input)),

  notifications: (unreadOnly = false) =>
    data<{ items: NotificationDto[]; unreadCount: number }>(`/api/v1/knowledge/notifications${unreadOnly ? "?unread=true" : ""}`),
  markNotificationRead: (notificationId: string) =>
    data<{ items: NotificationDto[]; unreadCount: number }>(`/api/v1/knowledge/notifications/${notificationId}/read`, json("POST")),
  markAllNotificationsRead: () =>
    data<{ items: NotificationDto[]; unreadCount: number }>("/api/v1/knowledge/notifications", json("POST", { action: "mark_all_read" })),
};
