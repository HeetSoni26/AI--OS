import { OutboxStatus, Prisma, ScheduledJobStatus, type PrismaClient } from "@aios/data";

import type { JobsLogger } from "../outbox/publisher";
import type { RunOnceWorker, WorkerBatchResult } from "../worker";

const CLEANUP_JOB_TYPE = "gmail_credential_cleanup";
const MAXIMUM_ATTEMPTS = 10;

interface ClaimedCredentialCleanup {
  readonly id: string;
  readonly connectionId: string;
  readonly credentialReferenceId: string;
  readonly vaultReference: string;
  readonly attempt: number;
}

interface RawClaim {
  readonly id: string;
  readonly payload: unknown;
}

function payloadClaim(row: RawClaim): ClaimedCredentialCleanup | null {
  if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return null;
  const payload = row.payload as Record<string, unknown>;
  if (payload.schemaVersion !== 1
      || typeof payload.connectionId !== "string"
      || typeof payload.credentialReferenceId !== "string"
      || typeof payload.vaultReference !== "string") return null;
  return {
    id: row.id,
    connectionId: payload.connectionId,
    credentialReferenceId: payload.credentialReferenceId,
    vaultReference: payload.vaultReference,
    attempt: typeof payload.attempt === "number" && Number.isInteger(payload.attempt) && payload.attempt >= 0
      ? payload.attempt
      : 0,
  };
}

export interface GmailCredentialCleanupWorkerOptions {
  readonly database: PrismaClient;
  readonly batchSize?: number;
  readonly leaseTimeoutMs?: number;
  readonly clock?: () => Date;
  readonly logger?: JobsLogger;
  readonly removeVaultSecret?: (vaultReference: string) => Promise<void>;
}

/** Removes superseded Gmail refresh credentials after their connection reference is detached. */
export class GmailCredentialCleanupWorker implements RunOnceWorker<WorkerBatchResult> {
  private readonly batchSize: number;
  private readonly leaseTimeoutMs: number;
  private readonly clock: () => Date;
  private readonly logger?: JobsLogger;
  private readonly removeSecret: (vaultReference: string) => Promise<void>;

  constructor(private readonly options: GmailCredentialCleanupWorkerOptions) {
    this.batchSize = options.batchSize ?? 10;
    this.leaseTimeoutMs = options.leaseTimeoutMs ?? 5 * 60_000;
    this.clock = options.clock ?? (() => new Date());
    this.logger = options.logger;
    this.removeSecret = options.removeVaultSecret ?? (async (vaultReference) => {
      await options.database.$executeRaw(Prisma.sql`DELETE FROM vault.secrets WHERE id = ${vaultReference}::uuid`);
    });
  }

  async runOnce(signal?: AbortSignal): Promise<WorkerBatchResult> {
    if (signal?.aborted) return { claimed: 0, succeeded: 0, failed: 0, deferred: 0 };
    const claims = await this.claimDue(this.clock());
    let succeeded = 0;
    let failed = 0;
    let deferred = 0;
    for (const claim of claims) {
      if (signal?.aborted) break;
      const outcome = await this.process(claim);
      if (outcome === "succeeded") succeeded += 1;
      else if (outcome === "failed") failed += 1;
      else deferred += 1;
    }
    return { claimed: claims.length, succeeded, failed, deferred };
  }

  private async claimDue(now: Date): Promise<ClaimedCredentialCleanup[]> {
    const staleBefore = new Date(now.getTime() - this.leaseTimeoutMs);
    const rows = await this.options.database.$queryRawUnsafe<RawClaim[]>(
      `WITH candidates AS (
         SELECT id
         FROM public.scheduled_jobs
         WHERE job_type = 'gmail_credential_cleanup'
           AND archived_at IS NULL AND deleted_at IS NULL
           AND ((status = 'active' AND COALESCE(next_run_at, run_at) <= $1)
             OR (status = 'running' AND updated_at <= $2))
         ORDER BY COALESCE(next_run_at, run_at), id
         FOR UPDATE SKIP LOCKED
         LIMIT $3
       )
       UPDATE public.scheduled_jobs AS job
       SET status = 'running', last_run_at = $1
       FROM candidates
       WHERE job.id = candidates.id
       RETURNING job.id, job.payload`,
      now,
      staleBefore,
      this.batchSize,
    );
    const claims: ClaimedCredentialCleanup[] = [];
    for (const row of rows) {
      const claim = payloadClaim(row);
      if (claim) claims.push(claim);
      else await this.options.database.scheduledJob.update({ where: { id: row.id }, data: { status: ScheduledJobStatus.FAILED, nextRunAt: null } });
    }
    return claims;
  }

