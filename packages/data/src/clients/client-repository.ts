import type { Prisma, PrismaClient } from "../generated/client/client";
import { DeletionStatus, FilePurpose, MalwareScanStatus } from "../generated/client/enums";
import { ClientOperationsError } from "./errors";
import {
  appendMutationRecords,
  clientEventPayload,
  contactEventPayload,
  decodeCursor,
  encodeCursor,
  lockClient,
  normalizeEmail,
  requireActiveOwner,
  requireActiveOwnerInTransaction,
  requireNonBlank,
  sanitizeAuditValue,
  upsertClientGraphProjection,
  upsertContactGraphProjection,
  type DurableMutationRecord,
} from "./internal";
import type {
  AuditSummary,
  ClientDeletionImpact,
  ClientDeletionImpactItem,
  ClientDeletionPlan,
  ClientListCursor,
  ClientListItem,
  CreateClientInput,
  CreateContactInput,
  FileMetadataInput,
  ListClientsInput,
  ListClientsResult,
  OwnerIdentity,
  ScheduleClientDeletionInput,
  UpdateClientInput,
  UpdateContactInput,
} from "./types";

const CLIENT_LIST_LIMIT = 50;
const MAX_CLIENT_LIST_LIMIT = 100;
const DELETION_DELAY_MS = 7 * 24 * 60 * 60 * 1_000;

function uniqueDefined<T>(values: readonly (T | null | undefined)[]): T[] {
  return [...new Set(values.filter((value): value is T => value != null))];
}

function clientSortValue(client: { name: string; mrr: { toString(): string }; startDate: Date | null; status: string }, sort: ClientListCursor["sort"]): string | null {
  if (sort === "name") return client.name;
  if (sort === "mrr") return client.mrr.toString();
  if (sort === "startDate") return client.startDate?.toISOString() ?? null;
  return client.status;
}

function validateClientCursor(cursor: ClientListCursor, sort: ClientListCursor["sort"], order: ClientListCursor["order"]): void {
  if (cursor.version !== 1 || cursor.sort !== sort || cursor.order !== order || !cursor.id || !("value" in cursor)) {
    throw new ClientOperationsError("INVALID_INPUT", "The cursor does not match the requested client sort.");
  }
}

function mapClientListItem(row: Awaited<ReturnType<PrismaClient["client"]["findMany"]>>[number] & { _count: { contacts: number; projects: number } }): ClientListItem {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    status: row.status,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    website: row.website,
    logoFileId: row.logoFileId,
    mrr: row.mrr,
    totalRevenue: row.totalRevenue,
    startDate: row.startDate,
    archivedAt: row.archivedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    contactCount: row._count.contacts,
    projectCount: row._count.projects,
  };
}

export type ClientDeletionImpactCounter = (
  transaction: Prisma.TransactionClient,
  clientId: string,
) => Promise<ClientDeletionImpactItem>;

export interface ClientRepositoryOptions {
  deletionImpactCounters?: readonly ClientDeletionImpactCounter[];
}

function defaultDeletionImpactCounters(): ClientDeletionImpactCounter[] {
  return [
    async (tx, clientId) => ({ resourceType: "contacts", count: await tx.contact.count({ where: { clientId, deletedAt: null } }), deletionMode: "cascade" }),
    async (tx, clientId) => ({ resourceType: "projects", count: await tx.project.count({ where: { clientId, deletedAt: null } }), deletionMode: "cascade" }),
    async (tx, clientId) => ({ resourceType: "communications", count: await tx.communication.count({ where: { clientId, deletedAt: null } }), deletionMode: "cascade" }),
    async (tx, clientId) => ({ resourceType: "invoices", count: await tx.invoice.count({ where: { clientId, deletedAt: null } }), deletionMode: "retain" }),
    async (tx, clientId) => ({ resourceType: "files", count: await tx.fileMetadata.count({ where: { clientId, deletedAt: null } }), deletionMode: "cascade" }),
  ];
}

