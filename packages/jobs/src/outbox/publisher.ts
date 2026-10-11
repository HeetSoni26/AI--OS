import type {
  ClaimedOutboxEvent,
  EventPublishContext,
  EventPublisher,
} from "./contracts";
import {
  parseStorageObjectCleanupRequestedPayload,
  type StorageObjectRemover,
} from "../storage";

export type DispatchMode = "local_only" | "external_idempotent_http";

export interface OutboxDispatchSink {
  readonly mode: DispatchMode;
  dispatch(event: ClaimedOutboxEvent, context: EventPublishContext): Promise<void>;
}

export interface JobsLogRecord {
  readonly component: string;
  readonly message: string;
  readonly [key: string]: unknown;
}

export type JobsLogger = (record: JobsLogRecord) => void;

export const jsonStderrLogger: JobsLogger = (record) => {
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), ...record })}\n`);
};

/**
 * A development/standalone sink with deliberately local semantics. It makes no
 * network call and logs externalPublished=false for every acknowledged event.
 */
export class LocalOnlyOutboxDispatchSink implements OutboxDispatchSink {
  readonly mode = "local_only" as const;

  constructor(private readonly logger: JobsLogger = jsonStderrLogger) {}

  async dispatch(event: ClaimedOutboxEvent): Promise<void> {
    this.logger({
      component: "outbox",
      message: "Event acknowledged by local-only dispatch sink.",
      eventId: event.id,
      eventType: event.eventType,
      idempotencyKey: event.idempotencyKey,
      dispatchMode: this.mode,
      externalPublished: false,
    });
  }
}

export interface IdempotentHttpDispatchConfiguration {
  readonly url: string;
  readonly bearerToken: string;
  readonly fetch?: typeof fetch;
}

/**
 * External dispatch is opt-in. The receiver must durably deduplicate the
 * Idempotency-Key header before acknowledging with a 2xx response.
 */
export class IdempotentHttpOutboxDispatchSink implements OutboxDispatchSink {
  readonly mode = "external_idempotent_http" as const;
  private readonly url: string;
  private readonly bearerToken: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(configuration: IdempotentHttpDispatchConfiguration) {
    const url = new URL(configuration.url);
    if (url.protocol !== "https:") throw new Error("External outbox dispatch URL must use HTTPS.");
    this.url = url.href;
    this.bearerToken = configuration.bearerToken.trim();
    if (!this.bearerToken) throw new Error("External outbox dispatch bearer token is required.");
    this.fetchImplementation = configuration.fetch ?? globalThis.fetch;
  }

  async dispatch(event: ClaimedOutboxEvent, context: EventPublishContext): Promise<void> {
    const response = await this.fetchImplementation(this.url, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.bearerToken}`,
        "content-type": "application/json",
        "idempotency-key": context.idempotencyKey,
        "x-correlation-id": context.correlationId,
      },
      body: JSON.stringify({
        id: event.id,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event.payload,
        correlationId: event.correlationId,
        occurredAt: event.occurredAt.toISOString(),
        idempotencyKey: event.idempotencyKey,
      }),
      cache: "no-store",
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
    if (!response.ok) throw new Error(`External outbox dispatch failed with HTTP ${response.status}.`);
  }
}

/** Routes destructive internal events without broadcasting them to subscribers. */
export class ComposedOutboxPublisher implements EventPublisher {
  constructor(
    private readonly dispatchSink: OutboxDispatchSink,
    private readonly storage: StorageObjectRemover,
    private readonly logger: JobsLogger = jsonStderrLogger,
    private readonly realtimePublisher?: EventPublisher,
  ) {}

  async publish(event: ClaimedOutboxEvent, context: EventPublishContext): Promise<void> {
    if (event.eventType === "storage.object_cleanup_requested") {
      const payload = parseStorageObjectCleanupRequestedPayload(event.payload);
      await this.storage.remove(
        [{ bucket: payload.bucket, objectPath: payload.objectPath }],
        context.signal,
      );
      this.logger({
        component: "outbox",
        message: "Storage cleanup event handled internally.",
        eventId: event.id,
        eventType: event.eventType,
        fileId: payload.fileId,
        externalPublished: false,
      });
      return;
    }
    const destinations: Array<() => Promise<void>> = [
      () => this.dispatchSink.dispatch(event, context),
    ];
    const realtimePublisher = this.realtimePublisher;
    if (realtimePublisher) {
      destinations.push(() => realtimePublisher.publish(event, context));
    }
    const outcomes = await Promise.allSettled(
      destinations.map(async (publish) => publish()),
    );
    const failures = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
    );
    if (failures.length === 1) throw failures[0]!.reason;
    if (failures.length > 1) {
      throw new AggregateError(
        failures.map((failure) => failure.reason),
        "Multiple outbox destinations failed.",
      );
    }
  }
}
