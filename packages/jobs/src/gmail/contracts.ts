export type GmailSyncStatus = "idle" | "running" | "rate_limited" | "error" | "revoked";

export interface ClaimedGmailSyncJob {
  readonly id: string;
  readonly integrationConnectionId: string;
  readonly syncStateId: string;
  readonly checkpointType: string;
  readonly checkpointValue: string | null;
  readonly idempotencyKey: string;
  readonly claimToken: string;
}

export interface GmailIngestionInput {
  readonly integrationConnectionId: string;
  readonly checkpointType: string;
  readonly checkpointValue: string | null;
  readonly idempotencyKey: string;
  readonly signal?: AbortSignal;
}

export interface GmailIngestionResult {
  /** Only a successful result is allowed to become the durable checkpoint. */
  readonly checkpointValue: string;
  readonly nextRunAt?: Date;
}

export interface GmailIngestionService {
  ingest(input: GmailIngestionInput): Promise<GmailIngestionResult>;
}

export type GmailIngestionFailureKind = "revoked" | "rate_limited" | "transient" | "permanent";

export class GmailIngestionError extends Error {
  readonly kind: GmailIngestionFailureKind;
  readonly retryAfterMs?: number;
  readonly safeCode?: string;

  constructor(
    message: string,
    options: {
      readonly kind: GmailIngestionFailureKind;
      readonly retryAfterMs?: number;
      readonly safeCode?: string;
    },
  ) {
    super(message);
    this.name = "GmailIngestionError";
    this.kind = options.kind;
    this.retryAfterMs = options.retryAfterMs;
    this.safeCode = options.safeCode;
  }
}

export interface GmailSyncFailureRecord {
  readonly status: Exclude<GmailSyncStatus, "idle" | "running">;
  readonly jobStatus: "active" | "failed";
  readonly error: string;
  readonly errorCode: string;
  readonly failedAt: Date;
  readonly retryAt?: Date;
}

export interface GmailSyncRepository {
  claimDue(input: {
    readonly now: Date;
    readonly limit: number;
    readonly leaseTimeoutMs: number;
  }): Promise<readonly ClaimedGmailSyncJob[]>;
  recordSuccess(
    job: ClaimedGmailSyncJob,
    result: GmailIngestionResult,
    completedAt: Date,
  ): Promise<void>;
  /** Deliberately has no checkpoint argument: failure must never advance it. */
  recordFailure(job: ClaimedGmailSyncJob, failure: GmailSyncFailureRecord): Promise<void>;
}
