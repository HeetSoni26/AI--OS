import type { Prisma, PrismaClient } from "@aios/data";

import { ClaimLostError } from "../errors";
import type {
  ClaimedDeletionRequest,
  DeletionFailureRecord,
  DeletionImpactPlan,
  DeletionIneligibility,
  DeletionRepository,
  DeletionRequestStatus,
} from "../deletion/contracts";
import type {
  ClaimedGmailSyncJob,
  GmailIngestionResult,
  GmailSyncFailureRecord,
  GmailSyncRepository,
} from "../gmail/contracts";
import type {
  ClaimedOutboxEvent,
  OutboxFailureRecord,
  OutboxRepository,
} from "../outbox/contracts";

interface RawDeletionClaim {
  id: string;
  entityType: string;
  entityId: string;
  status: string;
  requestedBy: string;
  requestedAt: Date;
  executeAfter: Date;
  recoveryUntil: Date;
  impactManifest: unknown;
  impactRegistryVersion: number;
  legalHold: boolean;
  confirmedAt: Date | null;
  failureAttempt: number;
  claimToken: string;
}

interface RawOutboxClaim {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  correlationId: string;
  occurredAt: Date;
  idempotencyKey: string;
  attempt: number;
  claimToken: string;
}

interface RawGmailClaim {
  id: string;
  integrationConnectionId: string;
  syncStateId: string;
  checkpointType: string;
  checkpointValue: string | null;
  idempotencyKey: string;
  claimToken: string;
}

function deletionClaim(row: RawDeletionClaim): ClaimedDeletionRequest {
  return {
    ...row,
    status: row.status as DeletionRequestStatus,
  };
}

function outboxClaim(row: RawOutboxClaim): ClaimedOutboxEvent {
  const payload = row.payload !== null && typeof row.payload === "object" && !Array.isArray(row.payload)
    ? row.payload as Record<string, unknown>
    : { value: row.payload };
  return { ...row, payload };
}

function dateOrNow(value: Date | undefined, now: Date): Date {
  return value ?? now;
}

/**
 * PostgreSQL polling adapters for the existing Part 3 tables. Every claim query
 * uses row locks with SKIP LOCKED, and every acknowledgement is guarded by the
 * claimed row's xmin token so stale workers cannot overwrite newer state.
 */
export class PostgresJobsRepository {
  constructor(private readonly client: PrismaClient) {}

  readonly deletion: DeletionRepository = {
    claimDue: async (input) => this.claimDeletionRequests(input),
    recheckClaim: async (claim, now) => this.recheckDeletionClaim(claim, now),
    releaseIneligible: async (claim, ineligibility, now) =>
      this.releaseIneligibleDeletion(claim, ineligibility, now),
    recordFailure: async (claim, failure) => this.recordDeletionFailure(claim, failure),
    recordCompletion: async (claim, plan, completedAt) =>
      this.recordDeletionCompletion(claim, plan, completedAt),
  };

  readonly outbox: OutboxRepository = {
    claimDue: async (input) => this.claimOutboxEvents(input),
    recordPublished: async (event, publishedAt) => this.recordOutboxPublished(event, publishedAt),
    recordFailure: async (event, failure) => this.recordOutboxFailure(event, failure),
  };

  readonly gmail: GmailSyncRepository = {
    claimDue: async (input) => this.claimGmailSyncJobs(input),
    recordSuccess: async (job, result, completedAt) =>
      this.recordGmailSyncSuccess(job, result, completedAt),
    recordFailure: async (job, failure) => this.recordGmailSyncFailure(job, failure),
  };

