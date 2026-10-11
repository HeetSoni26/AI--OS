import "server-only";

import { createHash } from "node:crypto";
import {
  IntegrationProvider,
  IntegrationStatus,
  createClientOperationsService,
  getDatabaseClient,
  type GmailIngestionResult as DataGmailIngestionResult,
  type NormalizedGmailMessage as DataNormalizedGmailMessage,
  type OwnerIdentity,
  type PrismaClient,
} from "@aios/data";
import {
  GmailApiClient,
  GmailProviderError,
  createGmailContactMatcher,
  normalizeGmailMessage,
  refreshGmailAccessToken,
  type GmailApiMessageMetadata,
  type GmailHistoryReadResult,
  type NormalizedGmailMessage,
} from "@aios/integrations/gmail";
import { getGmailOAuthConfiguration } from "./configuration";
import { GMAIL_SYNC_INTERVAL_MS } from "./scheduling";
import { readVaultSecret } from "./vault";

export interface GmailHistoryIngestionInput {
  readonly integrationConnectionId: string;
  readonly checkpointType: string;
  readonly checkpointValue: string | null;
  readonly idempotencyKey: string;
  readonly signal?: AbortSignal;
}

export interface GmailHistoryIngestionResult {
  readonly checkpointValue: string;
  readonly nextRunAt?: Date;
}

interface GmailApiReader {
  readHistory(input: {
    readonly startHistoryId: string;
    readonly signal?: AbortSignal;
  }): Promise<GmailHistoryReadResult>;
  getMessageMetadata(
    providerMessageId: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<GmailApiMessageMetadata>;
}

export interface GmailHistoryIngestionDependencies {
  readonly database?: PrismaClient;
  readonly readRefreshCredential?: (vaultReference: string) => Promise<string>;
  readonly refreshAccessCredential?: (
    refreshCredential: string,
    signal?: AbortSignal,
  ) => Promise<string>;
  readonly createApiReader?: (accessCredential: string) => GmailApiReader;
  readonly ingestNormalizedMessage?: (
    identity: OwnerIdentity,
    message: DataNormalizedGmailMessage,
  ) => Promise<DataGmailIngestionResult>;
  readonly now?: () => Date;
}

export interface GmailHistoryIngestionSummary extends GmailHistoryIngestionResult {
  readonly discovered: number;
  readonly persisted: number;
  readonly duplicates: number;
  readonly noMatches: number;
}

function invalidInput(providerCode: string): GmailProviderError {
  return new GmailProviderError("Gmail ingestion input is invalid.", {
    kind: "validation",
    retryable: false,
    providerCode,
  });
}

function correlationId(idempotencyKey: string): string {
  return `gmail-sync:${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 48)}`;
}

function participantAddresses(
  message: NormalizedGmailMessage,
  field: "from" | "sender" | "to" | "cc" | "bcc",
): string[] {
  return message.participants[field].map((address) => address.normalized);
}

function dataMessage(
  connectionId: string,
  message: NormalizedGmailMessage,
): DataNormalizedGmailMessage {
  const from = participantAddresses(message, "sender")[0]
    ?? participantAddresses(message, "from")[0];
  if (from === undefined || message.internalDate === undefined) {
    throw invalidInput("incomplete_message_metadata");
  }
  const occurredAt = new Date(message.internalDate);
  if (Number.isNaN(occurredAt.getTime())) throw invalidInput("invalid_message_date");
  return {
    schemaVersion: 1,
    connectionId,
    providerMessageId: message.providerMessageId,
    providerThreadId: message.providerThreadId,
    occurredAt,
    from,
    to: participantAddresses(message, "to"),
    cc: participantAddresses(message, "cc"),
    bcc: participantAddresses(message, "bcc"),
    summary: message.subject ?? "Gmail message",
    body: null,
    metadata: {
      schemaVersion: 1,
      provider: "gmail",
      direction: message.direction,
      historyId: message.historyId ?? null,
      rfcMessageId: message.rfcMessageId ?? null,
      labelIds: [...message.labelIds],
      malformedHeaders: [...message.malformedHeaders],
      metadataOnly: true,
    },
  };
}

/**
 * Production Gmail history composition. Credentials stay in Vault, access tokens
 * stay in this call, and only normalized metadata reaches the data transaction.
 * The caller owns checkpoint persistence and must do it only after this resolves.
 */
export class GmailHistoryIngestionService {
  readonly #database: PrismaClient;
  readonly #readRefreshCredential: (vaultReference: string) => Promise<string>;
  readonly #refreshAccessCredential: (refreshCredential: string, signal?: AbortSignal) => Promise<string>;
  readonly #createApiReader: (accessCredential: string) => GmailApiReader;
  readonly #ingestNormalizedMessage: (
    identity: OwnerIdentity,
    message: DataNormalizedGmailMessage,
  ) => Promise<DataGmailIngestionResult>;
  readonly #now: () => Date;

