import type { Prisma, PrismaClient } from "../generated/client/client";
import { CommunicationDirection, CommunicationType, IntegrationProvider, IntegrationStatus } from "../generated/client/enums";
import { ClientOperationsError } from "./errors";
import {
  appendMutationRecords,
  communicationEventPayload,
  contactEventPayload,
  decodeCursor,
  encodeCursor,
  normalizeEmail,
  requireActiveOwner,
  requireActiveOwnerInTransaction,
  requireNonBlank,
} from "./internal";
import type {
  CreateCommunicationInput,
  GmailIngestionResult,
  ListCommunicationsInput,
  NormalizedGmailMessage,
  OwnerIdentity,
} from "./types";

interface CommunicationCursor {
  version: 1;
  occurredAt: string;
  id: string;
  order: "chronological" | "reverse_chronological";
}

function participantIds(input: CreateCommunicationInput): string[] {
  return [...new Set([...(input.contactIds ?? []), ...(input.contactId ? [input.contactId] : [])])];
}

export class PrismaClientCommunicationRepository {
  constructor(private readonly database: PrismaClient) {}

  async listCommunications(identity: OwnerIdentity, clientId: string, input: ListCommunicationsInput = {}) {
    await requireActiveOwner(this.database, identity);
    const client = await this.database.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new ClientOperationsError("NOT_FOUND", "Client not found.");
    const order = input.order ?? "reverse_chronological";
    const direction = order === "chronological" ? "asc" : "desc";
    const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
    const cursor = input.cursor ? decodeCursor<CommunicationCursor>(input.cursor) : null;
    if (cursor && (cursor.version !== 1 || cursor.order !== order || !cursor.id || !Number.isFinite(Date.parse(cursor.occurredAt)))) {
      throw new ClientOperationsError("INVALID_INPUT", "The communication cursor is invalid.");
    }
    const rows = await this.database.communication.findMany({
      where: { clientId, deletedAt: null, type: input.type, direction: input.direction },
      orderBy: [{ occurredAt: direction }, { id: direction }],
      cursor: cursor ? { id: cursor.id } : undefined,
      skip: cursor ? 1 : 0,
      take: limit + 1,
      include: { participants: { include: { contact: true } }, contact: true },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.at(-1);
    return {
      items,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor({ version: 1, occurredAt: last.occurredAt.toISOString(), id: last.id, order } satisfies CommunicationCursor) : null,
    };
  }

  async createCommunication(identity: OwnerIdentity, clientId: string, input: CreateCommunicationInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const client = await transaction.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true } });
      if (!client) throw new ClientOperationsError("NOT_FOUND", "Active client not found.");
      const contacts = await this.requireParticipants(transaction, clientId, participantIds(input));
      if (input.integrationConnectionId) {
        await this.requireConnection(transaction, input.integrationConnectionId, clientId);
        if (input.providerMessageId) await transaction.$queryRaw`SELECT id FROM public.integration_connections WHERE id = ${input.integrationConnectionId}::uuid FOR UPDATE`;
      }
      if (input.integrationConnectionId && input.providerMessageId) {
        const duplicate = await transaction.communication.findFirst({
          where: {
            clientId,
            integrationConnectionId: input.integrationConnectionId,
            providerMessageId: input.providerMessageId,
            deletedAt: null,
          },
          include: { participants: true },
        });
        if (duplicate) return duplicate;
      }
      const primaryContactId = input.contactId ?? contacts[0]?.id ?? null;
      const communication = await transaction.communication.create({
        data: {
          id: input.id,
          clientId,
          contactId: primaryContactId,
          type: input.type,
          direction: input.direction,
          occurredAt: input.occurredAt,
          summary: requireNonBlank(input.summary, "Communication summary"),
          body: input.body,
          nextAction: input.nextAction,
          source: input.source,
          providerMessageId: input.providerMessageId,
          providerThreadId: input.providerThreadId,
          integrationConnectionId: input.integrationConnectionId,
          ingestedAt: input.ingestedAt,
          metadata: input.metadata,
          participants: contacts.length ? { create: contacts.map((contact) => ({ contactId: contact.id })) } : undefined,
        },
        include: { participants: { include: { contact: true } } },
      });
      const advancedContacts = await this.advanceLastContact(transaction, contacts.map((contact) => contact.id), input.occurredAt);
      await appendMutationRecords(transaction, identity, [{
        entityType: "communication",
        entityId: communication.id,
        action: "create",
        eventType: "communication.created",
        payload: communicationEventPayload(communication),
        changedFields: Object.keys(input),
        auditExtra: { participantCount: contacts.length },
      }, ...advancedContacts.map((contact) => ({
        entityType: "contact",
        entityId: contact.id,
        action: "update",
        eventType: "contact.updated",
        payload: contactEventPayload(contact),
        changedFields: ["lastContactAt"],
      }))]);
      return communication;
    }, { isolationLevel: "Serializable" });
  }

  /**
   * Persists a provider-normalized message. Gmail transport/OAuth remains outside
   * this repository; callers provide only normalized content and a connection ID.
   */
  async ingestNormalizedGmailMessage(identity: OwnerIdentity, message: NormalizedGmailMessage): Promise<GmailIngestionResult> {
    if (message.schemaVersion !== 1 || !message.providerMessageId.trim()) {
      throw new ClientOperationsError("INVALID_INPUT", "A versioned Gmail provider message ID is required.");
    }
    const addresses = [...new Set([
      normalizeEmail(message.from),
      ...message.to.map(normalizeEmail),
      ...(message.cc ?? []).map(normalizeEmail),
      ...(message.bcc ?? []).map(normalizeEmail),
    ].filter((address): address is string => address !== null))];
    if (!addresses.length) throw new ClientOperationsError("INVALID_INPUT", "The normalized message contains no valid addresses.");

    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const connection = await transaction.integrationConnection.findUnique({ where: { id: message.connectionId } });
      if (!connection || connection.provider !== IntegrationProvider.GMAIL || connection.status !== IntegrationStatus.CONNECTED || connection.deletedAt) {
        throw new ClientOperationsError("INVALID_INPUT", "A live connected Gmail repository connection is required.");
      }
      await transaction.$queryRaw`SELECT id FROM public.integration_connections WHERE id = ${message.connectionId}::uuid FOR UPDATE`;
      const matches = await transaction.contact.findMany({
        where: {
          normalizedEmail: { in: addresses },
          archivedAt: null,
          deletedAt: null,
          client: { archivedAt: null, deletedAt: null },
        },
        orderBy: [{ clientId: "asc" }, { id: "asc" }],
      });
      const scopedMatches = connection.clientId ? matches.filter((contact) => contact.clientId === connection.clientId) : matches;
      if (!scopedMatches.length) return { status: "no_match" } as const;

      const byClient = new Map<string, typeof scopedMatches>();
      for (const contact of scopedMatches) byClient.set(contact.clientId, [...(byClient.get(contact.clientId) ?? []), contact]);
      const existing = await transaction.communication.findMany({
        where: {
          clientId: { in: [...byClient.keys()] },
          integrationConnectionId: message.connectionId,
          providerMessageId: message.providerMessageId,
          deletedAt: null,
        },
        select: { id: true, clientId: true },
      });
      const existingByClient = new Map(existing.map((communication) => [communication.clientId, communication]));
      const created: Array<{ communicationId: string; clientId: string; contactIds: string[] }> = [];
      const records: Parameters<typeof appendMutationRecords>[2] extends readonly (infer T)[] ? T[] : never = [];
      const sender = normalizeEmail(message.from);

      for (const [clientId, contacts] of byClient) {
        if (existingByClient.has(clientId)) continue;
        const contactIds = contacts.map((contact) => contact.id);
        const direction = contacts.some((contact) => contact.normalizedEmail === sender)
          ? CommunicationDirection.INBOUND
          : CommunicationDirection.OUTBOUND;
        const communication = await transaction.communication.create({
          data: {
            clientId,
            contactId: contactIds[0] ?? null,
            integrationConnectionId: message.connectionId,
            type: CommunicationType.EMAIL,
            direction,
            occurredAt: message.occurredAt,
            summary: requireNonBlank(message.summary, "Communication summary"),
            body: message.body,
            nextAction: message.nextAction,
            source: "gmail",
            providerMessageId: message.providerMessageId,
            providerThreadId: message.providerThreadId,
            ingestedAt: new Date(),
            metadata: message.metadata,
            participants: { create: contactIds.map((contactId) => ({ contactId })) },
          },
        });
        const advancedContacts = await this.advanceLastContact(transaction, contactIds, message.occurredAt);
        created.push({ communicationId: communication.id, clientId, contactIds });
        records.push({
          entityType: "communication",
          entityId: communication.id,
          action: "ingest",
          eventType: "communication.created",
          payload: communicationEventPayload(communication),
          changedFields: ["occurredAt", "source", "providerMessageId", "providerThreadId", "participants"],
          auditExtra: { participantCount: contactIds.length, provider: "gmail" },
        }, ...advancedContacts.map((contact) => ({
          entityType: "contact",
          entityId: contact.id,
          action: "update",
          eventType: "contact.updated",
          payload: contactEventPayload(contact),
          changedFields: ["lastContactAt"],
        })));
      }
      await appendMutationRecords(transaction, identity, records);
      if (created.length) return { status: "created", communications: created } as const;
      return {
        status: "duplicate",
        communications: existing.map((communication) => ({ communicationId: communication.id, clientId: communication.clientId })),
      } as const;
    }, { isolationLevel: "Serializable" });
  }

  private async requireParticipants(transaction: Prisma.TransactionClient, clientId: string, ids: readonly string[]) {
    if (!ids.length) return [];
    const contacts = await transaction.contact.findMany({ where: { id: { in: [...ids] }, clientId, archivedAt: null, deletedAt: null } });
    if (contacts.length !== ids.length) throw new ClientOperationsError("INVALID_INPUT", "Every communication participant must be a live contact owned by the client.");
    return contacts;
  }

  private async requireConnection(transaction: Prisma.TransactionClient, connectionId: string, clientId: string) {
    const connection = await transaction.integrationConnection.findUnique({ where: { id: connectionId } });
    if (!connection || connection.deletedAt || (connection.clientId && connection.clientId !== clientId)) {
      throw new ClientOperationsError("INVALID_INPUT", "Integration connection does not own this client message.");
    }
    return connection;
  }

  private async advanceLastContact(transaction: Prisma.TransactionClient, contactIds: readonly string[], occurredAt: Date) {
    if (!contactIds.length) return [];
    return transaction.contact.updateManyAndReturn({
      where: {
        id: { in: [...contactIds] },
        OR: [{ lastContactAt: null }, { lastContactAt: { lt: occurredAt } }],
      },
      data: { lastContactAt: occurredAt },
    });
  }
}