  private async claimDeletionRequests(input: {
    readonly now: Date;
    readonly limit: number;
    readonly leaseTimeoutMs: number;
  }): Promise<readonly ClaimedDeletionRequest[]> {
    const staleBefore = new Date(input.now.getTime() - input.leaseTimeoutMs);
    const rows = await this.client.$queryRawUnsafe<RawDeletionClaim[]>(
      `WITH candidates AS (
         SELECT id
         FROM public.deletion_requests
         WHERE (
           (status IN ('pending', 'failed') AND execute_after <= $1)
           OR (status = 'executing' AND updated_at <= $2)
         )
           AND legal_hold = false
           AND confirmed_at IS NOT NULL
           AND completed_at IS NULL
           AND cancelled_at IS NULL
           AND COALESCE(impact_manifest->'_jobs'->>'exhausted', 'false') <> 'true'
         ORDER BY execute_after, id
         FOR UPDATE SKIP LOCKED
         LIMIT $3
       )
       UPDATE public.deletion_requests AS request
       SET status = 'executing', error_message = NULL
       FROM candidates
       WHERE request.id = candidates.id
       RETURNING
         request.id,
         request.entity_type AS "entityType",
         request.entity_id AS "entityId",
         request.status::text AS status,
         request.requested_by AS "requestedBy",
         request.requested_at AS "requestedAt",
         request.execute_after AS "executeAfter",
         request.recovery_until AS "recoveryUntil",
         request.impact_manifest AS "impactManifest",
         request.impact_registry_version AS "impactRegistryVersion",
         request.legal_hold AS "legalHold",
         request.confirmed_at AS "confirmedAt",
         CASE
           WHEN request.impact_manifest->'_jobs'->>'attempt' ~ '^[0-9]{1,9}$'
             THEN (request.impact_manifest->'_jobs'->>'attempt')::integer
           ELSE 0
         END AS "failureAttempt",
         request.xmin::text AS "claimToken"`,
      input.now,
      staleBefore,
      input.limit,
    );
    return rows.map(deletionClaim);
  }

  private async recheckDeletionClaim(
    claim: ClaimedDeletionRequest,
    _now: Date,
  ): Promise<ClaimedDeletionRequest | null> {
    const rows = await this.client.$queryRawUnsafe<RawDeletionClaim[]>(
      `UPDATE public.deletion_requests AS request
       SET status = status
       WHERE id = $1
         AND status = 'executing'
         AND xmin::text = $2
       RETURNING
         request.id,
         request.entity_type AS "entityType",
         request.entity_id AS "entityId",
         request.status::text AS status,
         request.requested_by AS "requestedBy",
         request.requested_at AS "requestedAt",
         request.execute_after AS "executeAfter",
         request.recovery_until AS "recoveryUntil",
         request.impact_manifest AS "impactManifest",
         request.impact_registry_version AS "impactRegistryVersion",
         request.legal_hold AS "legalHold",
         request.confirmed_at AS "confirmedAt",
         CASE
           WHEN request.impact_manifest->'_jobs'->>'attempt' ~ '^[0-9]{1,9}$'
             THEN (request.impact_manifest->'_jobs'->>'attempt')::integer
           ELSE 0
         END AS "failureAttempt",
         request.xmin::text AS "claimToken"`,
      claim.id,
      claim.claimToken,
    );
    return rows[0] ? deletionClaim(rows[0]) : null;
  }

  private async releaseIneligibleDeletion(
    claim: ClaimedDeletionRequest,
    ineligibility: DeletionIneligibility,
    now: Date,
  ): Promise<void> {
    const nextStatus = ineligibility.reason === "registry_version" ? "failed" : "pending";
    const retryAt = dateOrNow(ineligibility.retryAt, now);
    const message = {
      unconfirmed: "Deletion request has not been confirmed.",
      legal_hold: "Deletion is blocked by a legal hold.",
      recovery_window: "The seven-day deletion recovery window has not expired.",
      registry_version: "Deletion impact registry version does not match the worker.",
      status: "Deletion request status changed before execution.",
    }[ineligibility.reason];
    const updated = await this.client.$executeRawUnsafe(
      `UPDATE public.deletion_requests
       SET status = $3::"DeletionStatus", execute_after = $4, error_message = $5
       WHERE id = $1 AND status = 'executing' AND xmin::text = $2`,
      claim.id,
      claim.claimToken,
      nextStatus,
      retryAt,
      message,
    );
    if (updated !== 1) throw new ClaimLostError("deletion", claim.id);
  }