  constructor(dependencies: GmailHistoryIngestionDependencies = {}) {
    this.#database = dependencies.database ?? getDatabaseClient();
    this.#readRefreshCredential = dependencies.readRefreshCredential ?? readVaultSecret;
    this.#refreshAccessCredential = dependencies.refreshAccessCredential ?? (async (refreshCredential, signal) => {
      const tokens = await refreshGmailAccessToken(getGmailOAuthConfiguration(), {
        refreshToken: refreshCredential,
        ...(signal === undefined ? {} : { signal }),
      });
      return tokens.accessToken;
    });
    this.#createApiReader = dependencies.createApiReader ?? ((accessCredential) =>
      new GmailApiClient({ accessToken: accessCredential }));
    const operations = createClientOperationsService(this.#database);
    this.#ingestNormalizedMessage = dependencies.ingestNormalizedMessage ??
      ((identity, message) => operations.communications.ingestNormalizedGmailMessage(identity, message));
    this.#now = dependencies.now ?? (() => new Date());
  }

  async ingest(input: GmailHistoryIngestionInput): Promise<GmailHistoryIngestionSummary> {
    if (input.checkpointType !== "gmail_history") throw invalidInput("unsupported_checkpoint_type");
    if (!input.checkpointValue || !/^\d+$/u.test(input.checkpointValue)) {
      throw invalidInput("missing_history_checkpoint");
    }
    const connection = await this.#database.integrationConnection.findUnique({
      where: { id: input.integrationConnectionId },
      select: {
        id: true,
        clientId: true,
        provider: true,
        status: true,
        externalAccountId: true,
        deletedAt: true,
        credentialReference: {
          select: { id: true, vaultReference: true, archivedAt: true, deletedAt: true },
        },
      },
    });
    if (!connection || connection.deletedAt || connection.provider !== IntegrationProvider.GMAIL) {
      throw invalidInput("invalid_connection");
    }
    if (connection.status === IntegrationStatus.REVOKED) {
      throw new GmailProviderError("Gmail authorization is no longer valid.", {
        kind: "revoked",
        retryable: false,
        providerCode: "connection_revoked",
      });
    }
    if (connection.status !== IntegrationStatus.CONNECTED) {
      throw invalidInput("connection_not_connected");
    }
    if (!connection.externalAccountId || !connection.credentialReference ||
        connection.credentialReference.archivedAt || connection.credentialReference.deletedAt) {
      throw invalidInput("missing_credential_reference");
    }

    const [owner, contacts] = await Promise.all([
      this.#database.ownerAccount.findFirst({
        where: { active: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, authSubject: true },
      }),
      this.#database.contact.findMany({
        where: {
          ...(connection.clientId === null ? {} : { clientId: connection.clientId }),
          normalizedEmail: { not: null },
          archivedAt: null,
          deletedAt: null,
          client: { archivedAt: null, deletedAt: null },
        },
        orderBy: [{ clientId: "asc" }, { id: "asc" }],
        select: { id: true, clientId: true, normalizedEmail: true, isPrimary: true },
      }),
    ]);
    if (!owner) throw invalidInput("active_owner_unavailable");
    const matcher = createGmailContactMatcher(contacts.map((contact) => ({
      clientId: contact.clientId,
      contactId: contact.id,
      emails: [contact.normalizedEmail!],
      isPrimary: contact.isPrimary,
    })));

    const refreshCredential = await this.#readRefreshCredential(connection.credentialReference.vaultReference);
    const accessCredential = await this.#refreshAccessCredential(refreshCredential, input.signal);
    const api = this.#createApiReader(accessCredential);
    const history = await api.readHistory({
      startHistoryId: input.checkpointValue,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    const identity: OwnerIdentity = {
      ownerSubject: owner.authSubject,
      ownerAccountId: owner.id,
      correlationId: correlationId(input.idempotencyKey),
      actorType: "worker",
    };

    let persisted = 0;
    let duplicates = 0;
    let noMatches = 0;
    for (const reference of history.addedMessages) {
      const metadata = await api.getMessageMetadata(
        reference.providerMessageId,
        input.signal === undefined ? {} : { signal: input.signal },
      );
      const normalized = normalizeGmailMessage(metadata, { email: connection.externalAccountId });
      if (matcher.match(normalized).clients.length === 0) {
        noMatches += 1;
        continue;
      }
      const result = await this.#ingestNormalizedMessage(identity, dataMessage(connection.id, normalized));
      if (result.status === "created") persisted += result.communications.length;
      else if (result.status === "duplicate") duplicates += result.communications.length;
      else noMatches += 1;
    }

    return {
      checkpointValue: history.checkpointValue,
      ...(input.idempotencyKey.includes(":scheduled:")
        ? { nextRunAt: new Date(this.#now().getTime() + GMAIL_SYNC_INTERVAL_MS) }
        : {}),
      discovered: history.addedMessages.length,
      persisted,
      duplicates,
      noMatches,
    };
  }
}

export function createGmailHistoryIngestionService(
  dependencies: GmailHistoryIngestionDependencies = {},
): GmailHistoryIngestionService {
  return new GmailHistoryIngestionService(dependencies);
}