export class PrismaClientRepository {
  private readonly impactCounters: readonly ClientDeletionImpactCounter[];

  constructor(private readonly database: PrismaClient, options: ClientRepositoryOptions = {}) {
    this.impactCounters = options.deletionImpactCounters ?? defaultDeletionImpactCounters();
  }

  async listClients(identity: OwnerIdentity, input: ListClientsInput = {}): Promise<ListClientsResult> {
    await requireActiveOwner(this.database, identity);
    const sort = input.sort ?? "name";
    const order = input.order ?? "asc";
    const limit = Math.max(1, Math.min(input.limit ?? CLIENT_LIST_LIMIT, MAX_CLIENT_LIST_LIMIT));
    const cursor = input.cursor ? decodeCursor<ClientListCursor>(input.cursor) : null;
    if (cursor) validateClientCursor(cursor, sort, order);

    const where: Prisma.ClientWhereInput = {};
    const lifecycle = input.lifecycle ?? "active";
    let lifecycleIds: string[] | null = null;
    if (lifecycle === "active") Object.assign(where, { archivedAt: null, deletedAt: null });
    if (lifecycle === "archived") Object.assign(where, { archivedAt: { not: null }, deletedAt: null });
    if (lifecycle === "deletion_scheduled") {
      const requests = await this.database.deletionRequest.findMany({
        where: { entityType: "client", status: { in: [DeletionStatus.PENDING, DeletionStatus.EXECUTING] } },
        select: { entityId: true },
      });
      lifecycleIds = requests.map((request) => request.entityId);
    }
    if (lifecycle === "deleted") where.deletedAt = { not: null };
    const statuses = Array.isArray(input.status) ? [...input.status] : input.status ? [input.status] : [];
    if (statuses.length) where.status = { in: statuses };
    const industry = input.industry?.trim();
    if (industry) where.industry = { equals: industry, mode: "insensitive" };
    const q = input.q?.trim();
    if (q) {
      const fuzzyMatches = await this.database.$queryRaw<Array<{ id: string }>>`
        SELECT DISTINCT c.id
        FROM public.clients c
        LEFT JOIN public.contacts contact
          ON contact.client_id = c.id AND contact.deleted_at IS NULL
        WHERE lower(c.name) OPERATOR(extensions.%) lower(${q})
          OR extensions.similarity(lower(c.name), lower(${q})) >= 0.2
          OR c.name ILIKE ('%' || ${q} || '%')
          OR c.industry ILIKE ('%' || ${q} || '%')
          OR c.notes ILIKE ('%' || ${q} || '%')
          OR c.contact_name ILIKE ('%' || ${q} || '%')
          OR c.contact_email ILIKE ('%' || ${q} || '%')
          OR lower(contact.name) % lower(${q})
          OR extensions.similarity(lower(contact.name), lower(${q})) >= 0.2
          OR contact.name ILIKE ('%' || ${q} || '%')
          OR contact.normalized_email ILIKE ('%' || lower(${q}) || '%')
      `;
      const fuzzyIds = fuzzyMatches.map((match) => match.id);
      lifecycleIds = lifecycleIds ? lifecycleIds.filter((id) => fuzzyIds.includes(id)) : fuzzyIds;
    }
    if (lifecycleIds) where.id = { in: lifecycleIds };
    const total = await this.database.client.count({ where });

    const rows = await this.database.client.findMany({
      where,
      orderBy: [{ [sort]: order }, { id: order }] as Prisma.ClientOrderByWithRelationInput[],
      cursor: cursor ? { id: cursor.id } : undefined,
      skip: cursor ? 1 : 0,
      take: limit + 1,
      include: {
        _count: {
          select: {
            contacts: { where: { deletedAt: null, archivedAt: null } },
            projects: { where: { deletedAt: null, archivedAt: null } },
          },
        },
      },
    });
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible.at(-1);
    return {
      items: visible.map((row) => mapClientListItem(row)),
      hasMore,
      nextCursor: hasMore && last ? encodeCursor({ version: 1, sort, order, value: clientSortValue(last, sort), id: last.id } satisfies ClientListCursor) : null,
      total,
    };
  }

