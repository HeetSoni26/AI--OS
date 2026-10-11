import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/client/client";
import {
  ChatbotPlatform,
  ChatbotSourceType,
  ChatbotStatus,
  ConversationStatus,
  IngestionStatus,
  MessageRole,
} from "../generated/client/enums";
import { ClientOperationsError } from "../clients/errors";
import { appendMutationRecords, requireActiveOwnerInTransaction } from "../clients/internal";
import type { OwnerIdentity } from "../clients/types";
import {
  type ChatbotChatInput,
  type ChatbotCreateInput,
  type ChatbotListQuery,
  type ChatbotSourceCreateInput,
  type ChatbotUpdateInput,
  type ConversationListQuery,
} from "@aios/contracts";

export type { ChatbotCreateInput, ChatbotUpdateInput, ChatbotSourceCreateInput, ChatbotChatInput, ChatbotListQuery, ConversationListQuery };

export type ChatbotOperationsErrorCode =
  | "INVALID_IDENTITY" | "NOT_FOUND" | "INVALID_INPUT" | "CONFLICT" | "CONFIG_INVALID" | "STATE_INVALID";

export class ChatbotOperationsError extends Error {
  constructor(public readonly code: ChatbotOperationsErrorCode, message: string) {
    super(message);
    this.name = "ChatbotOperationsError";
  }
}

const CHATBOT_LIST_LIMIT = 100;
const QA_MIN_CHARS = 3;
const CHUNK_OVERLAP = 0;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Deterministic Q&A extraction: splits sanitized source text into paragraphs and
 * derives question-shaped pairs ("What is X?" style headings or declarative
 * paragraphs). Every pair starts unapproved; the owner reviews before publication.
 */
export function extractQaPairs(content: string): Array<{ question: string; answer: string; evidence: string }> {
  const sanitized = content
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/\r/g, "")
    .trim();
  const paragraphs = sanitized.split(/\n{2,}/).map((part) => part.trim()).filter((part) => part.length >= QA_MIN_CHARS);
  const pairs: Array<{ question: string; answer: string; evidence: string }> = [];
  const looksLikeQuestion = (paragraph: string): boolean =>
    /\?\s*$/.test(paragraph) || /^(what|how|do|does|is|are|can|could|where|when|who|why|which)/i.test(paragraph);
  let index = 0;
  while (index < paragraphs.length) {
    const paragraph = paragraphs[index]!;
    const next = paragraphs[index + 1];
    if (looksLikeQuestion(paragraph) && next && !looksLikeQuestion(next)) {
      pairs.push({
        question: paragraph.replace(/\s*\?\s*$/, "?").slice(0, 500),
        answer: next.slice(0, 2_000),
        evidence: `${paragraph} ${next}`.slice(0, 300),
      });
      index += 2;
      continue;
    }
    if (looksLikeQuestion(paragraph)) { index += 1; continue; }
    const sentences = paragraph.split(/(?<=[.!?])\s+/).filter(Boolean);
    const firstSentence = sentences[0] ?? paragraph;
    const question = firstSentence.length > 120
      ? `${firstSentence.slice(0, 117).trimEnd()}…?`
      : `${firstSentence.replace(/[.!?]+$/, "")}?`;
    pairs.push({ question, answer: paragraph.slice(0, 2_000), evidence: paragraph.slice(0, 300) });
    index += 1;
  }
  return pairs.slice(0, 200);
}

/** Keyword-overlap grounded answer with an explainable confidence score. */
const STOPWORDS = new Set([
  "how", "what", "the", "is", "are", "do", "does", "did", "you", "your", "for", "and",
  "with", "can", "could", "would", "will", "about", "from", "that", "this", "have",
  "has", "any", "get", "when", "where", "who", "why", "which",
]);

