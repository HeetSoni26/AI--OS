import { createHash } from "node:crypto";

import {
  classifyGmailFailure,
  GmailProviderError,
  normalizeGmailHistoryPage,
  normalizeGmailMessage,
  parseGmailOAuthConfiguration,
  refreshGmailAccessToken,
  type GmailOAuthConfiguration,
  type NormalizedGmailMessage as ProviderNormalizedGmailMessage,
} from "@aios/integrations/gmail";
import {
  createClientOperationsService,
  Prisma,
  type OwnerIdentity,
  type PrismaClient,
} from "@aios/data";

import type {
  GmailIngestionInput,
  GmailIngestionResult,
  GmailIngestionService,
} from "./contracts";
import type { JobsLogger } from "../outbox/publisher";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const METADATA_HEADERS = [
  "From",
  "Sender",
  "Reply-To",
  "To",
  "Cc",
  "Bcc",
  "Subject",
  "Message-ID",
];

interface GmailConnectionRow {
  readonly id: string;
  readonly externalAccountId: string | null;
  readonly safeMetadata: unknown;
  readonly status: string;
  readonly credentialReference: { readonly vaultReference: string } | null;
}

interface GmailProfileResponse {
  readonly emailAddress?: unknown;
  readonly historyId?: unknown;
}

interface GmailMessageListResponse {
  readonly messages?: unknown;
  readonly nextPageToken?: unknown;
}

export interface GmailRuntimeConfiguration {
  readonly oauth: GmailOAuthConfiguration;
  readonly pollIntervalMs: number;
  readonly requestTimeoutMs: number;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

function aliasesFromMetadata(value: unknown): string[] {
  if (!value || typeof value !== "object" || !("aliases" in value)) return [];
  const aliases = (value as { readonly aliases?: unknown }).aliases;
  return Array.isArray(aliases)
    ? aliases.filter((alias): alias is string => typeof alias === "string")
    : [];
}

function safeProviderReason(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const error = (value as { readonly error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const errors = (error as { readonly errors?: unknown }).errors;
  if (!Array.isArray(errors) || !errors[0] || typeof errors[0] !== "object") return undefined;
  const reason = (errors[0] as { readonly reason?: unknown }).reason;
  return typeof reason === "string" ? reason : undefined;
}

function retryAfterMilliseconds(response: Response, now: Date): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now.getTime());
}

function gmailCorrelationId(connectionId: string, messageId: string): string {
  return `gmail:${createHash("sha256").update(`${connectionId}:${messageId}`).digest("hex").slice(0, 40)}`;
}

function allAddresses(message: ProviderNormalizedGmailMessage): string[] {
  return [
    ...message.participants.from,
    ...message.participants.sender,
    ...message.participants.to,
    ...message.participants.cc,
    ...message.participants.bcc,
  ].map((address) => address.normalized);
}

function firstSender(message: ProviderNormalizedGmailMessage): string | undefined {
  return (message.participants.sender[0] ?? message.participants.from[0])?.normalized;
}

export function parseGmailRuntimeConfiguration(
  environment: NodeJS.ProcessEnv,
): GmailRuntimeConfiguration | null {
  const clientId = environment.GOOGLE_GMAIL_CLIENT_ID?.trim();
  const clientSecret = environment.GOOGLE_GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const pollIntervalMs = Number(environment.AIOS_GMAIL_POLL_INTERVAL_MS ?? 300_000);
  const requestTimeoutMs = Number(environment.AIOS_GMAIL_REQUEST_TIMEOUT_MS ?? 10_000);
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 60_000) {
    throw new Error("AIOS_GMAIL_POLL_INTERVAL_MS must be an integer of at least 60000.");
  }
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1_000 || requestTimeoutMs > 120_000) {
    throw new Error("AIOS_GMAIL_REQUEST_TIMEOUT_MS must be between 1000 and 120000.");
  }
  return {
    oauth: parseGmailOAuthConfiguration({
      clientId,
      clientSecret,
      redirectUri: environment.GOOGLE_GMAIL_REDIRECT_URI ?? "http://localhost/unused-jobs-callback",
      stateSigningSecret: environment.GMAIL_OAUTH_STATE_SECRET ?? "jobs-runtime-unused-state-secret-00000000",
      requestTimeoutMs,
    }),
    pollIntervalMs,
    requestTimeoutMs,
  };
}

/** Incremental Gmail metadata ingestion backed by the existing normalization/data adapters. */
export class ConfiguredGmailIngestionService implements GmailIngestionService {
  private readonly operations;
  private readonly fetchImplementation: typeof fetch;
  private readonly now: () => Date;

