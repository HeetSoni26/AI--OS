import "server-only";

import { randomUUID } from "node:crypto";
import {
  IntegrationProvider,
  IntegrationStatus,
  OutboxStatus,
  getDatabaseClient,
} from "@aios/data";
import {
  GMAIL_READONLY_SCOPE,
  GmailApiClient,
  exchangeGmailAuthorizationCode,
  type GmailOAuthTokens,
} from "@aios/integrations/gmail";
import { ApiRequestError } from "@/lib/api/errors";
import { getGmailOAuthConfiguration } from "./configuration";
import {
  createManualGmailSyncJob,
  ensureScheduledGmailSyncJob,
  resetGmailSyncStateForConnection,
  scheduleSupersededGmailCredentialCleanup,
} from "./scheduling";
import { createVaultSecret, removeVaultSecret } from "./vault";

export async function connectGmail(code: string, ownerId: string, correlationId: string) {
  const database = getDatabaseClient();
  const configuration = getGmailOAuthConfiguration();
  const tokens: GmailOAuthTokens = await exchangeGmailAuthorizationCode(configuration, { code });
  if (!tokens.refreshToken) throw new ApiRequestError("GMAIL_OFFLINE_ACCESS_REQUIRED", "Google did not return offline Gmail access. Reconnect and approve consent.", { status: 409 });
  if (!tokens.scopes.includes(GMAIL_READONLY_SCOPE)) {
    throw new ApiRequestError("GMAIL_READONLY_ACCESS_REQUIRED", "Google did not grant read-only Gmail access. Reconnect and approve the requested scope.", { status: 409 });
  }
  const profile = await new GmailApiClient({ accessToken: tokens.accessToken }).getProfile();
  const now = new Date();
  const vaultId = await createVaultSecret(
    tokens.refreshToken,
    `gmail-${randomUUID()}`,
    "AI OS Gmail refresh credential",
  );

  try {
    return await database.$transaction(async (transaction) => {
      const existing = await transaction.integrationConnection.findUnique({
        where: {
          provider_externalAccountId: {
            provider: IntegrationProvider.GMAIL,
            externalAccountId: profile.emailAddress,
          },
        },
        select: {
          id: true,
          credentialReferenceId: true,
          credentialReference: { select: { id: true, vaultReference: true } },
        },
      });
      const credential = await transaction.credentialReference.create({
        data: {
          provider: IntegrationProvider.GMAIL,
          label: "Gmail refresh credential",
          vaultReference: vaultId,
          lastRotatedAt: existing?.credentialReferenceId ? now : null,
        },
      });
      const connection = await transaction.integrationConnection.upsert({
        where: {
          provider_externalAccountId: {
            provider: IntegrationProvider.GMAIL,
            externalAccountId: profile.emailAddress,
          },
        },
        update: {
          credentialReferenceId: credential.id,
          name: "Gmail account",
          status: IntegrationStatus.CONNECTED,
          scopes: [...tokens.scopes],
          connectedAt: now,
          lastHealthCheckAt: now,
          safeMetadata: { provider: "gmail" },
          archivedAt: null,
          deletedAt: null,
        },
        create: {
          credentialReferenceId: credential.id,
          provider: IntegrationProvider.GMAIL,
          name: "Gmail account",
          status: IntegrationStatus.CONNECTED,
          externalAccountId: profile.emailAddress,
          scopes: [...tokens.scopes],
          connectedAt: now,
          lastHealthCheckAt: now,
          safeMetadata: { provider: "gmail" },
        },
      });
      await resetGmailSyncStateForConnection(transaction, connection.id, profile.historyId);
      const syncJob = await ensureScheduledGmailSyncJob(transaction, connection.id, now);
      let cleanupJobId: string | null = null;
      if (existing?.credentialReference && existing.credentialReference.id !== credential.id) {
        const cleanupJob = await scheduleSupersededGmailCredentialCleanup(transaction, {
          connectionId: connection.id,
          credentialReferenceId: existing.credentialReference.id,
          vaultReference: existing.credentialReference.vaultReference,
          actorSubject: ownerId,
          correlationId,
          now,
        });
        cleanupJobId = cleanupJob.id;
      }
      const eventVersion = existing ? "reconnected" : "connected";
      const safeSummary = {
        schemaVersion: 1,
        provider: "gmail",
        scopes: [...tokens.scopes],
        syncJobId: syncJob.id,
        cleanupJobId,
      };
      await transaction.auditEvent.create({
        data: {
          actorSubject: ownerId,
          actorType: "owner",
          action: `gmail.${eventVersion}`,
          entityType: "integration_connection",
          entityId: connection.id,
          correlationId,
          changeSummary: safeSummary,
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: "integration_connection",
          aggregateId: connection.id,
          eventType: `integration.gmail.${eventVersion}.v1`,
          payload: { ...safeSummary, connectionId: connection.id },
          correlationId,
          occurredAt: now,
          availableAt: now,
          status: OutboxStatus.PENDING,
          idempotencyKey: `gmail:${connection.id}:${eventVersion}:${credential.id}`,
        },
      });
      return { connection, syncJob, cleanupJobId };
    });
  } catch (error) {
    await removeVaultSecret(vaultId).catch(() => undefined);
    throw error;
  }
}

