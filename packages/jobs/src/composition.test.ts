import type { PrismaClient } from "@aios/data";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  composeJobsRuntime,
  createRealtimePublisherFromEnvironment,
} from "./composition";
import type { EventPublisher } from "./outbox/contracts";
import type { JobsLogRecord, OutboxDispatchSink } from "./outbox/publisher";
import type { StorageObjectRemover } from "./storage";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OWNER_SUBJECT = "00000000-0000-4000-8000-000000000002";
const CLIENT_ID = "00000000-0000-4000-8000-000000000003";

function rawOutboxEvent(eventType = "client.archived") {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    aggregateType: "client",
    aggregateId: CLIENT_ID,
    eventType,
    payload: {
      schemaVersion: 1,
      ownerId: OWNER_ID,
      payload: {},
    },
    correlationId: "test:correlation",
    occurredAt: NOW,
    idempotencyKey: `test:${eventType}:${CLIENT_ID}`,
    attempt: 0,
    claimToken: "lease-1",
  };
}

function fakeDatabase(events: readonly ReturnType<typeof rawOutboxEvent>[] = []): PrismaClient {
  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue(events),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    $disconnect: vi.fn(),
    ownerAccount: {
      findFirst: vi.fn().mockResolvedValue({ authSubject: OWNER_SUBJECT }),
    },
    graphNode: {
      findUnique: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000020",
        stableKey: `client:${CLIENT_ID}`,
        entityId: CLIENT_ID,
      }),
    },
  } as unknown as PrismaClient;
}

const storage: StorageObjectRemover = {
  configured: false,
  remove: vi.fn().mockResolvedValue(undefined),
};
const dispatchSink: OutboxDispatchSink = {
  mode: "local_only",
  dispatch: vi.fn().mockResolvedValue(undefined),
};

