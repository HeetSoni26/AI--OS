import type {
  ChatbotConversationDto,
  ChatbotMessageDto,
  ChatbotStatus,
} from "@aios/contracts";
import { apiFetch } from "@/lib/api-client";

export type ChatbotVersionDto = {
  version: number;
  name: string;
  brandVoice: string;
  greetingMessage: string;
  fallbackResponse: string;
  confidenceThreshold: number;
  model: string;
  systemPrompt: string;
  status: string;
  publishedAt: string | null;
  createdAt: string | null;
};

export type ChatbotSourceDto = {
  id: string;
  type: string;
  title: string;
  sourceUrl: string | null;
  status: string;
  failureReason: string | null;
  approvedAt: string | null;
  createdAt: string | null;
  qaPairCount: number;
  pendingQaCount: number;
};

export type ChatbotSummaryDto = {
  id: string;
  clientId: string;
  clientName: string;
  agentId: string | null;
  name: string;
  platform: string;
  status: ChatbotStatus;
  activeVersion: number | null;
  allowedDomains: string[];
  config: ChatbotVersionDto | null;
  conversationCount: number;
  openConversationCount: number;
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ChatbotDetailDto = ChatbotSummaryDto & {
  version: ChatbotVersionDto | null;
  versions: ChatbotVersionDto[];
  sources: ChatbotSourceDto[];
  conversations: ChatbotConversationDto[];
};

export type ChatbotListResult = {
  items: ChatbotSummaryDto[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
};

export type ConversationListResult = {
  items: ChatbotConversationDto[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
};

export type ConversationDetailDto = ChatbotConversationDto & {
  messages: ChatbotMessageDto[];
};

export type ChatResponse = {
  conversationId: string;
  message: ChatbotMessageDto;
  grounded: boolean;
  escalated: boolean;
  citations: string[];
};

export type ChatbotUpsertInput = {
  clientId: string;
  agentId?: string | null;
  platform: "website" | "whatsapp" | "instagram" | "api";
  allowedDomains: string[];
  config: {
    name: string;
    brandVoice: string;
    greetingMessage: string;
    fallbackResponse: string;
    confidenceThreshold: number;
    model: string;
    systemPrompt: string;
  };
};

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});

const data = <T>(path: string, init?: RequestInit) => apiFetch<T>(path, init).then((response) => response.data);

export const chatbotApi = {
  list: (query: { clientId?: string; search?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    params.set("limit", String(query.limit ?? 100));
    if (query.clientId) params.set("clientId", query.clientId);
    if (query.search) params.set("search", query.search);
    return data<ChatbotListResult>(`/api/v1/chatbots?${params.toString()}`);
  },
  detail: (chatbotId: string) => data<ChatbotDetailDto>(`/api/v1/chatbots/${chatbotId}`),
  create: (input: ChatbotUpsertInput) => data<ChatbotDetailDto>("/api/v1/chatbots", json("POST", input)),
  update: (chatbotId: string, input: { platform?: string; allowedDomains?: string[]; agentId?: string | null; config?: Partial<ChatbotUpsertInput["config"]> }) =>
    data<ChatbotDetailDto>(`/api/v1/chatbots/${chatbotId}`, json("PATCH", input)),
  setStatus: (chatbotId: string, action: "deploy" | "pause" | "archive") =>
    data<ChatbotDetailDto>(`/api/v1/chatbots/${chatbotId}/status`, json("POST", { action })),

  addSource: (chatbotId: string, input: { title: string; type: "faq" | "product_document" | "website_url"; sourceUrl?: string | null; content: string }) =>
    data<{ sourceId: string; qaPairCount: number }>(`/api/v1/chatbots/${chatbotId}/sources`, json("POST", input)),
  approveSource: (chatbotId: string, sourceId: string) =>
    data<ChatbotDetailDto>(`/api/v1/chatbots/${chatbotId}/sources/${sourceId}/approve`, json("POST")),

  conversations: (query: { chatbotId?: string; lowConfidenceOnly?: boolean; limit?: number } = {}) => {
    const params = new URLSearchParams();
    params.set("limit", String(query.limit ?? 25));
    if (query.chatbotId) params.set("chatbotId", query.chatbotId);
    if (query.lowConfidenceOnly) params.set("lowConfidenceOnly", "true");
    return data<ConversationListResult>(`/api/v1/chatbots/conversations?${params.toString()}`);
  },
  conversation: (conversationId: string) => data<ConversationDetailDto>(`/api/v1/chatbots/conversations/${conversationId}`),
  resolveConversation: (conversationId: string) => data<ConversationDetailDto>(`/api/v1/chatbots/conversations/${conversationId}`, json("POST", { action: "resolve" })),

  chat: (chatbotId: string, message: string, conversationId?: string | null) =>
    data<ChatResponse>(`/api/v1/chatbots/${chatbotId}/chat${conversationId ? `?conversationId=${conversationId}` : ""}`, json("POST", { message })),
};
