import { z } from "zod";
import { cursorSchema, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./api";

export const chatbotPlatforms = ["website", "whatsapp", "instagram", "api"] as const;
export const chatbotPlatformSchema = z.enum(chatbotPlatforms);
export type ChatbotPlatformName = z.infer<typeof chatbotPlatformSchema>;
export const CHATBOT_PLATFORM_LABELS = {
  website: "Website Widget",
  whatsapp: "WhatsApp",
  instagram: "Instagram DM",
  api: "Custom API",
} as const satisfies Record<ChatbotPlatformName, string>;

export const chatbotStatuses = ["draft", "active", "paused", "archived"] as const;
export const chatbotStatusSchema = z.enum(chatbotStatuses);
export type ChatbotStatus = z.infer<typeof chatbotStatusSchema>;
export const CHATBOT_STATUS_LABELS = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
} as const satisfies Record<ChatbotStatus, string>;

export const conversationStatuses = ["open", "escalated", "resolved"] as const;
export const conversationStatusSchema = z.enum(conversationStatuses);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;
export const CONVERSATION_STATUS_LABELS = {
  open: "Open",
  escalated: "Escalated",
  resolved: "Resolved",
} as const satisfies Record<ConversationStatus, string>;

export const ingestionStatuses = ["pending", "processing", "ready_for_review", "approved", "failed"] as const;
export const ingestionStatusSchema = z.enum(ingestionStatuses);
export type IngestionStatus = z.infer<typeof ingestionStatusSchema>;
export const INGESTION_STATUS_LABELS = {
  pending: "Pending",
  processing: "Processing",
  ready_for_review: "Ready for review",
  approved: "Approved",
  failed: "Failed",
} as const satisfies Record<IngestionStatus, string>;

const chatbotConfigSchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  brandVoice: z.string().trim().min(1).max(2_000),
  greetingMessage: z.string().trim().min(1).max(1_000),
  fallbackResponse: z.string().trim().min(1).max(1_000),
  confidenceThreshold: z.number().min(0).max(1).default(0.7),
  model: z.string().trim().min(1).max(100).default("gpt-4o-mini"),
  systemPrompt: z.string().trim().min(1).max(20_000),
});

export const chatbotCreateSchema = z.strictObject({
  clientId: z.uuid(),
  agentId: z.uuid().nullable().optional(),
  platform: chatbotPlatformSchema,
  allowedDomains: z.array(z.string().trim().min(1).max(255)).max(20).default([]),
  config: chatbotConfigSchema,
});
export type ChatbotCreateInput = z.infer<typeof chatbotCreateSchema>;

export const chatbotUpdateSchema = z.strictObject({
  platform: chatbotPlatformSchema.optional(),
  allowedDomains: z.array(z.string().trim().min(1).max(255)).max(20).optional(),
  agentId: z.uuid().nullable().optional(),
  config: chatbotConfigSchema.partial().optional(),
}).refine((data) => Object.keys(data).length > 0, "At least one field is required.");
export type ChatbotUpdateInput = z.infer<typeof chatbotUpdateSchema>;

export const chatbotSourceCreateSchema = z.strictObject({
  title: z.string().trim().min(1).max(500),
  type: z.enum(["faq", "product_document", "website_url"]),
  sourceUrl: z.string().trim().url().max(2_000).nullable().optional(),
  content: z.string().trim().min(1).max(100_000),
});
export type ChatbotSourceCreateInput = z.infer<typeof chatbotSourceCreateSchema>;

export const chatbotQaPairSchema = z.strictObject({
  id: z.uuid(),
  chatbotId: z.uuid(),
  sourceId: z.uuid(),
  question: z.string(),
  answer: z.string(),
  confidence: z.number().nullable(),
  evidence: z.string().nullable(),
  approvedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});
export type ChatbotQaPairDto = z.infer<typeof chatbotQaPairSchema>;

export const chatbotVersionDtoSchema = z.strictObject({
  version: z.number().int().positive(),
  name: z.string(),
  brandVoice: z.string(),
  greetingMessage: z.string(),
  fallbackResponse: z.string(),
  confidenceThreshold: z.number(),
  model: z.string(),
  status: chatbotStatusSchema,
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});
export type ChatbotVersionDto = z.infer<typeof chatbotVersionDtoSchema>;

export const chatbotSourceDtoSchema = z.strictObject({
  id: z.uuid(),
  chatbotId: z.uuid(),
  type: z.string(),
  title: z.string(),
  sourceUrl: z.string().nullable(),
  status: ingestionStatusSchema,
  failureReason: z.string().nullable(),
  approvedAt: z.string().datetime({ offset: true }).nullable(),
  qaPairCount: z.number().int().nonnegative(),
  pendingQaCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
});
export type ChatbotSourceDto = z.infer<typeof chatbotSourceDtoSchema>;

export const chatbotMessageDtoSchema = z.strictObject({
  id: z.uuid(),
  conversationId: z.uuid(),
  role: z.enum(["user", "assistant", "owner"]),
  content: z.string(),
  sequence: z.number().int().positive(),
  confidence: z.number().nullable(),
  intent: z.string().nullable(),
  responseLatencyMs: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime({ offset: true }),
});
export type ChatbotMessageDto = z.infer<typeof chatbotMessageDtoSchema>;

export const chatbotConversationDtoSchema = z.strictObject({
  id: z.uuid(),
  chatbotId: z.uuid(),
  chatbotName: z.string(),
  clientId: z.uuid(),
  clientName: z.string(),
  status: conversationStatusSchema,
  channel: chatbotPlatformSchema,
  externalId: z.string().nullable(),
  intent: z.string().nullable(),
  isLowConfidence: z.boolean(),
  leadCaptured: z.boolean(),
  messageCount: z.number().int().nonnegative(),
  escalatedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});
export type ChatbotConversationDto = z.infer<typeof chatbotConversationDtoSchema>;

const chatbotConfigDtoSchema = chatbotConfigSchema.partial();

export const chatbotDtoSchema = z.strictObject({
  id: z.uuid(),
  clientId: z.uuid(),
  clientName: z.string(),
  agentId: z.uuid().nullable(),
  name: z.string(),
  platform: chatbotPlatformSchema,
  status: chatbotStatusSchema,
  activeVersion: z.number().int().nullable(),
  allowedDomains: z.array(z.string()),
  config: chatbotConfigDtoSchema,
  conversationCount: z.number().int().nonnegative(),
  openConversationCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type ChatbotDto = z.infer<typeof chatbotDtoSchema>;

export const chatbotListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  clientId: z.uuid().optional(),
  statuses: z.array(chatbotStatusSchema).optional(),
  search: z.string().trim().max(200).optional(),
});
export type ChatbotListQuery = z.infer<typeof chatbotListQuerySchema>;

export const conversationListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  chatbotId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  statuses: z.array(conversationStatusSchema).optional(),
  lowConfidenceOnly: z.coerce.boolean().optional(),
});
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;

export const chatbotChatSchema = z.strictObject({
  message: z.string().trim().min(1).max(4_000),
});
export type ChatbotChatInput = z.infer<typeof chatbotChatSchema>;

export const chatbotChatResponseSchema = z.strictObject({
  conversationId: z.uuid(),
  message: chatbotMessageDtoSchema,
  grounded: z.boolean(),
  escalated: z.boolean(),
  citations: z.array(z.string()).default([]),
});
export type ChatbotChatResponse = z.infer<typeof chatbotChatResponseSchema>;