const realtimeEnvironment = {
  AIOS_REALTIME_ENABLED: "true",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-test-value",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("realtime jobs composition", () => {
  it("keeps realtime honestly unconfigured when Supabase environment is absent", async () => {
    const database = fakeDatabase();
    expect(createRealtimePublisherFromEnvironment({}, database, vi.fn())).toBeUndefined();

    const records: JobsLogRecord[] = [];
    const runtime = await composeJobsRuntime(
      { environment: "development" },
      {
        processEnvironment: {},
        database,
        storage,
        dispatchSink,
        logger: (record) => records.push(record),
      },
    );

    expect(records).toContainEqual(expect.objectContaining({
      component: "runtime",
      message: "Jobs runtime composed.",
      realtimeBroadcast: "not_configured",
    }));
    expect(runtime.capabilities?.outboxDispatch).toBe("local_only");
    await runtime.close?.();
    expect(database.$disconnect).not.toHaveBeenCalled();
  });

  it("defaults the explicit realtime gate off even when Supabase credentials exist", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const publisher = createRealtimePublisherFromEnvironment({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "server-only-test-value",
    }, fakeDatabase(), vi.fn());

    expect(publisher).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("composes a gated private realtime publisher without making a network call", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const publisher = createRealtimePublisherFromEnvironment({
      AIOS_REALTIME_ENABLED: "true",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "server-only-test-value",
      AIOS_SUPABASE_REALTIME_TIMEOUT_MS: "1000",
    }, fakeDatabase(), vi.fn());

    expect(publisher).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("runs realtime-only with an honest local-only external status", async () => {
    const database = fakeDatabase([rawOutboxEvent()]);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));
    const records: JobsLogRecord[] = [];
    const runtime = await composeJobsRuntime(
      { environment: "production" },
      {
        processEnvironment: realtimeEnvironment,
        database,
        storage,
        logger: (record) => records.push(record),
      },
    );

    await expect(runtime.workers.outbox!.runOnce()).resolves.toEqual({
      claimed: 1,
      succeeded: 1,
      failed: 0,
      deadLettered: 0,
    });
    expect(runtime.capabilities?.outboxDispatch).toBe("local_only");
    expect(records).toContainEqual(expect.objectContaining({
      dispatchMode: "local_only",
      externalPublished: false,
    }));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://project.supabase.co/realtime/v1/api/broadcast",
    );
    expect(JSON.stringify(records)).not.toContain(realtimeEnvironment.SUPABASE_SERVICE_ROLE_KEY);
  });

  it("keeps external HTTP and realtime enabled as independent fan-out destinations", async () => {
    const database = fakeDatabase([rawOutboxEvent()]);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 202 }));
    const runtime = await composeJobsRuntime(
      { environment: "production" },
      {
        processEnvironment: {
          ...realtimeEnvironment,
          AIOS_OUTBOX_DISPATCH_URL: "https://events.example.test/outbox",
          AIOS_OUTBOX_DISPATCH_TOKEN: "external-test-token",
        },
        database,
        storage,
        logger: vi.fn(),
      },
    );

    await expect(runtime.workers.outbox!.runOnce()).resolves.toEqual({
      claimed: 1,
      succeeded: 1,
      failed: 0,
      deadLettered: 0,
    });
    expect(runtime.capabilities?.outboxDispatch).toBe("external_idempotent_http");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      "https://events.example.test/outbox",
      "https://project.supabase.co/realtime/v1/api/broadcast",
    ]));
  });

  it("sends unrelated events to the regular sink while skipping realtime", async () => {
    const database = fakeDatabase([rawOutboxEvent("communication.created")]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const dispatch: OutboxDispatchSink = {
      mode: "external_idempotent_http",
      dispatch: vi.fn().mockResolvedValue(undefined),
    };
    const runtime = await composeJobsRuntime(
      { environment: "production" },
      {
        processEnvironment: realtimeEnvironment,
        database,
        storage,
        dispatchSink: dispatch,
        logger: vi.fn(),
      },
    );

    await expect(runtime.workers.outbox!.runOnce()).resolves.toEqual({
      claimed: 1,
      succeeded: 1,
      failed: 0,
      deadLettered: 0,
    });
    expect(dispatch.dispatch).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(database.ownerAccount.findFirst).not.toHaveBeenCalled();
  });

  it("reports configured composition when a realtime publisher is injected", async () => {
    const records: JobsLogRecord[] = [];
    const realtimePublisher: EventPublisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    const runtime = await composeJobsRuntime(
      { environment: "production" },
      {
        processEnvironment: {},
        database: fakeDatabase(),
        storage,
        dispatchSink,
        realtimePublisher,
        logger: (record) => records.push(record),
      },
    );

    expect(records).toContainEqual(expect.objectContaining({
      realtimeBroadcast: "supabase_private",
    }));
    await runtime.close?.();
  });

  it("requires complete server-only Supabase configuration only when realtime is enabled", () => {
    const secret = "server-only-test-value";
    expect(createRealtimePublisherFromEnvironment({
      SUPABASE_SERVICE_ROLE_KEY: secret,
    }, fakeDatabase(), vi.fn())).toBeUndefined();
    expect(() => createRealtimePublisherFromEnvironment({
      AIOS_REALTIME_ENABLED: "true",
      SUPABASE_SERVICE_ROLE_KEY: secret,
    }, fakeDatabase(), vi.fn())).toThrow("Supabase Realtime is enabled but not configured");
    try {
      createRealtimePublisherFromEnvironment({
        AIOS_REALTIME_ENABLED: "true",
        SUPABASE_SERVICE_ROLE_KEY: secret,
      }, fakeDatabase(), vi.fn());
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it("rejects ambiguous realtime gate values", () => {
    expect(() => createRealtimePublisherFromEnvironment({
      AIOS_REALTIME_ENABLED: "yes",
    }, fakeDatabase(), vi.fn())).toThrow("AIOS_REALTIME_ENABLED must be either true or false.");
  });
});