  private async recordDeletionFailure(
    claim: ClaimedDeletionRequest,
    failure: DeletionFailureRecord,
  ): Promise<void> {
    const metadata = JSON.stringify({
      attempt: failure.attempt,
      failedAt: failure.failedAt.toISOString(),
      ...(failure.failedParticipant === undefined
        ? {}
        : { failedParticipant: failure.failedParticipant }),
      exhausted: failure.retryAt === undefined,
    });
    const correlationId = `deletion:${claim.id}`;
    await this.client.$transaction(async (transaction) => {
      const updated = await transaction.$executeRawUnsafe(
        `UPDATE public.deletion_requests
         SET status = 'failed',
             execute_after = COALESCE($3, execute_after),
             error_message = $4,
             impact_manifest = jsonb_set(
               CASE WHEN jsonb_typeof(impact_manifest) = 'object'
                 THEN impact_manifest ELSE jsonb_build_object('original', impact_manifest) END,
               '{_jobs}',
               COALESCE(
                 (CASE WHEN jsonb_typeof(impact_manifest) = 'object'
                   THEN impact_manifest ELSE '{}'::jsonb END)->'_jobs',
                 '{}'::jsonb
               ) || $5::jsonb,
               true
             )
         WHERE id = $1 AND status = 'executing' AND xmin::text = $2`,
        claim.id,
        claim.claimToken,
        failure.retryAt ?? null,
        failure.error,
        metadata,
      );
      if (updated !== 1) throw new ClaimLostError("deletion", claim.id);
      await this.insertDeletionAuditOutbox(transaction, {
        requestId: claim.id,
        entityId: claim.entityId,
        correlationId,
        action: failure.retryAt === undefined ? "deletion.failed" : "deletion.retry_scheduled",
        eventType: failure.retryAt === undefined ? "deletion.failed" : "deletion.retry_scheduled",
        occurredAt: failure.failedAt,
        idempotencyKey: `deletion:${claim.id}:failure:${failure.attempt}`,
        payload: {
          requestId: claim.id,
          entityType: claim.entityType,
          entityId: claim.entityId,
          attempt: failure.attempt,
          retryAt: failure.retryAt?.toISOString() ?? null,
          failedParticipant: failure.failedParticipant ?? null,
        },
      });
    });
  }

  private async recordDeletionCompletion(
    claim: ClaimedDeletionRequest,
    plan: DeletionImpactPlan,
    completedAt: Date,
  ): Promise<void> {
    const correlationId = `deletion:${claim.id}`;
    const planMetadata = JSON.stringify({
      completedRegistryVersion: plan.registryVersion,
      participants: plan.participants.map(({ name, order, impact }) => ({ name, order, impact })),
    });
    await this.client.$transaction(async (transaction) => {
      const updated = await transaction.$executeRawUnsafe(
        `UPDATE public.deletion_requests
         SET status = 'completed', completed_at = $3, error_message = NULL,
             impact_manifest = jsonb_set(
               CASE WHEN jsonb_typeof(impact_manifest) = 'object'
                 THEN impact_manifest ELSE jsonb_build_object('original', impact_manifest) END,
               '{_jobs}',
               COALESCE(
                 (CASE WHEN jsonb_typeof(impact_manifest) = 'object'
                   THEN impact_manifest ELSE '{}'::jsonb END)->'_jobs',
                 '{}'::jsonb
               ) || $4::jsonb,
               true
             )
         WHERE id = $1
           AND status = 'executing'
           AND xmin::text = $2
           AND legal_hold = false
           AND confirmed_at IS NOT NULL
           AND impact_registry_version = $5
           AND execute_after <= $3
           AND recovery_until <= $3
           AND requested_at + INTERVAL '7 days' <= $3`,
        claim.id,
        claim.claimToken,
        completedAt,
        planMetadata,
        plan.registryVersion,
      );
      if (updated !== 1) throw new ClaimLostError("deletion", claim.id);
      await this.insertDeletionAuditOutbox(transaction, {
        requestId: claim.id,
        entityId: claim.entityId,
        correlationId,
        action: "deletion.completed",
        eventType: "deletion.completed",
        occurredAt: completedAt,
        idempotencyKey: `deletion:${claim.id}:completed:v${plan.registryVersion}`,
        payload: {
          requestId: claim.id,
          entityType: claim.entityType,
          entityId: claim.entityId,
          registryVersion: plan.registryVersion,
          participants: plan.participants.map((participant) => participant.name),
        },
      });
    });
  }