export function groundAnswer(
  question: string,
  approvedQa: ReadonlyArray<{ id: string; question: string; answer: string; evidence: string | null }>,
): { answer: string; confidence: number; citations: string[]; matchedId: string | null } {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 2 && !STOPWORDS.has(word));
  const questionWords = new Set(normalize(question));
  if (questionWords.size === 0) return { answer: "", confidence: 0, citations: [], matchedId: null };
  let best: { score: number; entry: (typeof approvedQa)[number] } | null = null;
  for (const entry of approvedQa) {
    const entryWords = new Set(normalize(`${entry.question} ${entry.answer}`));
    if (entryWords.size === 0) continue;
    let matches = 0;
    for (const word of questionWords) if (entryWords.has(word)) matches += 1;
    const score = matches / questionWords.size;
    if (!best || score > best.score) best = { score, entry };
  }
  if (!best || best.score < 0.2) return { answer: "", confidence: 0, citations: [], matchedId: null };
  return {
    answer: best.entry.answer,
    confidence: Math.round(Math.min(1, best.score * 1.2) * 1_000) / 1_000,
    citations: best.entry.evidence ? [best.entry.evidence.slice(0, 200)] : [],
    matchedId: best.entry.id,
  };
}

type Database = PrismaClient;
type Transaction = Prisma.TransactionClient;

export class PrismaChatbotService {
  constructor(private readonly database: Database) {}

