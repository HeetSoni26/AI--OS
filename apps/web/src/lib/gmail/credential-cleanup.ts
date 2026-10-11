import "server-only";

import {
  OutboxStatus,
  ScheduledJobStatus,
  getDatabaseClient,
  type Prisma,
  type PrismaClient,
} from "@aios/data";
import { z } from "zod";
import { GMAIL_CREDENTIAL_CLEANUP_JOB_TYPE } from "./scheduling";
import { removeVaultSecret } from "./vault";

const cleanupPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  connectionId: z.string().uuid(),
  credentialReferenceId: z.string().uuid(),
  vaultReference: z.string().uuid(),
  attempt: z.number().int().nonnegative().default(0),
});

type CleanupPayload = z.infer<typeof cleanupPayloadSchema>;

export interface GmailCredentialCleanupDependencies {
  readonly database?: PrismaClient;
  readonly removeSecret?: (vaultReference: string) => Promise<void>;
  readonly now?: () => Date;
}

function safeFailureCode(error: unknown): string {
  if (error instanceof Error && error.name === "GmailVaultError") return "gmail_vault_unavailable";
  return "gmail_credential_cleanup_failed";
}

async function claimCleanupJob(
  database: PrismaClient,
  jobId: string,
  now: Date,
): Promise<CleanupPayload | null> {
  return database.$transaction(async (transaction) => {
    const staleBefore = new Date(now.getTime() - 5 * 60_000);
    const found = await transaction.scheduledJob.findFirst({
      where: {
        id: jobId,
        jobType: GMAIL_CREDENTIAL_CLEANUP_JOB_TYPE,
        archivedAt: null,
        deletedAt: null,
        OR: [
          { status: ScheduledJobStatus.ACTIVE, nextRunAt: { lte: now } },
          { status: ScheduledJobStatus.RUNNING, updatedAt: { lte: staleBefore } },
        ],
      },
      select: { id: true, status: true, updatedAt: true, payload: true },
    });
    if (!found) return null;
    const parsed = cleanupPayloadSchema.safeParse(found.payload);
    if (!parsed.success) {
      await transaction.scheduledJob.update({
        where: { id: found.id },
        data: { status: ScheduledJobStatus.FAILED, nextRunAt: null },
      });
      return null;
    }
    const claimed = await transaction.scheduledJob.updateMany({
      where: {
        id: found.id,
        status: found.status,
        updatedAt: found.updatedAt,
      },
      data: { status: ScheduledJobStatus.RUNNING, lastRunAt: now },
    });
    return claimed.count === 1 ? parsed.data : null;
  });
}

async function completeCleanup(
  transaction: Prisma.TransactionClient,
  jobId: string,
  payload: CleanupPayload,
  completedAt: Date,
): Promise<void> {
  const deleted = await transaction.credentialReference.deleteMany({
    where: {
      id: payload.credentialReferenceId,
      vaultReference: payload.vaultReference,
      connections: { none: {} },
    },
  });
  await transaction.scheduledJob.updateMany({
    where: { id: jobId, status: ScheduledJobStatus.RUNNING },
    data: { status: ScheduledJobStatus.COMPLETED, nextRunAt: null, payload: { ...payload, completed: true } },
  });
  const correlationId = `gmail-credential-cleanup:${jobId}`;
  const summary = {
    schemaVersion: 1,
    connectionId: payload.connectionId,
    credentialReferenceId: payload.credentialReferenceId,
    cleanupJobId: jobId,
    referenceDeleted: deleted.count === 1,
  };
  await transaction.auditEvent.create({
    data: {
      actorSubject: "system:gmail-credential-cleanup",
      actorType: "system",
      action: "gmail.credential_cleanup_completed",
      entityType: "credential_reference",
      entityId: payload.credentialReferenceId,
      correlationId,
      changeSummary: summary,
    },
  });
  await transaction.outboxEvent.upsert({
    where: { idempotencyKey: `gmail:${payload.credentialReferenceId}:cleanup:completed` },
    update: {},
    create: {
      aggregateType: "credential_reference",
      aggregateId: payload.credentialReferenceId,
      eventType: "integration.gmail.credential_cleanup.completed.v1",
      payload: summary,
      correlationId,
      occurredAt: completedAt,
      availableAt: completedAt,
      status: OutboxStatus.PENDING,
      idempotencyKey: `gmail:${payload.credentialReferenceId}:cleanup:completed`,
    },
  });
}

