import { describe, expect, it, vi } from "vitest";

import type {
  ClaimedDeletionRequest,
  ClientDeletionParticipant,
  CustomDeletionImpact,
  DeletionFailureRecord,
  DeletionImpactPlan,
  DeletionIneligibility,
  DeletionRepository,
} from "./contracts";
import { DeletionParticipantRegistry } from "./registry";
import { DeletionWorker } from "./worker";

const NOW = new Date("2026-07-31T12:00:00.000Z");

function claim(overrides: Partial<ClaimedDeletionRequest> = {}): ClaimedDeletionRequest {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    entityType: "client",
    entityId: "00000000-0000-4000-8000-000000000002",
    status: "executing",
    requestedBy: "owner:test",
    requestedAt: new Date("2026-07-20T12:00:00.000Z"),
    executeAfter: new Date("2026-07-27T12:00:00.000Z"),
    recoveryUntil: new Date("2026-07-27T12:00:00.000Z"),
    impactManifest: {},
    impactRegistryVersion: 3,
    legalHold: false,
    confirmedAt: NOW,
    failureAttempt: 0,
    claimToken: "lease-1",
    ...overrides,
  };
}

class FakeDeletionRepository implements DeletionRepository {
  readonly failures: DeletionFailureRecord[] = [];
  readonly completions: DeletionImpactPlan[] = [];
  readonly releases: DeletionIneligibility[] = [];
  completionFailuresRemaining = 0;
  current: ClaimedDeletionRequest | null;

  constructor(initial: ClaimedDeletionRequest) {
    this.current = initial;
  }

  async claimDue(): Promise<readonly ClaimedDeletionRequest[]> {
    return this.current ? [this.current] : [];
  }

  async recheckClaim(): Promise<ClaimedDeletionRequest | null> {
    return this.current;
  }

  async releaseIneligible(
    _claim: ClaimedDeletionRequest,
    ineligibility: DeletionIneligibility,
  ): Promise<void> {
    this.releases.push(ineligibility);
    this.current = null;
  }

  async recordFailure(
    currentClaim: ClaimedDeletionRequest,
    failure: DeletionFailureRecord,
  ): Promise<void> {
    this.failures.push(failure);
    this.current = failure.retryAt
      ? { ...currentClaim, status: "executing", failureAttempt: failure.attempt }
      : null;
  }

  async recordCompletion(
    _claim: ClaimedDeletionRequest,
    plan: DeletionImpactPlan,
  ): Promise<void> {
    if (this.completionFailuresRemaining > 0) {
      this.completionFailuresRemaining -= 1;
      throw new Error("transaction rolled back before acknowledgement");
    }
    this.completions.push(plan);
    this.current = null;
  }
}

function participant(
  name: string,
  order: number,
  calls: string[],
  options: { execute?: () => Promise<void>; kind?: string } = {},
): ClientDeletionParticipant {
  const kind = options.kind ?? "custom";
  return {
    name,
    order,
    kind,
    async plan(context): Promise<CustomDeletionImpact> {
      calls.push(`plan:${name}:dryRun=${context.dryRun}`);
      return { kind };
    },
    async execute(_context, _impact, idempotencyKey): Promise<void> {
      calls.push(`execute:${name}:${idempotencyKey}`);
      await options.execute?.();
    },
  };
}

function worker(
  repository: FakeDeletionRepository,
  participants: readonly ClientDeletionParticipant[],
): DeletionWorker {
  return new DeletionWorker({
    repository,
    registry: new DeletionParticipantRegistry(3, participants),
    clock: () => NOW,
    backoff: { delayMs: () => 1_000 },
  });
}