  async listChatbots(identity: OwnerIdentity, input: Partial<ChatbotListQuery> = {}) {
    await this.requireActiveOwner(identity);
    const limit = Math.max(1, Math.min(input.limit ?? 50, CHATBOT_LIST_LIMIT));
    const where: Prisma.ChatbotWhereInput = { deletedAt: null };
    if (input.clientId) where.clientId = input.clientId;
    const statuses = (input.statuses ?? []).map((status) => status.toUpperCase());
    if (statuses.length) where.status = { in: statuses as ChatbotStatus[] };
    if (input.search) where.name = { contains: input.search, mode: "insensitive" };
    const total = await this.database.chatbot.count({ where });
    const rows = await this.database.chatbot.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: limit + 1,
      include: {
        client: { select: { name: true } },
        versions: { where: { deletedAt: null }, orderBy: { version: "desc" }, take: 1 },
        _count: { select: { conversations: { where: { deletedAt: null } }, sources: { where: { deletedAt: null } } } },
      },
    });
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const ids = visible.map((row) => row.id);
    const openCounts = ids.length
      ? await this.database.chatbotConversation.groupBy({
          by: ["chatbotId"],
          where: { chatbotId: { in: ids }, status: ConversationStatus.OPEN, deletedAt: null },
          _count: { _all: true },
        })
      : [];
    const openByChatbot = new Map(openCounts.map((group) => [group.chatbotId, group._count._all]));
    const items = visible.map((row) => ({
      id: row.id,
      clientId: row.clientId,
      clientName: row.client.name,
      agentId: row.agentId,
      name: row.name,
      platform: row.platform,
      status: row.status,
      activeVersion: row.activeVersion,
      allowedDomains: [...row.allowedDomains],
      config: row.versions.length ? row.versions[0] : null,
      conversationCount: row._count.conversations,
      openConversationCount: openByChatbot.get(row.id) ?? 0,
      sourceCount: row._count.sources,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
    return {
      items,
      total,
      hasMore,
      nextCursor: hasMore && visible.at(-1) ? visible.at(-1)!.id : null,
    };
  }

  async getChatbotDetail(identity: OwnerIdentity, chatbotId: string) {
    await this.requireActiveOwner(identity);
    const chatbot = await this.database.chatbot.findFirst({
      where: { id: chatbotId, deletedAt: null },
      include: {
        client: { select: { name: true } },
        versions: { where: { deletedAt: null }, orderBy: { version: "desc" }, take: 10 },
        sources: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: { qaPairs: { where: { deletedAt: null }, select: { id: true, approvedAt: true } } },
        },
        conversations: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { _count: { select: { messages: true } } },
        },
      },
    });
    if (!chatbot) throw new ChatbotOperationsError("NOT_FOUND", "Chatbot not found.");
    return chatbot;
  }

  async createChatbot(identity: OwnerIdentity, input: ChatbotCreateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const client = await transaction.client.findFirst({ where: { id: input.clientId, deletedAt: null }, select: { id: true } });
      if (!client) throw new ChatbotOperationsError("INVALID_INPUT", "The chatbot client does not exist.");
      const chatbot = await transaction.chatbot.create({
        data: {
          id: randomUUID(),
          clientId: input.clientId,
          agentId: input.agentId ?? null,
          name: input.config.name,
          platform: platformToDb(input.platform),
          status: ChatbotStatus.DRAFT,
          allowedDomains: input.allowedDomains,
        },
      });
      const version = await transaction.chatbotVersion.create({
        data: {
          chatbotId: chatbot.id,
          version: 1,
          name: input.config.name,
          brandVoice: input.config.brandVoice,
          greetingMessage: input.config.greetingMessage,
          fallbackResponse: input.config.fallbackResponse,
          escalationRules: { escalateOnLowConfidence: true } satisfies Prisma.InputJsonValue,
          confidenceThreshold: input.config.confidenceThreshold,
          model: input.config.model,
          systemPrompt: input.config.systemPrompt,
          status: ChatbotStatus.DRAFT,
        },
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "chatbot",
        entityId: chatbot.id,
        action: "create",
        eventType: "chatbot.created",
        payload: { name: chatbot.name, clientId: chatbot.clientId, platform: chatbot.platform, versionId: version.id },
        changedFields: ["name", "platform", "clientId"],
      }]);
      return { chatbotId: chatbot.id, version };
    });
  }

  async updateChatbot(identity: OwnerIdentity, chatbotId: string, input: ChatbotUpdateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const chatbot = await transaction.chatbot.findFirst({ where: { id: chatbotId, deletedAt: null } });
      if (!chatbot) throw new ChatbotOperationsError("NOT_FOUND", "Chatbot not found.");
      const latest = await transaction.chatbotVersion.findFirst({
        where: { chatbotId, deletedAt: null },
        orderBy: { version: "desc" },
      });
      if (!latest) throw new ChatbotOperationsError("STATE_INVALID", "The chatbot has no configuration version.");

      const config = input.config;
      const configChanged = config != null && (
        (config.name !== undefined && config.name !== latest.name)
        || (config.brandVoice !== undefined && config.brandVoice !== latest.brandVoice)
        || (config.greetingMessage !== undefined && config.greetingMessage !== latest.greetingMessage)
        || (config.fallbackResponse !== undefined && config.fallbackResponse !== latest.fallbackResponse)
        || (config.confidenceThreshold !== undefined && config.confidenceThreshold !== Number(latest.confidenceThreshold))
        || (config.model !== undefined && config.model !== latest.model)
        || (config.systemPrompt !== undefined && config.systemPrompt !== latest.systemPrompt)
      );
      if (configChanged && config) {
        // Editing a published configuration invalidates the active deployment.
        const version = await transaction.chatbotVersion.create({
          data: {
            chatbotId,
            version: latest.version + 1,
            name: config.name ?? latest.name,
            brandVoice: config.brandVoice ?? latest.brandVoice,
            greetingMessage: config.greetingMessage ?? latest.greetingMessage,
            fallbackResponse: config.fallbackResponse ?? latest.fallbackResponse,
            escalationRules: latest.escalationRules as unknown as Prisma.InputJsonValue,
            confidenceThreshold: config.confidenceThreshold ?? latest.confidenceThreshold,
            model: config.model ?? latest.model,
            systemPrompt: config.systemPrompt ?? latest.systemPrompt,
            ...(latest.customActions ? { customActions: latest.customActions as Prisma.InputJsonValue } : {}),
            ...(latest.bookingConfig ? { bookingConfig: latest.bookingConfig as Prisma.InputJsonValue } : {}),
            ...(latest.recommendationConfig ? { recommendationConfig: latest.recommendationConfig as Prisma.InputJsonValue } : {}),
            status: ChatbotStatus.DRAFT,
          },
        });
        await transaction.chatbot.update({ where: { id: chatbotId }, data: { name: version.name, activeVersion: null, status: ChatbotStatus.PAUSED } });
        await appendMutationRecords(transaction, identity, [{
          entityType: "chatbot",
          entityId: chatbotId,
          action: "update",
          eventType: "chatbot.config_updated",
          payload: { version: version.version, name: version.name },
          changedFields: Object.keys(config),
        }]);
      } else {
        const updated = await transaction.chatbot.update({
          where: { id: chatbotId },
          data: {
            ...(input.platform ? { platform: platformToDb(input.platform) } : {}),
            ...(input.allowedDomains ? { allowedDomains: input.allowedDomains } : {}),
            ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
          },
        });
        void updated;
        await appendMutationRecords(transaction, identity, [{
          entityType: "chatbot",
          entityId: chatbotId,
          action: "update",
          eventType: "chatbot.updated",
          payload: { name: chatbot.name },
          changedFields: Object.keys(input),
        }]);
      }
      return this.getDetailInTransaction(transaction, chatbotId);
    });
  }

  async setChatbotStatus(identity: OwnerIdentity, chatbotId: string, next: "deploy" | "pause" | "archive") {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const chatbot = await transaction.chatbot.findFirst({ where: { id: chatbotId, deletedAt: null } });
      if (!chatbot) throw new ChatbotOperationsError("NOT_FOUND", "Chatbot not found.");
      const latest = await transaction.chatbotVersion.findFirst({
        where: { chatbotId, deletedAt: null },
        orderBy: { version: "desc" },
      });
      if (!latest) throw new ChatbotOperationsError("STATE_INVALID", "The chatbot has no configuration version.");
      const approvedQaCount = await transaction.chatbotQaPair.count({ where: { chatbotId, approvedAt: { not: null }, deletedAt: null } });
      let status: ChatbotStatus;
      if (next === "deploy") {
        if (approvedQaCount === 0) {
          throw new ChatbotOperationsError("CONFIG_INVALID", "Approve at least one Q&A pair before deploying this chatbot.");
        }
        status = ChatbotStatus.ACTIVE;
        await transaction.chatbotVersion.update({ where: { id: latest.id }, data: { status: ChatbotStatus.ACTIVE, publishedAt: new Date() } });
        await transaction.chatbot.update({ where: { id: chatbotId }, data: { activeVersion: latest.version } });
      } else if (next === "pause") {
        status = ChatbotStatus.PAUSED;
      } else {
        status = ChatbotStatus.ARCHIVED;
        await transaction.chatbot.update({ where: { id: chatbotId }, data: { archivedAt: new Date() } });
      }
      const updated = await transaction.chatbot.update({ where: { id: chatbotId }, data: { status } });
      void updated;
      await appendMutationRecords(transaction, identity, [{
        entityType: "chatbot",
        entityId: chatbotId,
        action: next,
        eventType: `chatbot.${next}`,
        payload: { name: chatbot.name, status },
      }]);
      return this.getDetailInTransaction(transaction, chatbotId);
    });
  }

  async ingestSource(identity: OwnerIdentity, chatbotId: string, input: ChatbotSourceCreateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const chatbot = await transaction.chatbot.findFirst({ where: { id: chatbotId, deletedAt: null } });
      if (!chatbot) throw new ChatbotOperationsError("NOT_FOUND", "Chatbot not found.");
      if (input.type === "website_url" && !input.sourceUrl) {
        throw new ChatbotOperationsError("INVALID_INPUT", "Website URL sources require a URL.");
      }
      const source = await transaction.chatbotSource.create({
        data: {
          id: randomUUID(),
          chatbotId,
          type: sourceTypeToDb(input.type),
          title: input.title,
          sourceUrl: input.sourceUrl ?? null,
          contentHash: sha256(input.content),
          provenance: {
            ingestedBy: "owner",
            characters: input.content.length,
            contentHash: sha256(input.content),
          } satisfies Prisma.InputJsonValue,
          status: IngestionStatus.READY,
        },
      });
      const pairs = extractQaPairs(input.content);
      for (const pair of pairs) {
        await transaction.chatbotQaPair.create({
          data: {
            chatbotId,
            sourceId: source.id,
            question: pair.question,
            answer: pair.answer,
            evidence: pair.evidence,
          },
        });
      }
      await appendMutationRecords(transaction, identity, [{
        entityType: "chatbot_source",
        entityId: source.id,
        action: "ingest",
        eventType: "chatbot.source_ingested",
        payload: { chatbotId, title: source.title, qaPairs: pairs.length },
      }]);
      return { sourceId: source.id, qaPairCount: pairs.length };
    });
  }

  async approveSource(identity: OwnerIdentity, chatbotId: string, sourceId: string) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const source = await transaction.chatbotSource.findFirst({ where: { id: sourceId, chatbotId, deletedAt: null } });
      if (!source) throw new ChatbotOperationsError("NOT_FOUND", "Source not found.");
      await transaction.chatbotSource.update({ where: { id: sourceId }, data: { status: IngestionStatus.READY, approvedAt: new Date() } });
      await transaction.chatbotQaPair.updateMany({ where: { sourceId, approvedAt: null, deletedAt: null }, data: { approvedAt: new Date() } });
      await appendMutationRecords(transaction, identity, [{
        entityType: "chatbot_source",
        entityId: sourceId,
        action: "approve",
        eventType: "chatbot.source_approved",
        payload: { chatbotId, title: source.title },
      }]);
      return this.getDetailInTransaction(transaction, chatbotId);
    });
  }

  async listConversations(identity: OwnerIdentity, input: Partial<ConversationListQuery> = {}) {
    await this.requireActiveOwner(identity);
    const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
    const where: Prisma.ChatbotConversationWhereInput = { deletedAt: null };
    if (input.chatbotId) where.chatbotId = input.chatbotId;
    if (input.clientId) where.clientId = input.clientId;
    const statuses = (input.statuses ?? []).map((status) => status.toUpperCase());
    if (statuses.length) where.status = { in: statuses as ConversationStatus[] };
    if (input.lowConfidenceOnly) where.isLowConfidence = true;
    const total = await this.database.chatbotConversation.count({ where });
    const rows = await this.database.chatbotConversation.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: limit + 1,
      include: {
        chatbot: { select: { name: true } },
        client: { select: { name: true } },
        _count: { select: { messages: true } },
      },
    });
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: visible.map((row) => ({
        id: row.id,
        chatbotId: row.chatbotId,
        chatbotName: row.chatbot.name,
        clientId: row.clientId,
        clientName: row.client.name,
        status: row.status,
        channel: row.channel,
        externalId: row.externalId,
        intent: row.intent,
        isLowConfidence: row.isLowConfidence,
        leadCaptured: row.leadCaptured,
        messageCount: row._count.messages,
        escalatedAt: row.escalatedAt,
        createdAt: row.createdAt,
      })),
      total,
      hasMore,
      nextCursor: hasMore && visible.at(-1) ? visible.at(-1)!.id : null,
    };
  }

  async getConversation(identity: OwnerIdentity, conversationId: string) {
    await this.requireActiveOwner(identity);
    const conversation = await this.database.chatbotConversation.findFirst({
      where: { id: conversationId, deletedAt: null },
      include: {
        chatbot: { select: { name: true } },
        client: { select: { name: true } },
        messages: { where: { deletedAt: null }, orderBy: { sequence: "asc" } },
      },
    });
    if (!conversation) throw new ChatbotOperationsError("NOT_FOUND", "Conversation not found.");
    return conversation;
  }

  /**
   * Grounded chat turn: answers only from approved Q&A above the configured
   * confidence threshold; below-threshold questions get the configured fallback
   * and mark the conversation for escalation instead of inventing certainty.
   */
  async chat(identity: OwnerIdentity, chatbotId: string, conversationId: string | null, input: ChatbotChatInput) {
    await this.requireActiveOwner(identity);
    const chatbot = await this.database.chatbot.findFirst({
      where: { id: chatbotId, deletedAt: null },
      include: { versions: { where: { deletedAt: null }, orderBy: { version: "desc" }, take: 1 } },
    });
    if (!chatbot) throw new ChatbotOperationsError("NOT_FOUND", "Chatbot not found.");
    if (chatbot.status !== ChatbotStatus.ACTIVE) {
      throw new ChatbotOperationsError("STATE_INVALID", "The chatbot must be active to accept messages. Deploy it first.");
    }
    const version = chatbot.versions[0];
    if (!version) throw new ChatbotOperationsError("STATE_INVALID", "The chatbot has no configuration version.");
    const threshold = Number(version.confidenceThreshold);

    let conversation = conversationId
      ? await this.database.chatbotConversation.findFirst({ where: { id: conversationId, chatbotId, deletedAt: null } })
      : null;
    if (conversationId && !conversation) throw new ChatbotOperationsError("NOT_FOUND", "Conversation not found.");
    if (!conversation) {
      conversation = await this.database.chatbotConversation.create({
        data: {
          id: randomUUID(),
          chatbotId,
          chatbotVersionId: version.id,
          clientId: chatbot.clientId,
          status: ConversationStatus.OPEN,
          channel: chatbot.platform,
          externalId: `sim-${randomUUID().slice(0, 12)}`,
        },
      });
    }
    const lastSequence = await this.database.chatbotMessage.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });

    const userMessage = await this.database.chatbotMessage.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: input.message,
        sequence: (lastSequence?.sequence ?? 0) + 1,
      },
    });

    const approvedQa = await this.database.chatbotQaPair.findMany({
      where: { chatbotId, approvedAt: { not: null }, deletedAt: null },
      select: { id: true, question: true, answer: true, evidence: true },
    });
    const grounded = groundAnswer(input.message, approvedQa);
    const confident = grounded.confidence >= threshold;
    const answer = confident ? grounded.answer : version.fallbackResponse;
    const startedAt = Date.now();
    const assistantMessage = await this.database.chatbotMessage.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: answer,
        sequence: userMessage.sequence + 1,
        confidence: grounded.confidence,
        intent: confident ? "faq" : "fallback",
        responseLatencyMs: Math.max(1, Date.now() - startedAt),
        citations: (grounded.citations.length ? grounded.citations : []) satisfies Prisma.InputJsonValue,
      },
    });
    const escalated = !confident;
    await this.database.chatbotConversation.update({
      where: { id: conversation.id },
      data: {
        intent: confident ? "faq" : "fallback",
        confidence: grounded.confidence,
        isLowConfidence: escalated,
        ...(escalated ? { status: ConversationStatus.ESCALATED, escalatedAt: new Date() } : {}),
      },
    });
    return {
      conversationId: conversation.id,
      message: assistantMessage,
      grounded: confident,
      escalated,
      citations: grounded.citations,
    };
  }

  async resolveConversation(identity: OwnerIdentity, conversationId: string) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const conversation = await transaction.chatbotConversation.findFirst({ where: { id: conversationId, deletedAt: null } });
      if (!conversation) throw new ChatbotOperationsError("NOT_FOUND", "Conversation not found.");
      await transaction.chatbotConversation.update({ where: { id: conversationId }, data: { status: ConversationStatus.RESOLVED, resolvedAt: new Date() } });
      await appendMutationRecords(transaction, identity, [{
        entityType: "chatbot_conversation",
        entityId: conversationId,
        action: "resolve",
        eventType: "chatbot.conversation_resolved",
        payload: { chatbotId: conversation.chatbotId },
      }]);
      return this.getConversationInTransaction(transaction, conversationId);
    });
  }

  private async requireActiveOwner(identity: OwnerIdentity): Promise<void> {
    const owner = await this.database.ownerAccount.findFirst({ where: { authSubject: identity.ownerSubject, active: true }, select: { id: true } });
    if (!owner) throw new ChatbotOperationsError("INVALID_IDENTITY", "The authenticated owner is not active.");
  }

  private async getDetailInTransaction(transaction: Transaction, chatbotId: string) {
    const chatbot = await transaction.chatbot.findFirst({
      where: { id: chatbotId, deletedAt: null },
      include: {
        client: { select: { name: true } },
        versions: { where: { deletedAt: null }, orderBy: { version: "desc" }, take: 10 },
        sources: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: { qaPairs: { where: { deletedAt: null }, select: { id: true, approvedAt: true } } },
        },
        conversations: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20, include: { _count: { select: { messages: true } } } },
      },
    });
    if (!chatbot) throw new ChatbotOperationsError("NOT_FOUND", "Chatbot not found.");
    return chatbot;
  }

  private async getConversationInTransaction(transaction: Transaction, conversationId: string) {
    const conversation = await transaction.chatbotConversation.findFirst({
      where: { id: conversationId, deletedAt: null },
      include: { messages: { where: { deletedAt: null }, orderBy: { sequence: "asc" } } },
    });
    if (!conversation) throw new ChatbotOperationsError("NOT_FOUND", "Conversation not found.");
    return conversation;
  }
}

function platformToDb(platform: string): ChatbotPlatform {
  if (platform === "website") return ChatbotPlatform.WEBSITE_WIDGET;
  if (platform === "instagram") return ChatbotPlatform.INSTAGRAM_DM;
  if (platform === "api") return ChatbotPlatform.CUSTOM_API;
  return ChatbotPlatform.WHATSAPP;
}

function sourceTypeToDb(type: string): ChatbotSourceType {
  if (type === "website_url") return ChatbotSourceType.URL;
  if (type === "product_document") return ChatbotSourceType.PRODUCT;
  return ChatbotSourceType.FAQ;
}

export function mapChatbotOperationsError(error: unknown): unknown {
  if (error instanceof ChatbotOperationsError) return error;
  if (error instanceof ClientOperationsError && error.code === "INVALID_IDENTITY") {
    return new ChatbotOperationsError("INVALID_IDENTITY", error.message);
  }
  return error;
}