  private async process(claim: ClaimedCredentialCleanup): Promise<"succeeded" | "failed" | "deferred"> {
    const now = this.clock();
    try {
      const credential = await this.options.database.credentialReference.findUnique({
        where: { id: claim.credentialReferenceId },
        select: { vaultReference: true, connections: { select: { id: true }, take: 1 } },
      });
      if (credential && (credential.vaultReference !== claim.vaultReference || credential.connections.length > 0)) {
        await this.recordFailure(claim, now, "gmail_credential_still_referenced");
        return "deferred";
      }
      await this.removeSecret(claim.vaultReference);
      await this.options.database.$transaction(async (transaction) => {
        await transaction.credentialReference.deleteMany({
          where: { id: claim.credentialReferenceId, vaultReference: claim.vaultReference, connections: { none: {} } },
        });
        const completed = await transaction.scheduledJob.updateMany({
          where: { id: claim.id, status: ScheduledJobStatus.RUNNING },
          data: { status: ScheduledJobStatus.COMPLETED, nextRunAt: null, payload: { schemaVersion: 1, connectionId: claim.connectionId, credentialReferenceId: claim.credentialReferenceId, vaultReference: claim.vaultReference, attempt: claim.attempt, completed: true } },
        });
        if (completed.count !== 1) throw new Error("Gmail credential cleanup claim was lost.");
        const correlationId = `gmail-credential-cleanup:${claim.id}`;
        const summary = { schemaVersion: 1, connectionId: claim.connectionId, credentialReferenceId: claim.credentialReferenceId, cleanupJobId: claim.id };
        await transaction.auditEvent.create({ data: {
          actorSubject: "system:gmail-credential-cleanup",
          actorType: "system",
          action: "gmail.credential_cleanup_completed",
          entityType: "credential_reference",
          entityId: claim.credentialReferenceId,
          correlationId,
          changeSummary: summary,
        } });
        await transaction.outboxEvent.upsert({
          where: { idempotencyKey: `gmail:${claim.credentialReferenceId}:cleanup:completed` },
          update: {},
          create: {
            aggregateType: "credential_reference",
            aggregateId: claim.credentialReferenceId,
            eventType: "integration.gmail.credential_cleanup.completed.v1",
            payload: summary,
            correlationId,
            occurredAt: now,
            availableAt: now,
            status: OutboxStatus.PENDING,
            idempotencyKey: `gmail:${claim.credentialReferenceId}:cleanup:completed`,
          },
        });
      });
      this.logger?.({ component: "gmail", message: "Superseded Gmail credential removed from Vault.", cleanupJobId: claim.id, credentialReferenceId: claim.credentialReferenceId });
      return "succeeded";
    } catch {
      await this.recordFailure(claim, now, "gmail_credential_cleanup_failed");
      return "failed";
    }
  }

  private async recordFailure(claim: ClaimedCredentialCleanup, failedAt: Date, errorCode: string): Promise<void> {
    const attempt = claim.attempt + 1;
    const exhausted = attempt >= MAXIMUM_ATTEMPTS;
    const retryAt = new Date(failedAt.getTime() + Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1)));
    await this.options.database.$transaction(async (transaction) => {
      await transaction.scheduledJob.updateMany({
        where: { id: claim.id, status: ScheduledJobStatus.RUNNING },
        data: {
          status: exhausted ? ScheduledJobStatus.FAILED : ScheduledJobStatus.ACTIVE,
          nextRunAt: exhausted ? null : retryAt,
          payload: { schemaVersion: 1, connectionId: claim.connectionId, credentialReferenceId: claim.credentialReferenceId, vaultReference: claim.vaultReference, attempt, lastErrorCode: errorCode },
        },
      });
      await transaction.auditEvent.create({ data: {
        actorSubject: "system:gmail-credential-cleanup",
        actorType: "system",
        action: exhausted ? "gmail.credential_cleanup_failed" : "gmail.credential_cleanup_retry_scheduled",
        entityType: "credential_reference",
        entityId: claim.credentialReferenceId,
        correlationId: `gmail-credential-cleanup:${claim.id}`,
        changeSummary: { schemaVersion: 1, cleanupJobId: claim.id, credentialReferenceId: claim.credentialReferenceId, attempt, errorCode, retryAt: exhausted ? null : retryAt.toISOString() },
      } });
    });
  }
}

/** Runs retry-safe credential maintenance before optional Gmail history ingestion. */
export class CompositeGmailWorker implements RunOnceWorker<WorkerBatchResult> {
  constructor(
    private readonly cleanup: RunOnceWorker<WorkerBatchResult>,
    private readonly sync: RunOnceWorker<WorkerBatchResult>,
  ) {}

  async runOnce(signal?: AbortSignal): Promise<WorkerBatchResult> {
    const cleanup = await this.cleanup.runOnce(signal);
    const sync = signal?.aborted ? { claimed: 0, succeeded: 0, failed: 0, deferred: 0 } : await this.sync.runOnce(signal);
    return {
      claimed: cleanup.claimed + sync.claimed,
      succeeded: cleanup.succeeded + sync.succeeded,
      failed: cleanup.failed + sync.failed,
      deferred: (cleanup.deferred ?? 0) + (sync.deferred ?? 0),
    };
  }
}