  async getClientDetail(identity: OwnerIdentity, clientId: string) {
    await requireActiveOwner(this.database, identity);
    const client = await this.database.client.findUnique({
      where: { id: clientId },
      include: {
        contacts: {
          where: { deletedAt: null },
          orderBy: [{ isPrimary: "desc" }, { name: "asc" }, { id: "asc" }],
        },
        projects: {
          where: { deletedAt: null },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          include: {
            _count: { select: { tasks: { where: { deletedAt: null } }, deliverables: { where: { deletedAt: null } }, assignments: { where: { deletedAt: null } } } },
            statusHistory: { orderBy: [{ changedAt: "desc" }, { id: "desc" }], take: 20 },
          },
        },
        invoices: { where: { deletedAt: null }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 },
        communications: {
          where: { deletedAt: null },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          take: 50,
          include: { participants: { include: { contact: true } } },
        },
        _count: { select: { contacts: true, projects: true, invoices: true, communications: true } },
      },
    });
    if (!client) throw new ClientOperationsError("NOT_FOUND", "Client not found.");
    const entityIds = uniqueDefined([
      client.id,
      ...client.contacts.map((contact) => contact.id),
      ...client.projects.map((project) => project.id),
      ...client.communications.map((communication) => communication.id),
    ]);
    const audits = await this.database.auditEvent.findMany({
      where: { entityId: { in: entityIds }, entityType: { in: ["client", "contact", "project", "communication"] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: { id: true, action: true, entityType: true, entityId: true, actorType: true, correlationId: true, changeSummary: true, createdAt: true },
    });
    const auditSummaries: AuditSummary[] = audits.map((audit) => ({ ...audit, changeSummary: sanitizeAuditValue(audit.changeSummary) }));
    return { ...client, auditSummaries };
  }

  async createClient(identity: OwnerIdentity, input: CreateClientInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const name = requireNonBlank(input.name, "Client name");
      const contactEmail = normalizeEmail(input.contactEmail);
      if (input.logoFileId) await this.requireAttachableLogo(transaction, input.logoFileId);
      let client = await transaction.client.create({
        data: {
          id: input.id,
          name,
          industry: input.industry,
          status: input.status,
          contactName: input.contactName?.trim() || null,
          contactEmail,
          contactPhone: input.contactPhone,
          website: input.website,
          notes: input.notes,
          logoFileId: input.logoFileId,
          logoUrl: input.logoFileId ? `/api/v1/clients/${input.id ?? "pending"}/logo` : undefined,
          mrr: input.mrr,
          totalRevenue: input.totalRevenue,
          startDate: input.startDate,
        },
      });
      if (input.logoFileId) {
        client = await transaction.client.update({ where: { id: client.id }, data: { logoUrl: `/api/v1/clients/${client.id}/logo` } });
        await transaction.fileMetadata.update({
          where: { id: input.logoFileId },
          data: { clientId: client.id, ownerEntityType: "client", ownerEntityId: client.id },
        });
      }
      await upsertClientGraphProjection(transaction, client);
      const records: DurableMutationRecord[] = [{
        entityType: "client",
        entityId: client.id,
        action: "create",
        eventType: "client.created",
        payload: clientEventPayload(client),
        changedFields: Object.keys(input),
      }];
      if (input.contactName?.trim()) {
        const contact = await transaction.contact.create({
          data: {
            clientId: client.id,
            name: input.contactName.trim(),
            email: contactEmail,
            phone: input.contactPhone,
            isPrimary: true,
          },
        });
        await upsertContactGraphProjection(transaction, contact);
        records.push({
          entityType: "contact",
          entityId: contact.id,
          action: "create",
          eventType: "contact.created",
          payload: contactEventPayload(contact),
          changedFields: ["name", "email", "phone", "isPrimary"],
        });
      }
      await appendMutationRecords(transaction, identity, records);
      return client;
    }, { isolationLevel: "Serializable" });
  }

