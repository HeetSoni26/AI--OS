import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/client/client";
import { ContentScope, ContentStatus, ContentType, IntegrationProvider, PublishStatus } from "../generated/client/enums";
import { appendMutationRecords, requireActiveOwnerInTransaction } from "../clients/internal";
import type { OwnerIdentity } from "../clients/types";
import {
  brandProfileUpsertSchema,
  canTransitionContentStatus,
  calendarEntryCreateSchema,
  contentArtifactCreateSchema,
  contentArtifactUpdateSchema,
  contentListQuerySchema,
  contentStatusUpdateSchema,
  type BrandProfileUpsertInput,
  type CalendarEntryCreateInput,
  type ContentArtifactCreateInput,
  type ContentArtifactUpdateInput,
  type ContentListQuery,
  type ContentStatusUpdateInput,
} from "@aios/contracts";

export type {
  BrandProfileUpsertInput,
  CalendarEntryCreateInput,
  ContentArtifactCreateInput,
  ContentArtifactUpdateInput,
  ContentListQuery,
  ContentStatusUpdateInput,
};

export type ContentOperationsErrorCode =
  | "INVALID_IDENTITY" | "NOT_FOUND" | "INVALID_INPUT" | "CONFLICT" | "STATE_INVALID";

export class ContentOperationsError extends Error {
  constructor(public readonly code: ContentOperationsErrorCode, message: string) {
    super(message);
    this.name = "ContentOperationsError";
  }
}

const CONTENT_LIST_LIMIT = 100;

type Database = PrismaClient;
type Transaction = Prisma.TransactionClient;

export class PrismaContentService {
  constructor(private readonly database: Database) {}