  constructor(
    private readonly database: PrismaClient,
    private readonly configuration: GmailRuntimeConfiguration,
    private readonly logger: JobsLogger,
  ) {
    this.operations = createClientOperationsService(database);
    this.fetchImplementation = configuration.fetch ?? globalThis.fetch;
    this.now = configuration.now ?? (() => new Date());
  }

  async ingest(input: GmailIngestionInput): Promise<GmailIngestionResult> {
    if (input.checkpointType !== "gmail_history") {
      throw new GmailProviderError("Gmail checkpoint type is unsupported.", {
        kind: "validation",
        retryable: false,
        providerCode: "invalid_checkpoint_type",
      });
    }
    const connection = await this.database.integrationConnection.findUnique({
      where: { id: input.integrationConnectionId },
      select: {
        id: true,
        externalAccountId: true,
        safeMetadata: true,
        status: true,
        credentialReference: { select: { vaultReference: true } },
      },
    }) as GmailConnectionRow | null;
    if (!connection || !["CONNECTED", "DEGRADED"].includes(connection.status)) {
      throw new GmailProviderError("Gmail connection is not active.", {
        kind: "revoked",
        retryable: false,
        providerCode: "connection_not_active",
      });
    }
    if (!connection.credentialReference) {
      throw new GmailProviderError("Gmail refresh credential is not configured for this connection.", {
        kind: "authentication",
        retryable: false,
        providerCode: "refresh_credential_not_configured",
      });
    }
    const credentialRows = await this.database.$queryRaw<Array<{ decrypted_secret: string }>>(Prisma.sql`
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE id = ${connection.credentialReference.vaultReference}::uuid
    `);
    const refreshToken = credentialRows[0]?.decrypted_secret;
    if (!refreshToken) {
      throw new GmailProviderError("Gmail refresh credential is unavailable in Vault.", {
        kind: "authentication",
        retryable: false,
        providerCode: "refresh_credential_unavailable",
      });
    }
    const tokens = await refreshGmailAccessToken(this.configuration.oauth, {
      refreshToken,
      fetch: this.fetchImplementation,
      signal: input.signal,
      now: this.now(),
      timeoutMs: this.configuration.requestTimeoutMs,
    });
    const profile = await this.request<GmailProfileResponse>("/profile", tokens.accessToken, input.signal);
    const accountEmail = connection.externalAccountId
      ?? (typeof profile.emailAddress === "string" ? profile.emailAddress : null);
    if (!accountEmail) {
      throw new GmailProviderError("Gmail account email is not available.", {
        kind: "validation",
        retryable: false,
        providerCode: "missing_account_email",
      });
    }

    let messageIds: string[];
    let checkpointValue: string;
    if (input.checkpointValue === null) {
      if (typeof profile.historyId !== "string" || !/^\d+$/u.test(profile.historyId)) {
        throw new GmailProviderError("Gmail profile did not provide a history checkpoint.", {
          kind: "transient",
          retryable: true,
          providerCode: "missing_history_id",
        });
      }
      checkpointValue = profile.historyId;
      messageIds = await this.listAllMessageIds(tokens.accessToken, input.signal);
    } else {
      const history = await this.listHistory(
        input.checkpointValue,
        tokens.accessToken,
        input.signal,
      );
      checkpointValue = history.checkpointValue;
      messageIds = history.messageIds;
    }

    const owner = await this.database.ownerAccount.findFirst({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, authSubject: true },
    });
    if (!owner) throw new Error("Gmail ingestion requires an active owner account.");

