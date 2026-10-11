import "server-only";

import { createHash } from "node:crypto";
import {
  IntegrationSyncStatus,
  OutboxStatus,
  ScheduledJobStatus,
  type Prisma,
} from "@aios/data";

export const GMAIL_HISTORY_CHECKPOINT_TYPE = "gmail_history" as const;
export const GMAIL_SYNC_JOB_TYPE = "gmail_sync" as const;
export const GMAIL_CREDENTIAL_CLEANUP_JOB_TYPE = "gmail_credential_cleanup" as const;
export const GMAIL_SYNC_INTERVAL_MS = 5 * 60_000;

function manualJobKey(connectionId: string, requestId: string): string {
  const requestHash = createHash("sha256").update(requestId).digest("hex").slice(0, 32);
  return `gmail-sync:${connectionId}:manual:${requestHash}`;
}

export async function ensureScheduledGmailSyncJob(
  transaction: Prisma.TransactionClient,
  connectionId: string,
  now = new Date(),
) {
  const idempotencyKey = `gmail-sync:${connectionId}:scheduled`;
  const existing = await transaction.scheduledJob.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true },
  });
  const common = {
    name: "Gmail history synchronization",
    jobType: GMAIL_SYNC_JOB_TYPE,
    entityType: "integration_connection",
    entityId: connectionId,
    cronExpression: "*/5 * * * *",
    timezone: "UTC",
    payload: {
      schemaVersion: 1,
      checkpointType: GMAIL_HISTORY_CHECKPOINT_TYPE,
      schedule: "recurring",
      intervalMs: GMAIL_SYNC_INTERVAL_MS,
    },
    archivedAt: null,
    deletedAt: null,
  } satisfies Prisma.ScheduledJobUncheckedUpdateInput;

  if (existing) {
    return transaction.scheduledJob.update({
      where: { id: existing.id },
      data: {
        ...common,
        nextRunAt: now,
        ...(existing.status === ScheduledJobStatus.RUNNING
          ? {}
          : { status: ScheduledJobStatus.ACTIVE, runAt: now }),
      },
      select: { id: true, status: true, nextRunAt: true },
    });
  }

  return transaction.scheduledJob.create({
    data: {
      ...common,
      runAt: now,
      nextRunAt: now,
      status: ScheduledJobStatus.ACTIVE,
      idempotencyKey,
    },
    select: { id: true, status: true, nextRunAt: true },
  });
}

export async function createManualGmailSyncJob(
  transaction: Prisma.TransactionClient,
  connectionId: string,
  requestId: string,
  now = new Date(),
) {
  const idempotencyKey = manualJobKey(connectionId, requestId);
  const existing = await transaction.scheduledJob.findUnique({
    where: { idempotencyKey },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status !== ScheduledJobStatus.RUNNING) {
      await transaction.scheduledJob.update({
        where: { id: existing.id },
        data: {
          status: ScheduledJobStatus.ACTIVE,
          runAt: now,
          nextRunAt: now,
          archivedAt: null,
          deletedAt: null,
        },
      });
    }
    return { id: existing.id };
  }

  return transaction.scheduledJob.create({
    data: {
      name: "Manual Gmail history synchronization",
      jobType: GMAIL_SYNC_JOB_TYPE,
      entityType: "integration_connection",
      entityId: connectionId,
      runAt: now,
      nextRunAt: now,
      timezone: "UTC",
      status: ScheduledJobStatus.ACTIVE,
      idempotencyKey,
      payload: {
        schemaVersion: 1,
        checkpointType: GMAIL_HISTORY_CHECKPOINT_TYPE,
        schedule: "manual",
      },
    },
    select: { id: true },
  });
}

export async function scheduleSupersededGmailCredentialCleanup(
  transaction: Prisma.TransactionClient,
  input: {
    readonly connectionId: string;
    readonly credentialReferenceId: string;
    readonly vaultReference: string;
    readonly actorSubject: string;
    readonly correlationId: string;
    readonly now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const idempotencyKey = `gmail-credential-cleanup:${input.credentialReferenceId}`;
  const job = await transaction.scheduledJob.upsert({
    where: { idempotencyKey },
    update: {
      status: ScheduledJobStatus.ACTIVE,
      runAt: now,
      nextRunAt: now,
      archivedAt: null,
      deletedAt: null,
    },
    create: {
      name: "Superseded Gmail credential cleanup",
      jobType: GMAIL_CREDENTIAL_CLEANUP_JOB_TYPE,
      entityType: "credential_reference",
      entityId: input.credentialReferenceId,
      runAt: now,
      nextRunAt: now,
      timezone: "UTC",
      status: ScheduledJobStatus.ACTIVE,
      idempotencyKey,
      payload: {
        schemaVersion: 1,
        connectionId: input.connectionId,
        credentialReferenceId: input.credentialReferenceId,
        vaultReference: input.vaultReference,
        attempt: 0,
      },
    },
    select: { id: true },
  });
  const safeSummary = {
    schemaVersion: 1,
    connectionId: input.connectionId,
    credentialReferenceId: input.credentialReferenceId,
    cleanupJobId: job.id,
  };
  await transaction.auditEvent.create({
    data: {
      actorSubject: input.actorSubject,
      actorType: "owner",
      action: "gmail.credential_cleanup_requested",
      entityType: "credential_reference",
      entityId: input.credentialReferenceId,
      correlationId: input.correlationId,
      changeSummary: safeSummary,
    },
  });
  await transaction.outboxEvent.upsert({
    where: { idempotencyKey: `gmail:${input.credentialReferenceId}:cleanup:requested` },
    update: {},
    create: {
      aggregateType: "credential_reference",
      aggregateId: input.credentialReferenceId,
      eventType: "integration.gmail.credential_cleanup.requested.v1",
      payload: safeSummary,
      correlationId: input.correlationId,
      occurredAt: now,
      availableAt: now,
      status: OutboxStatus.PENDING,
      idempotencyKey: `gmail:${input.credentialReferenceId}:cleanup:requested`,
    },
  });
  return job;
}

export async function resetGmailSyncStateForConnection(
  transaction: Prisma.TransactionClient,
  connectionId: string,
  checkpointValue: string,
) {
  return transaction.integrationSyncState.upsert({
    where: {
      integrationConnectionId_checkpointType: {
        integrationConnectionId: connectionId,
        checkpointType: GMAIL_HISTORY_CHECKPOINT_TYPE,
      },
    },
    update: {
      checkpointValue,
      status: IntegrationSyncStatus.IDLE,
      nextRetryAt: null,
      lastErrorCode: null,
    },
    create: {
      integrationConnectionId: connectionId,
      checkpointType: GMAIL_HISTORY_CHECKPOINT_TYPE,
      checkpointValue,
      status: IntegrationSyncStatus.IDLE,
    },
  });
}
