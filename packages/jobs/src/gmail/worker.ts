import { addMilliseconds, exponentialBackoff, type BackoffPolicy } from "../backoff";
import { safeErrorMessage } from "../errors";
import type { RunOnceWorker, WorkerBatchResult } from "../worker";
import type {
  ClaimedGmailSyncJob,
  GmailIngestionFailureKind,
  GmailIngestionService,
  GmailSyncFailureRecord,
  GmailSyncRepository,
} from "./contracts";
import { GmailIngestionError as TypedGmailIngestionError } from "./contracts";

export interface GmailSyncWorkerOptions {
  readonly repository: GmailSyncRepository;
  readonly ingestionService: GmailIngestionService;
  readonly batchSize?: number;
  readonly leaseTimeoutMs?: number;
  readonly backoff?: BackoffPolicy;
  readonly clock?: () => Date;
}

interface ClassifiedFailure {
  readonly kind: GmailIngestionFailureKind;
  readonly retryAfterMs?: number;
  readonly safeCode: string;
}

function safeProviderCode(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,100}$/u.test(value)
    ? value
    : undefined;
}

function classifyFailure(error: unknown): ClassifiedFailure {
  if (error instanceof TypedGmailIngestionError) {
    return {
      kind: error.kind,
      safeCode: error.safeCode ?? `gmail_${error.kind}`,
      ...(error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs }),
    };
  }
  if (error !== null && typeof error === "object" && "kind" in error) {
    const providerError = error as {
      readonly kind?: unknown;
      readonly providerCode?: unknown;
      readonly retryAfterMs?: unknown;
    };
    const safeCode = safeProviderCode(providerError.providerCode);
    const retryAfterMs = typeof providerError.retryAfterMs === "number"
      && Number.isFinite(providerError.retryAfterMs)
      && providerError.retryAfterMs >= 0
      ? providerError.retryAfterMs
      : undefined;
    if (providerError.kind === "revoked") {
      return { kind: "revoked", safeCode: safeCode ?? "gmail_revoked" };
    }
    if (providerError.kind === "rate_limit") {
      return {
        kind: "rate_limited",
        safeCode: safeCode ?? "gmail_rate_limited",
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      };
    }
    if (["timeout", "transient", "conflict"].includes(String(providerError.kind))) {
      return {
        kind: "transient",
        safeCode: safeCode ?? "gmail_transient",
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      };
    }
    if (["authentication", "authorization", "validation", "cancelled"].includes(String(providerError.kind))) {
      return { kind: "permanent", safeCode: safeCode ?? `gmail_${String(providerError.kind)}` };
    }
  }
  return { kind: "transient", safeCode: "gmail_transient" };
}

export class GmailSyncWorker implements RunOnceWorker<WorkerBatchResult> {
  private readonly repository: GmailSyncRepository;
  private readonly ingestionService: GmailIngestionService;
  private readonly batchSize: number;
  private readonly leaseTimeoutMs: number;
  private readonly backoff: BackoffPolicy;
  private readonly clock: () => Date;

  constructor(options: GmailSyncWorkerOptions) {
    this.repository = options.repository;
    this.ingestionService = options.ingestionService;
    this.batchSize = options.batchSize ?? 10;
    this.leaseTimeoutMs = options.leaseTimeoutMs ?? 5 * 60_000;
    this.backoff = options.backoff ?? exponentialBackoff({ baseDelayMs: 30_000 });
    this.clock = options.clock ?? (() => new Date());
  }

  async runOnce(signal?: AbortSignal): Promise<WorkerBatchResult> {
    if (signal?.aborted) return { claimed: 0, succeeded: 0, failed: 0 };
    const jobs = await this.repository.claimDue({
      now: this.clock(),
      limit: this.batchSize,
      leaseTimeoutMs: this.leaseTimeoutMs,
    });
    let succeeded = 0;
    let failed = 0;
    for (const job of jobs) {
      if (signal?.aborted) break;
      if (await this.runJob(job, signal)) succeeded += 1;
      else failed += 1;
    }
    return { claimed: jobs.length, succeeded, failed };
  }

  private async runJob(job: ClaimedGmailSyncJob, signal?: AbortSignal): Promise<boolean> {
    try {
      const result = await this.ingestionService.ingest({
        integrationConnectionId: job.integrationConnectionId,
        checkpointType: job.checkpointType,
        checkpointValue: job.checkpointValue,
        idempotencyKey: job.idempotencyKey,
        ...(signal === undefined ? {} : { signal }),
      });
      if (!result.checkpointValue.trim()) {
        throw new TypedGmailIngestionError("Gmail ingestion returned an invalid checkpoint.", {
          kind: "permanent",
          safeCode: "invalid_checkpoint",
        });
      }
      await this.repository.recordSuccess(job, result, this.clock());
      return true;
    } catch (error) {
      const classified = classifyFailure(error);
      const failure = this.failureRecord(classified, error);
      await this.repository.recordFailure(job, failure);
      return false;
    }
  }

  private failureRecord(classified: ClassifiedFailure, error: unknown): GmailSyncFailureRecord {
    const failedAt = this.clock();
    if (classified.kind === "revoked") {
      return {
        status: "revoked",
        jobStatus: "failed",
        error: safeErrorMessage(error),
        errorCode: classified.safeCode,
        failedAt,
      };
    }
    if (classified.kind === "permanent") {
      return {
        status: "error",
        jobStatus: "failed",
        error: safeErrorMessage(error),
        errorCode: classified.safeCode,
        failedAt,
      };
    }
    const delayMs = classified.retryAfterMs ?? this.backoff.delayMs(1);
    return {
      status: classified.kind === "rate_limited" ? "rate_limited" : "error",
      jobStatus: "active",
      error: safeErrorMessage(error),
      errorCode: classified.safeCode,
      failedAt,
      retryAt: addMilliseconds(failedAt, delayMs),
    };
  }
}
