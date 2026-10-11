import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/client/client";
import {
  KnowledgeCategory,
  NotificationChannel,
  NotificationPriority,
  NotificationType,
  SopExecutionStatus,
} from "../generated/client/enums";
import { appendMutationRecords, requireActiveOwnerInTransaction } from "../clients/internal";
import { findSimilarKnowledge, serializeEmbedding } from "../vector";
import { LOCAL_EMBEDDING_MODEL, embedTextLocal } from "./local-embeddings";
import type { OwnerIdentity } from "../clients/types";
import {
  type KnowledgeCreateInput,
  type KnowledgeListQuery,
  type KnowledgeUpdateInput,
  type SopCreateInput,
  type SopExecutionInput,
} from "@aios/contracts";

export type { KnowledgeCreateInput, KnowledgeListQuery, KnowledgeUpdateInput, SopCreateInput, SopExecutionInput };

export type KnowledgeOperationsErrorCode =
  | "INVALID_IDENTITY" | "NOT_FOUND" | "INVALID_INPUT" | "CONFLICT";

export class KnowledgeOperationsError extends Error {
  constructor(public readonly code: KnowledgeOperationsErrorCode, message: string) {
    super(message);
    this.name = "KnowledgeOperationsError";
  }
}

type Database = PrismaClient;

/** Creates a durable, deduplicated in-app notification record. */
export async function recordNotification(
  transaction: Prisma.TransactionClient,
  input: {
    type: NotificationType;
    priority: NotificationPriority;
    title: string;
    body?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    dedupeKey?: string | null;
  },
): Promise<void> {
  if (input.dedupeKey) {
    const existing = await transaction.notification.findFirst({ where: { dedupeKey: input.dedupeKey, deletedAt: null } });
    if (existing) return;
  }
  await transaction.notification.create({
    data: {
      id: randomUUID(),
      type: input.type,
      priority: input.priority,
      title: input.title.slice(0, 500),
      body: input.body?.slice(0, 2_000) ?? null,
      entityType: input.entityType?.slice(0, 100) ?? null,
      entityId: input.entityId ?? null,
      channels: [NotificationChannel.IN_APP],
      ...(input.dedupeKey ? { dedupeKey: input.dedupeKey.slice(0, 255) } : {}),
    },
  });
}

export class PrismaKnowledgeService {
  constructor(private readonly database: Database) {}