  async updateClient(identity: OwnerIdentity, clientId: string, input: UpdateClientInput) {
    if (!Object.keys(input).length) throw new ClientOperationsError("INVALID_INPUT", "At least one client field is required.");
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      await lockClient(transaction, clientId);
      const current = await transaction.client.findUnique({ where: { id: clientId } });
      if (!current || current.deletedAt) throw new ClientOperationsError("NOT_FOUND", "Active client not found.");
      if (input.logoFileId) await this.requireAttachableLogo(transaction, input.logoFileId, clientId);
      const data: Prisma.ClientUpdateInput = {
        ...input,
        name: input.name === undefined ? undefined : requireNonBlank(input.name, "Client name"),
        contactEmail: input.contactEmail === undefined ? undefined : normalizeEmail(input.contactEmail),
        logoUrl: input.logoFileId === undefined ? undefined : input.logoFileId ? `/api/v1/clients/${clientId}/logo` : null,
      };
      const client = await transaction.client.update({ where: { id: clientId }, data });
      if (input.logoFileId) {
        await transaction.fileMetadata.update({
          where: { id: input.logoFileId },
          data: { clientId, ownerEntityType: "client", ownerEntityId: clientId },
        });
      }
      await upsertClientGraphProjection(transaction, client);
      await appendMutationRecords(transaction, identity, [{
        entityType: "client",
        entityId: client.id,
        action: "update",
        eventType: "client.updated",
        payload: clientEventPayload(client),
        changedFields: Object.keys(input),
      }]);
      return client;
    });
  }

  async archiveClient(identity: OwnerIdentity, clientId: string, reason?: string) {
    return this.setClientArchive(identity, clientId, true, reason);
  }

  async recoverClient(identity: OwnerIdentity, clientId: string, reason?: string) {
    return this.setClientArchive(identity, clientId, false, reason);
  }

  private async setClientArchive(identity: OwnerIdentity, clientId: string, archived: boolean, reason?: string) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      await lockClient(transaction, clientId);
      const current = await transaction.client.findUnique({ where: { id: clientId } });
      if (!current || current.deletedAt) throw new ClientOperationsError("NOT_FOUND", "Client not found or pending deletion.");
      const archivedAt = archived ? current.archivedAt ?? new Date() : null;
      const client = await transaction.client.update({ where: { id: clientId }, data: { archivedAt } });
      await upsertClientGraphProjection(transaction, client);
      await appendMutationRecords(transaction, identity, [{
        entityType: "client",
        entityId: client.id,
        action: archived ? "archive" : "recover",
        eventType: archived ? "client.archived" : "client.recovered",
        payload: clientEventPayload(client),
        changedFields: ["archivedAt"],
        auditExtra: reason ? { reasonCode: "owner_supplied" } : {},
      }]);
      return client;
    });
  }

  async createContact(identity: OwnerIdentity, clientId: string, input: CreateContactInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      await lockClient(transaction, clientId);
      const client = await transaction.client.findUnique({ where: { id: clientId } });
      if (!client || client.deletedAt) throw new ClientOperationsError("NOT_FOUND", "Active client not found.");
      const priorPrimary = input.isPrimary ? await transaction.contact.findFirst({
        where: { clientId, isPrimary: true, archivedAt: null, deletedAt: null },
      }) : null;
      if (priorPrimary) await transaction.contact.update({
        where: { id: priorPrimary.id },
        data: { isPrimary: false },
      });
      const contact = await transaction.contact.create({
        data: {
          id: input.id,
          clientId,
          name: requireNonBlank(input.name, "Contact name"),
          role: input.role,
          email: normalizeEmail(input.email),
          normalizedEmail: normalizeEmail(input.email),
          phone: input.phone,
          notes: input.notes,
          isPrimary: input.isPrimary,
          lastContactAt: input.lastContactAt,
        },
      });
      if (contact.isPrimary) await this.syncClientPrimarySummary(transaction, clientId, contact);
      await upsertContactGraphProjection(transaction, contact);
      const records: DurableMutationRecord[] = [{
        entityType: "contact",
        entityId: contact.id,
        action: "create",
        eventType: "contact.created",
        payload: contactEventPayload(contact),
        changedFields: Object.keys(input),
      }];
      if (priorPrimary) records.push({
        entityType: "contact",
        entityId: priorPrimary.id,
        action: "update",
        eventType: "contact.updated",
        payload: contactEventPayload({ ...priorPrimary, isPrimary: false }),
        changedFields: ["isPrimary"],
      });
      await appendMutationRecords(transaction, identity, records);
      return contact;
    });
  }

  async updateContact(identity: OwnerIdentity, contactId: string, input: UpdateContactInput) {
    if (!Object.keys(input).length) throw new ClientOperationsError("INVALID_INPUT", "At least one contact field is required.");
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const existing = await transaction.contact.findUnique({ where: { id: contactId } });
      if (!existing || existing.deletedAt) throw new ClientOperationsError("NOT_FOUND", "Contact not found.");
      await lockClient(transaction, existing.clientId);
      const priorPrimary = input.isPrimary ? await transaction.contact.findFirst({
        where: { clientId: existing.clientId, id: { not: contactId }, isPrimary: true, archivedAt: null, deletedAt: null },
      }) : null;
      if (priorPrimary) await transaction.contact.update({ where: { id: priorPrimary.id }, data: { isPrimary: false } });
      const normalizedEmail = input.email === undefined ? undefined : normalizeEmail(input.email);
      const contact = await transaction.contact.update({
        where: { id: contactId },
        data: {
          ...input,
          name: input.name === undefined ? undefined : requireNonBlank(input.name, "Contact name"),
          email: normalizedEmail,
          normalizedEmail,
        },
      });
      if (contact.isPrimary) await this.syncClientPrimarySummary(transaction, contact.clientId, contact);
      else if (existing.isPrimary) await this.syncClientPrimarySummary(transaction, contact.clientId, null);
      await upsertContactGraphProjection(transaction, contact);
      const records: DurableMutationRecord[] = [{
        entityType: "contact",
        entityId: contact.id,
        action: "update",
        eventType: "contact.updated",
        payload: contactEventPayload(contact),
        changedFields: Object.keys(input),
      }];
      if (priorPrimary) records.push({
        entityType: "contact",
        entityId: priorPrimary.id,
        action: "update",
        eventType: "contact.updated",
        payload: contactEventPayload({ ...priorPrimary, isPrimary: false }),
        changedFields: ["isPrimary"],
      });
      await appendMutationRecords(transaction, identity, records);
      return contact;
    });
  }

  async promotePrimaryContact(identity: OwnerIdentity, contactId: string) {
    return this.updateContact(identity, contactId, { isPrimary: true });
  }

  async deleteContact(identity: OwnerIdentity, contactId: string) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const existing = await transaction.contact.findUnique({ where: { id: contactId } });
      if (!existing || existing.deletedAt) throw new ClientOperationsError("NOT_FOUND", "Contact not found.");
      await lockClient(transaction, existing.clientId);
      const now = new Date();
      const contact = await transaction.contact.update({
        where: { id: contactId },
        data: { isPrimary: false, archivedAt: existing.archivedAt ?? now, deletedAt: now },
      });
      if (existing.isPrimary) await this.syncClientPrimarySummary(transaction, contact.clientId, null);
      await upsertContactGraphProjection(transaction, contact);
      await appendMutationRecords(transaction, identity, [{
        entityType: "contact",
        entityId: contact.id,
        action: "delete",
        eventType: "contact.deleted",
        payload: contactEventPayload(contact),
        changedFields: ["isPrimary", "archivedAt", "deletedAt"],
      }]);
      return contact;
    }, { isolationLevel: "Serializable" });
  }

  async createFileMetadata(identity: OwnerIdentity, clientId: string, input: FileMetadataInput) {
    await requireActiveOwner(this.database, identity);
    const client = await this.database.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true } });
    if (!client) throw new ClientOperationsError("NOT_FOUND", "Active client not found.");
    return this.database.fileMetadata.create({
      data: {
        ...input,
        clientId,
        ownerEntityType: input.ownerEntityType ?? "client",
        ownerEntityId: input.ownerEntityId ?? clientId,
      },
    });
  }

  async attachClientLogo(identity: OwnerIdentity, clientId: string, fileId: string) {
    return this.updateClient(identity, clientId, { logoFileId: fileId });
  }

  async getDeletionImpact(identity: OwnerIdentity, clientId: string): Promise<ClientDeletionImpact> {
    await requireActiveOwner(this.database, identity);
    return this.database.$transaction(async (transaction) => {
      const client = await transaction.client.findUnique({ where: { id: clientId }, select: { id: true } });
      if (!client) throw new ClientOperationsError("NOT_FOUND", "Client not found.");
      return this.calculateDeletionImpact(transaction, clientId);
    });
  }

  async scheduleClientDeletion(identity: OwnerIdentity, clientId: string, input: ScheduleClientDeletionInput): Promise<ClientDeletionPlan> {
    if (input.confirmation !== `DELETE ${clientId}` || !input.impactAcknowledged) {
      throw new ClientOperationsError("INVALID_INPUT", "Deletion confirmation and impact acknowledgement are required.");
    }
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      await lockClient(transaction, clientId);
      const client = await transaction.client.findUnique({ where: { id: clientId } });
      if (!client) throw new ClientOperationsError("NOT_FOUND", "Client not found.");
      const existing = await transaction.deletionRequest.findFirst({
        where: { entityType: "client", entityId: clientId, status: { in: [DeletionStatus.PENDING, DeletionStatus.EXECUTING] } },
      });
      if (existing) throw new ClientOperationsError("CONFLICT", "A deletion is already scheduled for this client.");
      const now = input.now ?? new Date();
      const executeAfter = new Date(now.getTime() + DELETION_DELAY_MS);
      const impact = await this.calculateDeletionImpact(transaction, clientId);
      if (impact.legalHold || impact.blockers.length) throw new ClientOperationsError("DELETION_BLOCKED", "Client deletion is blocked.", { impact });
      const manifest: Prisma.InputJsonObject = {
        clientId: impact.clientId,
        items: impact.items.map((item) => ({ ...item })),
        legalHold: impact.legalHold,
        blockers: impact.blockers,
        wasArchivedAt: client.archivedAt?.toISOString() ?? null,
      };
      const request = await transaction.deletionRequest.create({
        data: {
          entityType: "client",
          entityId: clientId,
          status: DeletionStatus.PENDING,
          requestedBy: identity.ownerSubject,
          requestedAt: now,
          executeAfter,
          recoveryUntil: executeAfter,
          confirmedAt: now,
          impactManifest: manifest,
          impactRegistryVersion: 1,
        },
      });
      const updated = await transaction.client.update({
        where: { id: clientId },
        data: { archivedAt: client.archivedAt ?? now, deletedAt: now },
      });
      await upsertClientGraphProjection(transaction, updated);
      await appendMutationRecords(transaction, identity, [{
        entityType: "client",
        entityId: clientId,
        action: "schedule_deletion",
        eventType: "client.deletion_scheduled",
        payload: { ...clientEventPayload(updated), deletionPlanId: request.id, executeAfter: executeAfter.toISOString() },
        changedFields: ["archivedAt", "deletedAt"],
        auditExtra: { deletionPlanId: request.id, impactRegistryVersion: 1 },
      }]);
      return {
        id: request.id,
        clientId,
        status: request.status,
        requestedAt: request.requestedAt,
        executeAfter: request.executeAfter,
        recoveryUntil: request.recoveryUntil,
        impact,
        version: request.impactRegistryVersion,
      };
    }, { isolationLevel: "Serializable" });
  }

  async cancelClientDeletion(identity: OwnerIdentity, clientId: string, deletionPlanId: string, reason?: string, now = new Date()) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      await lockClient(transaction, clientId);
      const request = await transaction.deletionRequest.findFirst({
        where: { id: deletionPlanId, entityType: "client", entityId: clientId, status: DeletionStatus.PENDING },
      });
      if (!request) throw new ClientOperationsError("NOT_FOUND", "Pending client deletion was not found.");
      if (now >= request.recoveryUntil || now >= request.executeAfter) {
        throw new ClientOperationsError("CONFLICT", "The client deletion recovery window has expired.", {
          recoveryUntil: request.recoveryUntil.toISOString(),
        });
      }
      const manifest = request.impactManifest as Record<string, unknown>;
      const wasArchivedAt = typeof manifest.wasArchivedAt === "string" ? new Date(manifest.wasArchivedAt) : null;
      await transaction.deletionRequest.update({
        where: { id: request.id },
        data: { status: DeletionStatus.CANCELLED, cancelledAt: now },
      });
      const client = await transaction.client.update({
        where: { id: clientId },
        data: { deletedAt: null, archivedAt: wasArchivedAt },
      });
      await upsertClientGraphProjection(transaction, client);
      await appendMutationRecords(transaction, identity, [{
        entityType: "client",
        entityId: clientId,
        action: "cancel_deletion",
        eventType: "client.deletion_cancelled",
        payload: { ...clientEventPayload(client), deletionPlanId: request.id },
        changedFields: ["deletedAt", "archivedAt"],
        auditExtra: { deletionPlanId: request.id, reasonProvided: Boolean(reason) },
      }]);
      return client;
    }, { isolationLevel: "Serializable" });
  }

  private async calculateDeletionImpact(transaction: Prisma.TransactionClient, clientId: string): Promise<ClientDeletionImpact> {
    const items = await Promise.all(this.impactCounters.map((counter) => counter(transaction, clientId)));
    return { clientId, items, legalHold: false, blockers: [] };
  }

  private async syncClientPrimarySummary(
    transaction: Prisma.TransactionClient,
    clientId: string,
    contact: { name: string; email: string | null; phone: string | null } | null,
  ): Promise<void> {
    await transaction.client.update({
      where: { id: clientId },
      data: {
        contactName: contact?.name ?? null,
        contactEmail: contact?.email ?? null,
        contactPhone: contact?.phone ?? null,
      },
    });
  }

  private async requireAttachableLogo(transaction: Prisma.TransactionClient, fileId: string, clientId?: string): Promise<void> {
    const file = await transaction.fileMetadata.findUnique({ where: { id: fileId } });
    if (!file || file.deletedAt || file.archivedAt || file.purpose !== FilePurpose.LOGO) {
      throw new ClientOperationsError("INVALID_INPUT", "Logo metadata must reference a live logo file.");
    }
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.contentType.toLowerCase()) || file.sizeBytes > BigInt(10 * 1_024 * 1_024)) {
      throw new ClientOperationsError("INVALID_INPUT", "Logo metadata must describe a supported image no larger than 10 MiB.");
    }
    if (file.malwareScanStatus !== MalwareScanStatus.CLEAN && file.malwareScanStatus !== MalwareScanStatus.SKIPPED) {
      throw new ClientOperationsError("INVALID_INPUT", "Logo metadata must have a clean scan or the approved strict-image exemption before attachment.");
    }
    if (file.clientId && file.clientId !== clientId) {
      throw new ClientOperationsError("CONFLICT", "The logo file belongs to another client.");
    }
  }
}