async function recordCleanupFailure(
  database: PrismaClient,
  jobId: string,
  payload: CleanupPayload,
  failedAt: Date,
  error: unknown,
): Promise<void> {
  const attempt = payload.attempt + 1;
  const exhausted = attempt >= 10;
  const retryAt = new Date(failedAt.getTime() + Math.min(60 * 60_000, 30_000 * 2 ** (attempt - 1)));
  const correlationId = `gmail-credential-cleanup:${jobId}`;
  const summary = {
    schemaVersion: 1,
    connectionId: payload.connectionId,
    credentialReferenceId: payload.credentialReferenceId,
    cleanupJobId: jobId,
    attempt,
    errorCode: safeFailureCode(error),
    exhausted,
    retryAt: exhausted ? null : retryAt.toISOString(),
  };
  await database.$transaction(async (transaction) => {
    await transaction.scheduledJob.updateMany({
      where: { id: jobId, status: ScheduledJobStatus.RUNNING },
      data: {
        status: exhausted ? ScheduledJobStatus.FAILED : ScheduledJobStatus.ACTIVE,
        nextRunAt: exhausted ? null : retryAt,
        payload: { ...payload, attempt, lastErrorCode: safeFailureCode(error) },
      },
    });
    await transaction.auditEvent.create({
      data: {
        actorSubject: "system:gmail-credential-cleanup",
        actorType: "system",
        action: exhausted ? "gmail.credential_cleanup_failed" : "gmail.credential_cleanup_retry_scheduled",
        entityType: "credential_reference",
        entityId: payload.credentialReferenceId,
        correlationId,
        changeSummary: summary,
      },
    });
    await transaction.outboxEvent.create({
      data: {
        aggregateType: "credential_reference",
        aggregateId: payload.credentialReferenceId,
        eventType: exhausted
          ? "integration.gmail.credential_cleanup.failed.v1"
          : "integration.gmail.credential_cleanup.retry_scheduled.v1",
        payload: summary,
        correlationId,
        occurredAt: failedAt,
        availableAt: failedAt,
        status: OutboxStatus.PENDING,
        idempotencyKey: `gmail:${payload.credentialReferenceId}:cleanup:failure:${attempt}`,
      },
    });
  });
}

/**
 * Retry-safe cleanup seam for rotated refresh credentials. Vault deletion happens
 * first and is idempotent; a crash before database acknowledgement safely replays.
 */
export async function processGmailCredentialCleanupJob(
  jobId: string,
  dependencies: GmailCredentialCleanupDependencies = {},
): Promise<"completed" | "retry_scheduled" | "not_due"> {
  const database = dependencies.database ?? getDatabaseClient();
  const now = dependencies.now?.() ?? new Date();
  const payload = await claimCleanupJob(database, jobId, now);
  if (!payload) return "not_due";
  try {
    const credential = await database.credentialReference.findUnique({
      where: { id: payload.credentialReferenceId },
      select: {
        vaultReference: true,
        connections: { select: { id: true }, take: 1 },
      },
    });
    if (credential && (
      credential.vaultReference !== payload.vaultReference || credential.connections.length > 0
    )) {
      throw Object.assign(new Error("Gmail credential cleanup is waiting for reference detachment."), {
        name: "GmailCredentialStillReferencedError",
      });
    }
    await (dependencies.removeSecret ?? removeVaultSecret)(payload.vaultReference);
    await database.$transaction((transaction) => completeCleanup(transaction, jobId, payload, now));
    return "completed";
  } catch (error) {
    await recordCleanupFailure(database, jobId, payload, now, error);
    return "retry_scheduled";
  }
}
