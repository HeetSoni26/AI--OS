import { describe, expect, it } from "vitest";

import type {
  ClaimedOutboxEvent,
  EventPublisher,
  OutboxFailureRecord,
  OutboxRepository,
} from "./contracts";
import { OutboxWorker } from "./worker";

const NOW = new Date("2026-07-31T12:00:00.000Z");

function event(overrides: Partial<ClaimedOutboxEvent> = {}): ClaimedOutboxEvent {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    aggregateType: "client",
    aggregateId: "00000000-0000-4000-8000-000000000011",
    eventType: "client.updated",
    payload: { clientId: "00000000-0000-4000-8000-000000000011" },
    correlationId: "test:correlation",
    occurredAt: NOW,
    idempotencyKey: "outbox-idempotency-key",
    attempt: 0,
    claimToken: "lease-1",
    ...overrides,
  };
}

class FakeOutboxRepository implements OutboxRepository {
  readonly failures: OutboxFailureRecord[] = [];
  published = 0;
  acknowledgementFailuresRemaining = 0;
  current: ClaimedOutboxEvent | null;

  constructor(initial: ClaimedOutboxEvent) {
    this.current = initial;
  }

  async claimDue(): Promise<readonly ClaimedOutboxEvent[]> {
    return this.current ? [this.current] : [];
  }

  async recordPublished(): Promise<void> {
    if (this.acknowledgementFailuresRemaining > 0) {
      this.acknowledgementFailuresRemaining -= 1;
      throw new Error("database acknowledgement failed");
    }
    this.published += 1;
    this.current = null;
  }

  async recordFailure(current: ClaimedOutboxEvent, failure: OutboxFailureRecord): Promise<void> {
    this.failures.push(failure);
    this.current = failure.deadLetter ? null : { ...current, attempt: failure.attempt };
  }
}

describe("OutboxWorker", () => {
  it("preserves publisher idempotency across an acknowledgement failure and replay", async () => {
    const repository = new FakeOutboxRepository(event());
    repository.acknowledgementFailuresRemaining = 1;
    const deliveredKeys = new Set<string>();
    let deliverySideEffects = 0;
    let publishCalls = 0;
    const publisher: EventPublisher = {
      async publish(_event, context) {
        publishCalls += 1;
        if (!deliveredKeys.has(context.idempotencyKey)) {
          deliveredKeys.add(context.idempotencyKey);
          deliverySideEffects += 1;
        }
      },
    };
    const worker = new OutboxWorker({
      repository,
      publisher,
      clock: () => NOW,
      backoff: { delayMs: () => 500 },
    });

    const first = await worker.runOnce();
    const second = await worker.runOnce();

    expect(first.failed).toBe(1);
    expect(second.succeeded).toBe(1);
    expect(publishCalls).toBe(2);
    expect(deliverySideEffects).toBe(1);
    expect(deliveredKeys).toEqual(new Set(["outbox-idempotency-key"]));
    expect(repository.published).toBe(1);
    expect(repository.failures[0]).toMatchObject({
      attempt: 1,
      deadLetter: false,
      retryAt: new Date("2026-07-31T12:00:00.500Z"),
    });
  });

  it("dead-letters after the configured maximum attempt", async () => {
    const repository = new FakeOutboxRepository(event({ attempt: 2 }));
    const publisher: EventPublisher = {
      async publish() {
        throw new Error("broker rejected event");
      },
    };
    const worker = new OutboxWorker({
      repository,
      publisher,
      maximumAttempts: 3,
      clock: () => NOW,
    });

    const result = await worker.runOnce();

    expect(result).toEqual({ claimed: 1, succeeded: 0, failed: 1, deadLettered: 1 });
    expect(repository.failures).toEqual([{
      attempt: 3,
      error: "broker rejected event",
      failedAt: NOW,
      deadLetter: true,
    }]);
    expect(repository.current).toBeNull();
  });
});