    let handled = 0;
    for (const messageId of messageIds) {
      if (input.signal?.aborted) throw input.signal.reason ?? new Error("Gmail ingestion was stopped.");
      const rawMessage = await this.request<unknown>(
        `/messages/${encodeURIComponent(messageId)}?${new URLSearchParams([
          ["format", "metadata"],
          ...METADATA_HEADERS.map((header) => ["metadataHeaders", header]),
        ]).toString()}`,
        tokens.accessToken,
        input.signal,
      );
      const normalized = normalizeGmailMessage(rawMessage, {
        email: accountEmail,
        aliases: aliasesFromMetadata(connection.safeMetadata),
      });
      const sender = firstSender(normalized);
      const addresses = allAddresses(normalized);
      if (!sender || addresses.length === 0) {
        this.logger({
          component: "gmail",
          message: "Gmail message metadata had no usable sender; message was not persisted.",
          connectionId: connection.id,
          providerMessageId: normalized.providerMessageId,
          claimedIngestion: false,
        });
        continue;
      }
      const identity: OwnerIdentity = {
        ownerSubject: owner.authSubject,
        ownerAccountId: owner.id,
        correlationId: gmailCorrelationId(connection.id, normalized.providerMessageId),
        actorType: "worker",
      };
      await this.operations.communications.ingestNormalizedGmailMessage(identity, {
        schemaVersion: 1,
        connectionId: connection.id,
        providerMessageId: normalized.providerMessageId,
        providerThreadId: normalized.providerThreadId,
        occurredAt: normalized.internalDate ? new Date(normalized.internalDate) : this.now(),
        from: sender,
        to: normalized.participants.to.map((address) => address.normalized),
        cc: normalized.participants.cc.map((address) => address.normalized),
        bcc: normalized.participants.bcc.map((address) => address.normalized),
        summary: normalized.subject ?? "(no subject)",
        metadata: {
          schemaVersion: 1,
          provider: "gmail",
          direction: normalized.direction,
          labelIds: [...normalized.labelIds],
          historyId: normalized.historyId ?? null,
          rfcMessageId: normalized.rfcMessageId ?? null,
          malformedHeaders: [...normalized.malformedHeaders],
          contentIngested: false,
        },
      });
      handled += 1;
    }
    this.logger({
      component: "gmail",
      message: "Gmail metadata ingestion completed.",
      connectionId: connection.id,
      discoveredMessages: messageIds.length,
      handledMessages: handled,
      bodyContentIngested: false,
    });
    return {
      checkpointValue,
      nextRunAt: new Date(this.now().getTime() + this.configuration.pollIntervalMs),
    };
  }

  private async listAllMessageIds(accessToken: string, signal?: AbortSignal): Promise<string[]> {
    const messageIds = new Set<string>();
    let pageToken: string | undefined;
    do {
      const parameters = new URLSearchParams({ maxResults: "500" });
      if (pageToken) parameters.set("pageToken", pageToken);
      const page = await this.request<GmailMessageListResponse>(
        `/messages?${parameters.toString()}`,
        accessToken,
        signal,
      );
      if (Array.isArray(page.messages)) {
        for (const candidate of page.messages) {
          if (candidate && typeof candidate === "object" && "id" in candidate) {
            const id = (candidate as { readonly id?: unknown }).id;
            if (typeof id === "string" && id) messageIds.add(id);
          }
        }
      }
      pageToken = typeof page.nextPageToken === "string" ? page.nextPageToken : undefined;
    } while (pageToken);
    return [...messageIds].sort();
  }

  private async listHistory(
    startHistoryId: string,
    accessToken: string,
    signal?: AbortSignal,
  ): Promise<{ readonly messageIds: string[]; readonly checkpointValue: string }> {
    const messageIds = new Set<string>();
    let pageToken: string | undefined;
    let checkpointValue: string | undefined;
    do {
      const parameters = new URLSearchParams({
        startHistoryId,
        maxResults: "500",
        historyTypes: "messageAdded",
      });
      if (pageToken) parameters.set("pageToken", pageToken);
      const rawPage = await this.request<unknown>(
        `/history?${parameters.toString()}`,
        accessToken,
        signal,
      );
      const page = normalizeGmailHistoryPage(rawPage, {
        startHistoryId,
        maxResults: 500,
        ...(pageToken === undefined ? {} : { pageToken }),
      });
      for (const change of page.changes) {
        for (const message of change.added) messageIds.add(message.providerMessageId);
      }
      pageToken = page.nextPageToken;
      checkpointValue = page.checkpointCandidate ?? checkpointValue;
    } while (pageToken);
    if (!checkpointValue) {
      throw new GmailProviderError("Gmail history did not produce a final checkpoint.", {
        kind: "transient",
        retryable: true,
        providerCode: "incomplete_history_page",
      });
    }
    return { messageIds: [...messageIds].sort(), checkpointValue };
  }

  private async request<T>(path: string, accessToken: string, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.configuration.requestTimeoutMs);
    const abort = (): void => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      const response = await this.fetchImplementation(`${GMAIL_API_BASE}${path}`, {
        headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          body = undefined;
        }
        const failure = classifyGmailFailure({
          status: response.status,
          reason: safeProviderReason(body),
          retryAfterMs: retryAfterMilliseconds(response, this.now()),
        });
        throw new GmailProviderError(failure.message, failure);
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof GmailProviderError) throw error;
      if (timedOut) {
        throw new GmailProviderError("Gmail request timed out.", {
          kind: "timeout",
          retryable: true,
          providerCode: "request_timeout",
        });
      }
      if (signal?.aborted) {
        throw new GmailProviderError("Gmail request was cancelled.", {
          kind: "cancelled",
          retryable: false,
          providerCode: "request_cancelled",
        });
      }
      throw new GmailProviderError("Gmail network request failed.", {
        kind: "transient",
        retryable: true,
        providerCode: "network_error",
      });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
}