  async listEntries(identity: OwnerIdentity, input: Partial<KnowledgeListQuery> = {}) {
    await this.requireActiveOwner(identity);
    const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
    if (input.searchMode === "semantic" && input.search?.trim()) {
      const embedding = embedTextLocal(input.search.trim());
      const clientId = input.clientId ?? null;
      const similar = await findSimilarKnowledge(this.database, embedding, { limit, clientId });
      const total = similar.length;
      return {
        items: await Promise.all(similar.map(async (match) => {
          const entry = await this.database.knowledgeEntry.findFirst({ where: { id: match.id, deletedAt: null } });
          return entry;
        })).then((entries) => entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))),
        total,
        hasMore: false,
        nextCursor: null,
      };
    }
    const where: Prisma.KnowledgeEntryWhereInput = { deletedAt: null };
    if (input.search) {
      where.OR = [
        { title: { contains: input.search, mode: "insensitive" } },
        { content: { contains: input.search, mode: "insensitive" } },
        { tags: { has: input.search } },
      ];
    }
    const categories = (input.categories ?? []).map((category) => category.toUpperCase());
    if (categories.length) where.category = { in: categories as KnowledgeCategory[] };
    if (input.clientId) where.clientId = input.clientId;
    const total = await this.database.knowledgeEntry.count({ where });
    const rows = await this.database.knowledgeEntry.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    return { items: visible, total, hasMore, nextCursor: hasMore && visible.at(-1) ? visible.at(-1)!.id : null };
  }

  async getEntry(identity: OwnerIdentity, entryId: string) {
    await this.requireActiveOwner(identity);
    const entry = await this.database.knowledgeEntry.findFirst({
      where: { id: entryId, deletedAt: null },
      include: { versions: { where: { deletedAt: null }, orderBy: { version: "desc" }, take: 20 } },
    });
    if (!entry) throw new KnowledgeOperationsError("NOT_FOUND", "Knowledge entry not found.");
    await this.database.knowledgeEntry.update({
      where: { id: entryId },
      data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
    });
    return entry;
  }

  async createEntry(identity: OwnerIdentity, input: KnowledgeCreateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const entry = await transaction.knowledgeEntry.create({
        data: {
          id: randomUUID(),
          clientId: input.clientId ?? null,
          title: input.title,
          category: input.category.toUpperCase() as KnowledgeCategory,
          content: input.content,
          tags: input.tags,
          version: 1,
        },
      });
      await transaction.knowledgeVersion.create({
        data: {
          knowledgeId: entry.id,
          version: 1,
          title: entry.title,
          category: entry.category,
          content: entry.content,
          tags: entry.tags,
          changeSummary: "Initial version",
          createdBy: identity.ownerSubject,
        },
      });
      await transaction.$executeRaw`
        UPDATE public.knowledge_entries
        SET embedding = ${serializeEmbedding(embedTextLocal(`${entry.title}
${entry.content}`))}::extensions.vector,
            embedding_model = ${LOCAL_EMBEDDING_MODEL}
        WHERE id = ${entry.id}::uuid
      `;
      await appendMutationRecords(transaction, identity, [{
        entityType: "knowledge",
        entityId: entry.id,
        action: "create",
        eventType: "knowledge.created",
        payload: { title: entry.title, category: entry.category },
        changedFields: ["title", "content"],
      }]);
      return entry;
    });
  }

  async updateEntry(identity: OwnerIdentity, entryId: string, input: KnowledgeUpdateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const entry = await transaction.knowledgeEntry.findFirst({ where: { id: entryId, deletedAt: null } });
      if (!entry) throw new KnowledgeOperationsError("NOT_FOUND", "Knowledge entry not found.");
      const contentChanged = (input.content !== undefined && input.content !== entry.content)
        || (input.title !== undefined && input.title !== entry.title);
      const updated = await transaction.knowledgeEntry.update({
        where: { id: entryId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.category !== undefined ? { category: input.category.toUpperCase() as KnowledgeCategory } : {}),
          ...(input.content !== undefined ? { content: input.content } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(contentChanged ? { version: entry.version + 1 } : {}),
        },
      });
      if (contentChanged) {
        await transaction.knowledgeVersion.create({
          data: {
            knowledgeId: entryId,
            version: updated.version,
            title: updated.title,
            category: updated.category,
            content: updated.content,
            tags: updated.tags,
            changeSummary: input.changeSummary ?? "Updated",
            createdBy: identity.ownerSubject,
          },
        });
      }
      if (contentChanged) {
        await transaction.$executeRaw`
          UPDATE public.knowledge_entries
          SET embedding = ${serializeEmbedding(embedTextLocal(`${updated.title}
${updated.content}`))}::extensions.vector,
              embedding_model = ${LOCAL_EMBEDDING_MODEL}
          WHERE id = ${entryId}::uuid
        `;
      }
      await appendMutationRecords(transaction, identity, [{
        entityType: "knowledge",
        entityId: entryId,
        action: "update",
        eventType: "knowledge.updated",
        payload: { title: updated.title, version: updated.version },
        changedFields: Object.keys(input),
      }]);
      return transaction.knowledgeEntry.findFirstOrThrow({
        where: { id: entryId },
        include: { versions: { where: { deletedAt: null }, orderBy: { version: "desc" }, take: 20 } },
      });
    });
  }

  async listSops(identity: OwnerIdentity) {
    await this.requireActiveOwner(identity);
    return this.database.sop.findMany({
      where: { deletedAt: null },
      orderBy: [{ updatedAt: "desc" }],
      take: 100,
      include: {
        steps: { where: { deletedAt: null }, orderBy: { position: "asc" } },
        executions: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
  }

  async createSop(identity: OwnerIdentity, input: SopCreateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const sop = await transaction.sop.create({
        data: {
          id: randomUUID(),
          clientId: input.clientId ?? null,
          title: input.title,
          materials: input.materials,
          expectedOutcome: input.expectedOutcome,
          currentVersion: 1,
        },
      });
      let position = 0;
      for (const step of input.steps) {
        await transaction.sopStep.create({
          data: {
            sopId: sop.id,
            sopVersion: 1,
            position: position += 1,
            title: step.title,
            instructions: step.instructions,
            expectedResult: step.expectedResult ?? null,
            isOptional: step.isOptional,
          },
        });
      }
      await appendMutationRecords(transaction, identity, [{
        entityType: "sop",
        entityId: sop.id,
        action: "create",
        eventType: "knowledge.sop_created",
        payload: { title: sop.title, steps: input.steps.length },
        changedFields: ["title"],
      }]);
      return transaction.sop.findFirstOrThrow({
        where: { id: sop.id },
        include: { steps: { where: { deletedAt: null }, orderBy: { position: "asc" } } },
      });
    });
  }

  async recordSopExecution(identity: OwnerIdentity, sopId: string, input: SopExecutionInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const sop = await transaction.sop.findFirst({ where: { id: sopId, deletedAt: null } });
      if (!sop) throw new KnowledgeOperationsError("NOT_FOUND", "SOP not found.");
      const execution = await transaction.sopExecution.create({
        data: {
          id: randomUUID(),
          sopId,
          sopVersion: sop.currentVersion,
          status: input.status === "completed" ? SopExecutionStatus.SUCCESS : SopExecutionStatus.FAILED,
          stepResults: input.stepResults as unknown as Prisma.InputJsonValue,
          startedAt: new Date(Date.now() - 1_000),
          completedAt: new Date(),
          errorMessage: input.errorMessage ?? null,
        },
      });
      await transaction.sop.update({
        where: { id: sopId },
        data: { usageCount: { increment: 1 }, lastExecutedAt: new Date(), lastTestedAt: new Date() },
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "sop_execution",
        entityId: execution.id,
        action: "execute",
        eventType: "knowledge.sop_executed",
        payload: { sopId, status: input.status },
      }]);
      return execution;
    });
  }

  // ── Notifications ────────────────────────────────────────────────────────

  async listNotifications(identity: OwnerIdentity, unreadOnly = false) {
    await this.requireActiveOwner(identity);
    const [items, unreadCount] = await Promise.all([
      this.database.notification.findMany({
        where: { deletedAt: null, ...(unreadOnly ? { read: false } : {}) },
        orderBy: [{ createdAt: "desc" }],
        take: 50,
      }),
      this.database.notification.count({ where: { deletedAt: null, read: false } }),
    ]);
    return { items, unreadCount };
  }

  async markNotificationRead(identity: OwnerIdentity, notificationId: string) {
    await this.requireActiveOwner(identity);
    const notification = await this.database.notification.findFirst({ where: { id: notificationId, deletedAt: null } });
    if (!notification) throw new KnowledgeOperationsError("NOT_FOUND", "Notification not found.");
    await this.database.notification.update({ where: { id: notificationId }, data: { read: true, readAt: new Date() } });
    return this.listNotifications(identity);
  }

  async markAllNotificationsRead(identity: OwnerIdentity) {
    await this.requireActiveOwner(identity);
    await this.database.notification.updateMany({
      where: { deletedAt: null, read: false },
      data: { read: true, readAt: new Date() },
    });
    return this.listNotifications(identity);
  }

  private async requireActiveOwner(identity: OwnerIdentity): Promise<void> {
    const owner = await this.database.ownerAccount.findFirst({ where: { authSubject: identity.ownerSubject, active: true }, select: { id: true } });
    if (!owner) throw new KnowledgeOperationsError("INVALID_IDENTITY", "The authenticated owner is not active.");
  }
}

export { NotificationType, NotificationPriority };
