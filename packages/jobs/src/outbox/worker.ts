import { addMilliseconds, exponentialBackoff, type BackoffPolicy } from "../backoff";
import { safeErrorMessage } from "../errors";
import type { RunOnceWorker, WorkerBatchResult } from "../worker";
import type { ClaimedOutboxEvent, EventPublisher, OutboxRepository } from "./contracts";

export interface OutboxWorkerOptions {
  readonly repository: OutboxRepository;
  readonly publisher: EventPublisher;
  readonly batchSize?: number;
  readonly leaseTimeoutMs?: number;
  readonly maximumAttempts?: number;
  readonly backoff?: BackoffPolicy;
  readonly clock?: () => Date;
}

export class OutboxWorker implements RunOnceWorker<WorkerBatchResult> {
  private readonly repository: OutboxRepository;
  private readonly publisher: EventPublisher;
  private readonly batchSize: number;
  private readonly leaseTimeoutMs: number;
  private readonly maximumAttempts: number;
  private readonly backoff: BackoffPolicy;
  private readonly clock: () => Date;

  constructor(options: OutboxWorkerOptions) {
    this.repository = options.repository;
    this.publisher = options.publisher;
    this.batchSize = options.batchSize ?? 50;
    this.leaseTimeoutMs = options.leaseTimeoutMs ?? 60_000;
    this.maximumAttempts = options.maximumAttempts ?? 10;
    this.backoff = options.backoff ?? exponentialBackoff();
    this.clock = options.clock ?? (() => new Date());
  }

  async runOnce(signal?: AbortSignal): Promise<WorkerBatchResult> {
    if (signal?.aborted) return { claimed: 0, succeeded: 0, failed: 0, deadLettered: 0 };
    const events = await this.repository.claimDue({
      now: this.clock(),
      limit: this.batchSize,
      leaseTimeoutMs: this.leaseTimeoutMs,
    });
    let succeeded = 0;
    let failed = 0;
    let deadLettered = 0;
    for (const event of events) {
      if (signal?.aborted) break;
      const outcome = await this.dispatch(event, signal);
      if (outcome === "published") succeeded += 1;
      else {
        failed += 1;
        if (outcome === "dead_letter") deadLettered += 1;
      }
    }
    return { claimed: events.length, succeeded, failed, deadLettered };
  }

  private async dispatch(
    event: ClaimedOutboxEvent,
    signal?: AbortSignal,
  ): Promise<"published" | "retry" | "dead_letter"> {
    try {
      await this.publisher.publish(event, {
        idempotencyKey: event.idempotencyKey,
        correlationId: event.correlationId,
        ...(signal === undefined ? {} : { signal }),
      });
      await this.repository.recordPublished(event, this.clock());
      return "published";
    } catch (error) {
      const attempt = event.attempt + 1;
      const deadLetter = attempt >= this.maximumAttempts;
      const failedAt = this.clock();
      await this.repository.recordFailure(event, {
        attempt,
        error: safeErrorMessage(error),
        failedAt,
        deadLetter,
        ...(deadLetter
          ? {}
          : { retryAt: addMilliseconds(failedAt, this.backoff.delayMs(attempt)) }),
      });
      return deadLetter ? "dead_letter" : "retry";
    }
  }
}