describe("DeletionWorker", () => {
  it("plans and executes participants in deterministic order before completion", async () => {
    const calls: string[] = [];
    const repository = new FakeDeletionRepository(claim());
    const result = await worker(repository, [
      participant("storage", 20, calls),
      participant("cache", 10, calls),
      participant("database", 10, calls),
    ]).runOnce();

    expect(calls).toEqual([
      "plan:cache:dryRun=true",
      "plan:database:dryRun=true",
      "plan:storage:dryRun=true",
      "execute:cache:deletion:00000000-0000-4000-8000-000000000001:participant:cache:v3",
      "execute:database:deletion:00000000-0000-4000-8000-000000000001:participant:database:v3",
      "execute:storage:deletion:00000000-0000-4000-8000-000000000001:participant:storage:v3",
    ]);
    expect(repository.completions).toHaveLength(1);
    expect(repository.failures).toHaveLength(0);
    expect(result).toEqual({ claimed: 1, succeeded: 1, failed: 0, deferred: 0 });
  });

  it("does not execute an unconfirmed deletion request", async () => {
    const calls: string[] = [];
    const repository = new FakeDeletionRepository(claim({ confirmedAt: null }));

    const result = await worker(repository, [participant("database", 1, calls)]).runOnce();

    expect(calls).toEqual([]);
    expect(repository.releases).toEqual([{ eligible: false, reason: "unconfirmed" }]);
    expect(repository.completions).toHaveLength(0);
    expect(result.deferred).toBe(1);
  });

  it("rechecks and blocks a legal hold without invoking participants", async () => {
    const calls: string[] = [];
    const repository = new FakeDeletionRepository(claim({ legalHold: true }));

    const result = await worker(repository, [participant("database", 1, calls)]).runOnce();

    expect(calls).toEqual([]);
    expect(repository.releases).toEqual([{ eligible: false, reason: "legal_hold" }]);
    expect(repository.completions).toHaveLength(0);
    expect(result.deferred).toBe(1);
  });

  it("stops before the next participant when a legal hold appears during execution", async () => {
    const calls: string[] = [];
    const repository = new FakeDeletionRepository(claim());
    const first = participant("database", 1, calls, {
      execute: async () => {
        repository.current = repository.current
          ? { ...repository.current, legalHold: true }
          : null;
      },
    });

    const result = await worker(repository, [first, participant("storage", 2, calls)]).runOnce();

    expect(calls.some((call) => call.startsWith("execute:database"))).toBe(true);
    expect(calls.some((call) => call.startsWith("execute:storage"))).toBe(false);
    expect(repository.releases).toEqual([{ eligible: false, reason: "legal_hold" }]);
    expect(repository.completions).toHaveLength(0);
    expect(result.deferred).toBe(1);
  });

  it("records a terminal failure when the persisted impact registry version is stale", async () => {
    const calls: string[] = [];
    const repository = new FakeDeletionRepository(claim({ impactRegistryVersion: 2 }));

    const result = await worker(repository, [participant("database", 1, calls)]).runOnce();

    expect(calls).toEqual([]);
    expect(repository.failures).toEqual([{
      error: "Deletion impact registry version 2 does not match worker version 3.",
      failedAt: NOW,
      attempt: 1,
    }]);
    expect(repository.completions).toHaveLength(0);
    expect(result.failed).toBe(1);
  });

  it("enforces seven full days even when executeAfter was set early", async () => {
    const calls: string[] = [];
    const repository = new FakeDeletionRepository(claim({
      requestedAt: new Date("2026-07-25T12:00:00.000Z"),
      executeAfter: new Date("2026-07-30T12:00:00.000Z"),
    }));

    await worker(repository, [participant("database", 1, calls)]).runOnce();

    expect(calls).toEqual([]);
    expect(repository.releases[0]).toEqual({
      eligible: false,
      reason: "recovery_window",
      retryAt: new Date("2026-08-01T12:00:00.000Z"),
    });
  });

  it("records failure and never claims completion when a participant fails", async () => {
    const calls: string[] = [];
    const repository = new FakeDeletionRepository(claim());
    const fail = vi.fn(async () => { throw new Error("storage unavailable"); });

    const result = await worker(repository, [
      participant("database", 1, calls),
      participant("storage", 2, calls, { execute: fail }),
      participant("provider", 3, calls),
    ]).runOnce();

    expect(calls.some((call) => call.startsWith("execute:provider"))).toBe(false);
    expect(repository.completions).toHaveLength(0);
    expect(repository.failures[0]).toMatchObject({
      error: "storage unavailable",
      failedParticipant: "storage",
      attempt: 1,
      retryAt: new Date("2026-07-31T12:00:01.000Z"),
    });
    expect(result.failed).toBe(1);
  });

  it("safely replays idempotent participants after completion acknowledgement rollback", async () => {
    const repository = new FakeDeletionRepository(claim());
    repository.completionFailuresRemaining = 1;
    const destructiveKeys = new Set<string>();
    let destructiveActions = 0;
    let executeCalls = 0;
    const replaySafeParticipant: ClientDeletionParticipant = {
      name: "database",
      order: 1,
      kind: "database_records",
      async plan() {
        return { kind: "database_records", records: [{ table: "clients", count: 1 }] };
      },
      async execute(_context, _impact, idempotencyKey) {
        executeCalls += 1;
        if (!destructiveKeys.has(idempotencyKey)) {
          destructiveKeys.add(idempotencyKey);
          destructiveActions += 1;
        }
      },
    };
    const deletionWorker = worker(repository, [replaySafeParticipant]);

    const first = await deletionWorker.runOnce();
    const second = await deletionWorker.runOnce();

    expect(first.failed).toBe(1);
    expect(second.succeeded).toBe(1);
    expect(executeCalls).toBe(2);
    expect(destructiveActions).toBe(1);
    expect(destructiveKeys).toEqual(new Set([
      "deletion:00000000-0000-4000-8000-000000000001:participant:database:v3",
    ]));
    expect(repository.completions).toHaveLength(1);
  });
});