  private async insertDeletionAuditOutbox(
    transaction: Prisma.TransactionClient,
    input: {
      readonly requestId: string;
      readonly entityId: string;
      readonly correlationId: string;
      readonly action: string;
      readonly eventType: string;
      readonly occurredAt: Date;
      readonly idempotencyKey: string;
      readonly payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await transaction.$executeRawUnsafe(
      `INSERT INTO public.audit_events
         (actor_subject, actor_type, action, entity_type, entity_id, correlation_id, change_summary)
       VALUES ('system:jobs', 'system', $1, 'deletion_request', $2, $3, $4::jsonb)`,
      input.action,
      input.requestId,
      input.correlationId,
      JSON.stringify(input.payload),
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO public.outbox_events
         (aggregate_type, aggregate_id, event_type, payload, correlation_id,
          occurred_at, idempotency_key, available_at)
       VALUES ('deletion_request', $1, $2, $3::jsonb, $4, $5, $6, $5)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      input.requestId,
      input.eventType,
      JSON.stringify(input.payload),
      input.correlationId,
      input.occurredAt,
      input.idempotencyKey,
    );
  }

  private async claimOutboxEvents(input: {
    readonly now: Date;
    readonly limit: number;
    readonly leaseTimeoutMs: number;
  }): Promise<readonly ClaimedOutboxEvent[]> {
    const staleBefore = new Date(input.now.getTime() - input.leaseTimeoutMs);
    const rows = await this.client.$queryRawUnsafe<RawOutboxClaim[]>(
      `WITH candidates AS (
         SELECT id
         FROM public.outbox_events
         WHERE (
           (status IN ('pending', 'failed') AND available_at <= $1)
           OR (status = 'processing' AND locked_at <= $2)
         )
         ORDER BY occurred_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT $3
       )
       UPDATE public.outbox_events AS event
       SET status = 'processing', locked_at = $1, error_message = NULL
       FROM candidates
       WHERE event.id = candidates.id
       RETURNING
         event.id,
         event.aggregate_type AS "aggregateType",
         event.aggregate_id AS "aggregateId",
         event.event_type AS "eventType",
         event.payload,
         event.correlation_id AS "correlationId",
         event.occurred_at AS "occurredAt",
         event.idempotency_key AS "idempotencyKey",
         event.attempt,
         event.xmin::text AS "claimToken"`,
      input.now,
      staleBefore,
      input.limit,
    );
    return rows.map(outboxClaim);
  }

  private async recordOutboxPublished(
    event: ClaimedOutboxEvent,
    publishedAt: Date,
  ): Promise<void> {
    const updated = await this.client.$executeRawUnsafe(
      `UPDATE public.outbox_events
       SET status = 'published', published_at = $3, locked_at = NULL, error_message = NULL
       WHERE id = $1 AND status = 'processing' AND xmin::text = $2`,
      event.id,
      event.claimToken,
      publishedAt,
    );
    if (updated !== 1) throw new ClaimLostError("outbox", event.id);
  }

  private async recordOutboxFailure(
    event: ClaimedOutboxEvent,
    failure: OutboxFailureRecord,
  ): Promise<void> {
    const updated = await this.client.$executeRawUnsafe(
      `UPDATE public.outbox_events
       SET status = $3::"OutboxStatus", attempt = $4,
           available_at = COALESCE($5, available_at), locked_at = NULL, error_message = $6
       WHERE id = $1 AND status = 'processing' AND xmin::text = $2`,
      event.id,
      event.claimToken,
      failure.deadLetter ? "dead_letter" : "failed",
      failure.attempt,
      failure.retryAt ?? null,
      failure.error,
    );
    if (updated !== 1) throw new ClaimLostError("outbox", event.id);
  }

  private async claimGmailSyncJobs(input: {
    readonly now: Date;
    readonly limit: number;
    readonly leaseTimeoutMs: number;
  }): Promise<readonly ClaimedGmailSyncJob[]> {
    const staleBefore = new Date(input.now.getTime() - input.leaseTimeoutMs);
    const rows = await this.client.$queryRawUnsafe<RawGmailClaim[]>(
      `WITH candidates AS (
         SELECT job.id, state.id AS sync_state_id
         FROM public.scheduled_jobs AS job
         JOIN public.integration_connections AS connection
           ON connection.id = job.entity_id AND connection.provider = 'gmail'
         JOIN public.integration_sync_states AS state
           ON state.integration_connection_id = connection.id
          AND state.checkpoint_type = COALESCE(job.payload->>'checkpointType', 'gmail_history')
         WHERE job.job_type = 'gmail_sync'
           AND job.deleted_at IS NULL
           AND job.archived_at IS NULL
           AND connection.deleted_at IS NULL
           AND connection.status IN ('connected', 'degraded')
           AND (
             (job.status = 'active' AND COALESCE(job.next_run_at, job.run_at) <= $1)
             OR (job.status = 'running' AND job.updated_at <= $2)
           )
         ORDER BY COALESCE(job.next_run_at, job.run_at), job.id
         FOR UPDATE OF job, state SKIP LOCKED
         LIMIT $3
       ), claimed_jobs AS (
         UPDATE public.scheduled_jobs AS job
         SET status = 'running', last_run_at = $1
         FROM candidates
         WHERE job.id = candidates.id
         RETURNING job.*, candidates.sync_state_id, job.xmin::text AS claim_token
       )
       UPDATE public.integration_sync_states AS state
       SET status = 'running', next_retry_at = NULL, last_error_code = NULL
       FROM claimed_jobs
       WHERE state.id = claimed_jobs.sync_state_id
       RETURNING
         claimed_jobs.id,
         claimed_jobs.entity_id AS "integrationConnectionId",
         state.id AS "syncStateId",
         state.checkpoint_type AS "checkpointType",
         state.checkpoint_value AS "checkpointValue",
         COALESCE(claimed_jobs.idempotency_key, 'scheduled-job:' || claimed_jobs.id::text)
           || ':checkpoint:' || COALESCE(state.checkpoint_value, 'initial')
           AS "idempotencyKey",
         claimed_jobs.claim_token AS "claimToken"`,
      input.now,
      staleBefore,
      input.limit,
    );
    return rows;
  }

  private async recordGmailSyncSuccess(
    job: ClaimedGmailSyncJob,
    result: GmailIngestionResult,
    completedAt: Date,
  ): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      const updated = await transaction.$executeRawUnsafe(
        `UPDATE public.scheduled_jobs
         SET status = $3::"ScheduledJobStatus", last_run_at = $4, next_run_at = $5
         WHERE id = $1 AND status = 'running' AND xmin::text = $2`,
        job.id,
        job.claimToken,
        result.nextRunAt === undefined ? "completed" : "active",
        completedAt,
        result.nextRunAt ?? null,
      );
      if (updated !== 1) throw new ClaimLostError("Gmail scheduled job", job.id);
      const stateUpdated = await transaction.$executeRawUnsafe(
        `UPDATE public.integration_sync_states
         SET checkpoint_value = $3, status = 'idle', last_synced_at = $4,
             next_retry_at = NULL, last_error_code = NULL
         WHERE id = $1 AND integration_connection_id = $2`,
        job.syncStateId,
        job.integrationConnectionId,
        result.checkpointValue,
        completedAt,
      );
      if (stateUpdated !== 1) throw new ClaimLostError("Gmail sync state", job.syncStateId);
    });
  }

  private async recordGmailSyncFailure(
    job: ClaimedGmailSyncJob,
    failure: GmailSyncFailureRecord,
  ): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      const updated = await transaction.$executeRawUnsafe(
        `UPDATE public.scheduled_jobs
         SET status = $3::"ScheduledJobStatus", next_run_at = $4, last_run_at = $5
         WHERE id = $1 AND status = 'running' AND xmin::text = $2`,
        job.id,
        job.claimToken,
        failure.jobStatus,
        failure.retryAt ?? null,
        failure.failedAt,
      );
      if (updated !== 1) throw new ClaimLostError("Gmail scheduled job", job.id);
      const stateUpdated = await transaction.$executeRawUnsafe(
        `UPDATE public.integration_sync_states
         SET status = $3::"IntegrationSyncStatus", next_retry_at = $4, last_error_code = $5
         WHERE id = $1 AND integration_connection_id = $2`,
        job.syncStateId,
        job.integrationConnectionId,
        failure.status,
        failure.retryAt ?? null,
        failure.errorCode,
      );
      if (stateUpdated !== 1) throw new ClaimLostError("Gmail sync state", job.syncStateId);
      if (failure.status === "revoked") {
        await transaction.$executeRawUnsafe(
          `UPDATE public.integration_connections SET status = 'revoked' WHERE id = $1`,
          job.integrationConnectionId,
        );
      }
    });
  }
}

export function createPostgresJobsRepositories(client: PrismaClient): {
  readonly deletion: DeletionRepository;
  readonly outbox: OutboxRepository;
  readonly gmail: GmailSyncRepository;
} {
  const repository = new PostgresJobsRepository(client);
  return {
    deletion: repository.deletion,
    outbox: repository.outbox,
    gmail: repository.gmail,
  };
}
