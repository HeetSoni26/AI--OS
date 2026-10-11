import "server-only";

import {
  CHATBOT_STATUS_LABELS,
  type ChatbotConversationDto,
  type ChatbotStatus,
  type ConversationStatus,
  type IngestionStatus,
} from "@aios/contracts";
import { apiEnum, apiIso, apiNumber } from "./domain-service";

type EntityRecord = Record<string, unknown>;

function qaCounts(source: EntityRecord): { qaPairCount: number; pendingQaCount: number } {
  const pairs = Array.isArray(source.qaPairs) ? source.qaPairs as EntityRecord[] : [];
  return {
    qaPairCount: pairs.length,
    pendingQaCount: pairs.filter((pair) => !pair.approvedAt).length,
  };
}

export function mapChatbotVersion(row: EntityRecord) {
  return {
    version: row.version as number,
    name: row.name as string,
    brandVoice: row.brandVoice as string,
    greetingMessage: row.greetingMessage as string,
    fallbackResponse: row.fallbackResponse as string,
    confidenceThreshold: apiNumber(row.confidenceThreshold as never),
    model: row.model as string,
    systemPrompt: row.systemPrompt as string,
    status: apiEnum(row.status) as ChatbotStatus,
    publishedAt: apiIso(row.publishedAt as Date | null),
    createdAt: apiIso(row.createdAt as Date | null),
  };
}

export function mapChatbotListRow(row: EntityRecord) {
  const versions = Array.isArray(row.versions) ? row.versions as EntityRecord[] : [];
  const version = versions[0];
  const count = (relation: string) => {
    const counts = row._count as EntityRecord | undefined;
    return typeof counts?.[relation] === "number" ? counts[relation] : 0;
  };
  return {
    id: row.id as string,
    clientId: row.clientId as string,
    clientName: (row.clientName as string) ?? ((row.client as EntityRecord | undefined)?.name as string | undefined) ?? "Unknown client",
    agentId: row.agentId as string | null,
    name: row.name as string,
    platform: apiEnum(row.platform),
    status: apiEnum(row.status) as ChatbotStatus,
    activeVersion: row.activeVersion as number | null,
    allowedDomains: [...(row.allowedDomains as string[] ?? [])],
    config: version ? mapChatbotVersion(version) : null,
    conversationCount: count("conversations"),
    openConversationCount: row.openConversationCount as number | undefined ?? 0,
    sourceCount: count("sources"),
    statusLabel: CHATBOT_STATUS_LABELS[apiEnum(row.status) as ChatbotStatus],
    createdAt: apiIso(row.createdAt as Date | null),
    updatedAt: apiIso(row.updatedAt as Date | null),
  };
}

export function mapChatbotDetail(row: EntityRecord) {
  const sources = (Array.isArray(row.sources) ? row.sources : []) as EntityRecord[];
  const conversations = (Array.isArray(row.conversations) ? row.conversations : []) as EntityRecord[];
  const versions = (Array.isArray(row.versions) ? row.versions : []) as EntityRecord[];
  return {
    ...mapChatbotListRow({ ...row, _count: row._count, versions }),
    version: versions[0] ? mapChatbotVersion(versions[0]) : null,
    versions: versions.map(mapChatbotVersion),
    sources: sources.map((source) => ({
      id: source.id as string,
      type: apiEnum(source.type),
      title: source.title as string,
      sourceUrl: source.sourceUrl as string | null,
      status: apiEnum(source.status) as IngestionStatus,
      failureReason: source.failureReason as string | null,
      approvedAt: apiIso(source.approvedAt as Date | null),
      createdAt: apiIso(source.createdAt as Date | null),
      ...qaCounts(source),
    })),
    conversations: conversations.map((conversation) => mapConversationRow({
      ...conversation,
      chatbot: { name: row.name },
      client: row.client,
    })),
  };
}

export function mapConversationRow(row: EntityRecord): ChatbotConversationDto {
  const count = row._count as EntityRecord | undefined;
  return {
    id: row.id as string,
    chatbotId: row.chatbotId as string,
    chatbotName: (row.chatbotName as string) ?? ((row.chatbot as EntityRecord | undefined)?.name as string | undefined) ?? "Unknown chatbot",
    clientId: row.clientId as string,
    clientName: (row.clientName as string) ?? ((row.client as EntityRecord | undefined)?.name as string | undefined) ?? "Unknown client",
    status: apiEnum(row.status) as ConversationStatus,
    channel: apiEnum(row.channel) as ChatbotConversationDto["channel"],
    externalId: row.externalId as string | null,
    intent: row.intent as string | null,
    isLowConfidence: row.isLowConfidence === true,
    leadCaptured: row.leadCaptured === true,
    messageCount: typeof count?.messages === "number" ? count.messages : Array.isArray(row.messages) ? (row.messages as unknown[]).length : 0,
    escalatedAt: apiIso(row.escalatedAt as Date | null),
    createdAt: apiIso(row.createdAt as Date | null) ?? new Date(0).toISOString(),
  };
}

export function mapMessage(row: EntityRecord) {
  return {
    id: row.id as string,
    conversationId: row.conversationId as string,
    role: apiEnum(row.role),
    content: row.content as string,
    sequence: row.sequence as number,
    confidence: row.confidence == null ? null : apiNumber(row.confidence as never),
    intent: row.intent as string | null,
    responseLatencyMs: row.responseLatencyMs as number | null,
    createdAt: apiIso(row.createdAt as Date | null) ?? new Date(0).toISOString(),
  };
}