  async listBrandProfiles(identity: OwnerIdentity, scope?: string, clientId?: string) {
    await this.requireActiveOwner(identity);
    return this.database.brandProfile.findMany({
      where: {
        deletedAt: null,
        ...(scope ? { scope: scope.toUpperCase() as ContentScope } : {}),
        ...(clientId ? { clientId } : {}),
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 100,
    });
  }

  async upsertBrandProfile(identity: OwnerIdentity, input: BrandProfileUpsertInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const existing = input.clientId
        ? await transaction.brandProfile.findFirst({ where: { clientId: input.clientId, deletedAt: null }, orderBy: { version: "desc" } })
        : await transaction.brandProfile.findFirst({ where: { scope: ContentScope.AGENCY, deletedAt: null }, orderBy: { version: "desc" } });
      const data = {
        clientId: input.clientId ?? null,
        scope: (input.clientId ? ContentScope.CLIENT : ContentScope.AGENCY) as ContentScope,
        name: input.name,
        tone: input.tone,
        vocabulary: input.vocabulary,
        targetAudience: input.targetAudience,
        keyMessages: input.keyMessages,
        prohibitedClaims: input.prohibitedClaims,
        examples: input.examples,
        version: (existing?.version ?? 0) + 1,
      };
      const profile = existing
        ? await transaction.brandProfile.update({ where: { id: existing.id }, data })
        : await transaction.brandProfile.create({ data: { id: randomUUID(), ...data } });
      await appendMutationRecords(transaction, identity, [{
        entityType: "brand_profile",
        entityId: profile.id,
        action: existing ? "update" : "create",
        eventType: existing ? "content.brand_updated" : "content.brand_created",
        payload: { name: profile.name, scope: profile.scope, version: profile.version },
        changedFields: Object.keys(input),
      }]);
      return profile;
    });
  }

  async listArtifacts(identity: OwnerIdentity, input: Partial<ContentListQuery> = {}) {
    await this.requireActiveOwner(identity);
    const limit = Math.max(1, Math.min(input.limit ?? 50, CONTENT_LIST_LIMIT));
    const where: Prisma.ContentArtifactWhereInput = { deletedAt: null };
    if (input.scope) where.scope = input.scope.toUpperCase() as ContentScope;
    if (input.clientId) where.clientId = input.clientId;
    const types = (input.types ?? []).map((type) => type.toUpperCase());
    if (types.length) where.type = { in: types as ContentType[] };
    const statuses = (input.statuses ?? []).map((status) => status.toUpperCase());
    if (statuses.length) where.status = { in: statuses as ContentStatus[] };
    if (input.search) where.title = { contains: input.search, mode: "insensitive" };
    const total = await this.database.contentArtifact.count({ where });
    const rows = await this.database.contentArtifact.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: limit + 1,
      include: {
        client: { select: { name: true } },
        versions: { where: { deletedAt: null }, orderBy: { version: "desc" }, take: 1 },
      },
    });
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: visible,
      total,
      hasMore,
      nextCursor: hasMore && visible.at(-1) ? visible.at(-1)!.id : null,
    };
  }

  async getArtifactDetail(identity: OwnerIdentity, artifactId: string) {
    await this.requireActiveOwner(identity);
    const artifact = await this.database.contentArtifact.findFirst({
      where: { id: artifactId, deletedAt: null },
      include: {
        client: { select: { name: true } },
        versions: { where: { deletedAt: null }, orderBy: { version: "desc" }, take: 20 },
        calendarEntries: { where: { deletedAt: null }, orderBy: { scheduledFor: "asc" } },
        derivedArtifacts: { where: { deletedAt: null }, select: { id: true, title: true, type: true } },
      },
    });
    if (!artifact) throw new ContentOperationsError("NOT_FOUND", "Artifact not found.");
    return artifact;
  }

  async createArtifact(identity: OwnerIdentity, input: ContentArtifactCreateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      if (input.clientId) {
        const client = await transaction.client.findFirst({ where: { id: input.clientId, deletedAt: null }, select: { id: true } });
        if (!client) throw new ContentOperationsError("INVALID_INPUT", "The content client does not exist.");
      }
      const artifact = await transaction.contentArtifact.create({
        data: {
          id: randomUUID(),
          clientId: input.clientId ?? null,
          scope: input.scope.toUpperCase() as ContentScope,
          type: contentTypeToDb(input.type),
          status: ContentStatus.DRAFT,
          title: input.title,
          brief: input.brief ?? null,
          body: input.body,
          claimsToVerify: input.claimsToVerify,
          parentArtifactId: input.parentArtifactId ?? null,
          currentVersion: 1,
        },
      });
      await transaction.contentArtifactVersion.create({
        data: {
          artifactId: artifact.id,
          version: 1,
          status: ContentStatus.DRAFT,
          title: input.title,
          body: input.body,
        },
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "content_artifact",
        entityId: artifact.id,
        action: "create",
        eventType: "content.artifact_created",
        payload: { title: artifact.title, scope: artifact.scope, type: artifact.type },
        changedFields: ["title", "body"],
      }]);
      return artifact;
    });
  }

  async updateArtifact(identity: OwnerIdentity, artifactId: string, input: ContentArtifactUpdateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const artifact = await transaction.contentArtifact.findFirst({ where: { id: artifactId, deletedAt: null } });
      if (!artifact) throw new ContentOperationsError("NOT_FOUND", "Artifact not found.");
      const title = input.title?.trim() || artifact.title;
      const body = input.body !== undefined ? input.body.trim() : artifact.body;
      const contentChanged = title !== artifact.title || body !== artifact.body;
      const updated = await transaction.contentArtifact.update({
        where: { id: artifactId },
        data: {
          title,
          body,
          brief: input.brief === undefined ? artifact.brief : input.brief,
          claimsToVerify: input.claimsToVerify ?? artifact.claimsToVerify,
          // Editing invalidates prior approval (SRS authority rule).
          ...(contentChanged && artifact.status !== ContentStatus.DRAFT ? { status: ContentStatus.DRAFT } : {}),
        },
      });
      if (contentChanged) {
        await transaction.contentArtifactVersion.create({
          data: {
            artifactId,
            version: artifact.currentVersion + 1,
            status: updated.status,
            title,
            body,
          },
        });
        await transaction.contentArtifact.update({ where: { id: artifactId }, data: { currentVersion: artifact.currentVersion + 1 } });
      }
      await appendMutationRecords(transaction, identity, [{
        entityType: "content_artifact",
        entityId: artifactId,
        action: "update",
        eventType: "content.artifact_updated",
        payload: { title, version: artifact.currentVersion + (contentChanged ? 1 : 0) },
        changedFields: Object.keys(input),
      }]);
      return updated;
    });
  }

  async updateArtifactStatus(identity: OwnerIdentity, artifactId: string, input: ContentStatusUpdateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const artifact = await transaction.contentArtifact.findFirst({ where: { id: artifactId, deletedAt: null } });
      if (!artifact) throw new ContentOperationsError("NOT_FOUND", "Artifact not found.");
      const from = artifact.status.toLowerCase();
      if (!canTransitionContentStatus(from, input.status)) {
        throw new ContentOperationsError("STATE_INVALID", `A ${from.replace("_", " ")} artifact cannot move to ${input.status.replace("_", " ")}.`);
      }
      const updated = await transaction.contentArtifact.update({
        where: { id: artifactId },
        data: { status: input.status.toUpperCase() as ContentStatus },
      });
      if (input.status === "published") {
        // Local publish recording: without a live channel adapter, the owner
        // publishes manually and the event is recorded with source provenance.
        const entry = await transaction.contentCalendarEntry.findFirst({
          where: { artifactId, deletedAt: null, status: { not: ContentStatus.PUBLISHED } },
          orderBy: { scheduledFor: "asc" },
        });
        if (entry) {
          await transaction.contentCalendarEntry.update({ where: { id: entry.id }, data: { status: ContentStatus.PUBLISHED } });
          await transaction.contentPublishEvent.create({
            data: {
              id: randomUUID(),
              calendarEntryId: entry.id,
              artifactId,
              status: PublishStatus.PUBLISHED,
              idempotencyKey: `local_publish:${entry.id}`,
              publishedAt: new Date(),
            },
          });
        }
      }
      await appendMutationRecords(transaction, identity, [{
        entityType: "content_artifact",
        entityId: artifactId,
        action: "status",
        eventType: "content.status_changed",
        payload: { title: artifact.title, from, to: input.status },
      }]);
      return updated;
    });
  }

  async addCalendarEntry(identity: OwnerIdentity, artifactId: string, input: CalendarEntryCreateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const artifact = await transaction.contentArtifact.findFirst({ where: { id: artifactId, deletedAt: null } });
      if (!artifact) throw new ContentOperationsError("NOT_FOUND", "Artifact not found.");
      if (artifact.status.toLowerCase() !== "approved") {
        throw new ContentOperationsError("STATE_INVALID", "Only approved artifacts can be scheduled.");
      }
      const entry = await transaction.contentCalendarEntry.create({
        data: {
          id: randomUUID(),
          artifactId,
          artifactVersionId: (await transaction.contentArtifactVersion.findFirstOrThrow({
            where: { artifactId, version: artifact.currentVersion },
            select: { id: true },
          })).id,
          clientId: artifact.clientId,
          scope: artifact.scope,
          platform: platformToProvider(input.platform),
          status: ContentStatus.SCHEDULED,
          scheduledFor: new Date(input.publishAt),
          timezone: "UTC",
        },
      });
      await transaction.contentArtifact.update({ where: { id: artifactId }, data: { status: ContentStatus.SCHEDULED } });
      await appendMutationRecords(transaction, identity, [{
        entityType: "content_calendar_entry",
        entityId: entry.id,
        action: "schedule",
        eventType: "content.scheduled",
        payload: { artifactId, publishAt: input.publishAt, platform: input.platform },
      }]);
      return entry;
    });
  }

  async listCalendar(identity: OwnerIdentity, scope?: string, clientId?: string) {
    await this.requireActiveOwner(identity);
    return this.database.contentCalendarEntry.findMany({
      where: {
        deletedAt: null,
        ...(scope ? { scope: scope.toUpperCase() as ContentScope } : {}),
        ...(clientId ? { clientId } : {}),
      },
      orderBy: { scheduledFor: "asc" },
      take: 200,
      include: { artifact: { select: { title: true, type: true } } },
    });
  }

  private async requireActiveOwner(identity: OwnerIdentity): Promise<void> {
    const owner = await this.database.ownerAccount.findFirst({ where: { authSubject: identity.ownerSubject, active: true }, select: { id: true } });
    if (!owner) throw new ContentOperationsError("INVALID_IDENTITY", "The authenticated owner is not active.");
  }
}

function contentTypeToDb(type: string): ContentType {
  return type.toUpperCase() as ContentType;
}

function platformToProvider(platform: string): IntegrationProvider {
  const normalized = platform.toLowerCase();
  if (normalized === "x" || normalized === "twitter") return IntegrationProvider.X;
  if (normalized === "newsletter" || normalized === "email") return IntegrationProvider.MAILCHIMP;
  if (normalized === "blog" || normalized === "website") return IntegrationProvider.WORDPRESS;
  if (normalized === "instagram") return IntegrationProvider.INSTAGRAM;
  return IntegrationProvider.LINKEDIN;
}

export { brandProfileUpsertSchema, calendarEntryCreateSchema, contentArtifactCreateSchema, contentArtifactUpdateSchema, contentListQuerySchema, contentStatusUpdateSchema };
