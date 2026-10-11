import type { PrismaClient } from "@aios/data";
import { describe, expect, it, vi } from "vitest";

import { createPostgresJobsRepositories } from "./repository";

function fakeClient(): {
  readonly client: PrismaClient;
  readonly query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async () => []);
  return {
    client: { $queryRawUnsafe: query } as unknown as PrismaClient,
    query,
  };
}

describe("PostgresJobsRepository polling contracts", () => {
  it("claims deletion requests with SKIP LOCKED", async () => {
    const { client, query } = fakeClient();
    await createPostgresJobsRepositories(client).deletion.claimDue({
      now: new Date(), limit: 5, leaseTimeoutMs: 1_000,
    });
    expect(query.mock.calls[0]?.[0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(query.mock.calls[0]?.[0]).toContain("public.deletion_requests");
  });

  it("claims outbox events with SKIP LOCKED", async () => {
    const { client, query } = fakeClient();
    await createPostgresJobsRepositories(client).outbox.claimDue({
      now: new Date(), limit: 5, leaseTimeoutMs: 1_000,
    });
    expect(query.mock.calls[0]?.[0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(query.mock.calls[0]?.[0]).toContain("public.outbox_events");
  });

  it("claims Gmail scheduled jobs and sync state with SKIP LOCKED", async () => {
    const { client, query } = fakeClient();
    await createPostgresJobsRepositories(client).gmail.claimDue({
      now: new Date(), limit: 5, leaseTimeoutMs: 1_000,
    });
    expect(query.mock.calls[0]?.[0]).toContain("FOR UPDATE OF job, state SKIP LOCKED");
    expect(query.mock.calls[0]?.[0]).toContain("job.job_type = 'gmail_sync'");
  });
});