export async function requestManualGmailSync(
  connectionId: string,
  ownerId: string,
  correlationId: string,
) {
  const database = getDatabaseClient();
  return database.$transaction(async (transaction) => {
    const connection = await transaction.integrationConnection.findFirst({
      where: {
        id: connectionId,
        provider: IntegrationProvider.GMAIL,
        archivedAt: null,
        deletedAt: null,
      },
      select: { id: true, status: true },
    });
    if (!connection) throw new ApiRequestError("GMAIL_NOT_CONNECTED", "Connect Gmail before requesting synchronization.", { status: 409 });
    if (connection.status === IntegrationStatus.REVOKED) throw new ApiRequestError("GMAIL_RECONNECT_REQUIRED", "Gmail authorization has been revoked. Reconnect Gmail.", { status: 409 });
    if (connection.status !== IntegrationStatus.CONNECTED && connection.status !== IntegrationStatus.DEGRADED) {
      throw new ApiRequestError("GMAIL_SYNC_UNAVAILABLE", "The Gmail connection is not available for synchronization.", { status: 409 });
    }
    const job = await createManualGmailSyncJob(transaction, connection.id, correlationId);
    await transaction.integrationSyncState.updateMany({
      where: { integrationConnectionId: connection.id, checkpointType: "gmail_history" },
      data: { nextRetryAt: null },
    });
    await transaction.auditEvent.create({
      data: {
        actorSubject: ownerId,
        actorType: "owner",
        action: "gmail.sync_requested",
        entityType: "scheduled_job",
        entityId: job.id,
        correlationId,
        changeSummary: { schemaVersion: 1, connectionId: connection.id, jobType: "gmail_sync" },
      },
    });
    await transaction.outboxEvent.upsert({
      where: { idempotencyKey: `gmail:${connection.id}:sync-requested:${job.id}` },
      update: {},
      create: {
        aggregateType: "scheduled_job",
        aggregateId: job.id,
        eventType: "integration.gmail.sync.requested.v1",
        payload: { schemaVersion: 1, connectionId: connection.id, jobId: job.id },
        correlationId,
        occurredAt: new Date(),
        status: OutboxStatus.PENDING,
        idempotencyKey: `gmail:${connection.id}:sync-requested:${job.id}`,
      },
    });
    return job;
  });
}

export async function gmailConnectionStatus() {
  const connection = await getDatabaseClient().integrationConnection.findFirst({
    where: { provider: IntegrationProvider.GMAIL, archivedAt: null, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, status: true, externalAccountId: true, scopes: true, connectedAt: true, lastHealthCheckAt: true, syncStates: { select: { status: true, lastSyncedAt: true, nextRetryAt: true, lastErrorCode: true } } },
  });
  return connection;
}
