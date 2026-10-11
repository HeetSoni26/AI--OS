export interface ClaimedOutboxEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: TPayload;
  readonly correlationId: string;
  readonly occurredAt: Date;
  readonly idempotencyKey: string;
  readonly attempt: number;
  readonly claimToken: string;
}

export interface EventPublishContext {
  /** Publishers must deduplicate this key across acknowledged replays. */
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly signal?: AbortSignal;
}

export interface EventPublisher {
  publish(event: ClaimedOutboxEvent, context: EventPublishContext): Promise<void>;
}

export interface OutboxFailureRecord {
  readonly attempt: number;
  readonly error: string;
  readonly failedAt: Date;
  readonly retryAt?: Date;
  readonly deadLetter: boolean;
}

export interface OutboxRepository {
  claimDue(input: {
    readonly now: Date;
    readonly limit: number;
    readonly leaseTimeoutMs: number;
  }): Promise<readonly ClaimedOutboxEvent[]>;
  recordPublished(event: ClaimedOutboxEvent, publishedAt: Date): Promise<void>;
  recordFailure(event: ClaimedOutboxEvent, failure: OutboxFailureRecord): Promise<void>;
}
