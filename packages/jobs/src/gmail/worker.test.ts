import { describe, expect, it } from "vitest";

import type {
  ClaimedGmailSyncJob,
  GmailIngestionResult,
  GmailIngestionService,
  GmailSyncFailureRecord,
  GmailSyncRepository,
} from "./contracts";
import { GmailIngestionError } from "./contracts";
import { GmailSyncWorker } from "./worker";

const NOW = new Date("2026-07-31T12:00:00.000Z");

function job(): ClaimedGmailSyncJob {
  return {
    id: "00000000-0000-4000-8000-000000000020",
    integrationConnectionId: "00000000-0000-4000-8000-000000000021",
    syncStateId: "00000000-0000-4000-8000-000000000022",
    checkpointType: "gmail_history",
    checkpointValue: "1000",
    idempotencyKey: "gmail-sync-job-key",
    claimToken: "lease-1",
  };
}

class FakeGmailRepository implements GmailSyncRepository {
  readonly initialCheckpoint: string | null;
  readonly failures: GmailSyncFailureRecord[] = [];
  readonly successes: GmailIngestionResult[] = [];
  checkpoint: string | null;

  constructor(readonly current: ClaimedGmailSyncJob) {
    this.initialCheckpoint = current.checkpointValue;
    this.checkpoint = current.checkpointValue;
  }

  async claimDue(): Promise<readonly ClaimedGmailSyncJob[]> {
    return [this.current];
  }

  async recordSuccess(
    _job: ClaimedGmailSyncJob,
    result: GmailIngestionResult,
  ): Promise<void> {
    this.successes.push(result);
    this.checkpoint = result.checkpointValue;
  }

  async recordFailure(
    _job: ClaimedGmailSyncJob,
    failure: GmailSyncFailureRecord,
  ): Promise<void> {
    this.failures.push(failure);
    // The failure seam intentionally cannot receive or update a checkpoint.
  }
}

function worker(repository: FakeGmailRepository, ingestionService: GmailIngestionService): GmailSyncWorker {
  return new GmailSyncWorker({
    repository,
    ingestionService,
    clock: () => NOW,
    backoff: { delayMs: () => 30_000 },
  });
}

describe("GmailSyncWorker", () => {
  it("marks revoked OAuth and does not advance the checkpoint", async () => {
    const repository = new FakeGmailRepository(job());
    const ingestionService: GmailIngestionService = {
      async ingest() {
        throw new GmailIngestionError("Gmail authorization is no longer valid.", {
          kind: "revoked",
          safeCode: "invalid_grant",
        });
      },
    };

    const result = await worker(repository, ingestionService).runOnce();

    expect(repository.checkpoint).toBe(repository.initialCheckpoint);
    expect(repository.successes).toHaveLength(0);
    expect(repository.failures).toEqual([{
      status: "revoked",
      jobStatus: "failed",
      error: "Gmail authorization is no longer valid.",
      errorCode: "invalid_grant",
      failedAt: NOW,
    }]);
    expect(result.failed).toBe(1);
  });

  it("accepts the existing provider-error shape for revoked OAuth", async () => {
    const repository = new FakeGmailRepository(job());
    const ingestionService: GmailIngestionService = {
      async ingest() {
        throw Object.assign(new Error("Gmail authorization is no longer valid."), {
          provider: "gmail",
          kind: "revoked",
          providerCode: "invalid_grant",
          retryable: false,
        });
      },
    };

    await worker(repository, ingestionService).runOnce();

    expect(repository.checkpoint).toBe("1000");
    expect(repository.failures[0]).toMatchObject({
      status: "revoked",
      jobStatus: "failed",
      errorCode: "invalid_grant",
    });
  });

  it("marks rate limits retryable without advancing the checkpoint", async () => {
    const repository = new FakeGmailRepository(job());
    const ingestionService: GmailIngestionService = {
      async ingest() {
        throw new GmailIngestionError("Gmail rate limit exceeded.", {
          kind: "rate_limited",
          retryAfterMs: 90_000,
          safeCode: "userRateLimitExceeded",
        });
      },
    };

    await worker(repository, ingestionService).runOnce();

    expect(repository.checkpoint).toBe("1000");
    expect(repository.failures[0]).toEqual({
      status: "rate_limited",
      jobStatus: "active",
      error: "Gmail rate limit exceeded.",
      errorCode: "userRateLimitExceeded",
      failedAt: NOW,
      retryAt: new Date("2026-07-31T12:01:30.000Z"),
    });
  });

  it("marks unknown failures transient and keeps the checkpoint safe", async () => {
    const repository = new FakeGmailRepository(job());
    const ingestionService: GmailIngestionService = {
      async ingest() {
        throw new Error("network reset");
      },
    };

    await worker(repository, ingestionService).runOnce();

    expect(repository.checkpoint).toBe("1000");
    expect(repository.failures[0]).toMatchObject({
      status: "error",
      jobStatus: "active",
      errorCode: "gmail_transient",
      retryAt: new Date("2026-07-31T12:00:30.000Z"),
    });
  });

  it("advances the checkpoint only after ingestion succeeds", async () => {
    const repository = new FakeGmailRepository(job());
    const nextRunAt = new Date("2026-07-31T12:05:00.000Z");
    const ingestionService: GmailIngestionService = {
      async ingest(input) {
        expect(input.checkpointValue).toBe("1000");
        return { checkpointValue: "1010", nextRunAt };
      },
    };

    const result = await worker(repository, ingestionService).runOnce();

    expect(repository.checkpoint).toBe("1010");
    expect(repository.successes).toEqual([{ checkpointValue: "1010", nextRunAt }]);
    expect(repository.failures).toHaveLength(0);
    expect(result.succeeded).toBe(1);
  });
});
