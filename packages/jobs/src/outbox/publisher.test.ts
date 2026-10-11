import { describe, expect, it, vi } from "vitest";

import type { StorageObjectRemover } from "../storage";
import type {
  ClaimedOutboxEvent,
  EventPublisher,
  OutboxRepository,
} from "./contracts";
import {
  ComposedOutboxPublisher,
  IdempotentHttpOutboxDispatchSink,
  LocalOnlyOutboxDispatchSink,
  type JobsLogRecord,
  type OutboxDispatchSink,
} from "./publisher";
import { OutboxWorker } from "./worker";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const context = {
  idempotencyKey: "outbox:test:1",
  correlationId: "correlation:test:1",
};

function event(overrides: Partial<ClaimedOutboxEvent> = {}): ClaimedOutboxEvent {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    aggregateType: "client",
    aggregateId: "00000000-0000-4000-8000-000000000011",
    eventType: "client.updated",
    payload: { schemaVersion: 1 },
    correlationId: context.correlationId,
    occurredAt: NOW,
    idempotencyKey: context.idempotencyKey,
    attempt: 0,
    claimToken: "lease-1",
    ...overrides,
  };
}

function storage(): StorageObjectRemover & { remove: ReturnType<typeof vi.fn> } {
  return {
    configured: true,
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

describe("outbox dispatch publishers", () => {
  it("handles storage cleanup internally and never broadcasts or externally dispatches it", async () => {
    const remover = storage();
    const dispatch: OutboxDispatchSink = {
      mode: "external_idempotent_http",
      dispatch: vi.fn().mockResolvedValue(undefined),
    };
    const realtime: EventPublisher = { publish: vi.fn().mockResolvedValue(undefined) };
    const publisher = new ComposedOutboxPublisher(dispatch, remover, vi.fn(), realtime);
    const cleanup = event({
      aggregateType: "file_metadata",
      eventType: "storage.object_cleanup_requested",
      payload: {
        schemaVersion: 1,
        bucket: "client-files",
        objectPath: "owner/client/file.pdf",
        fileId: "00000000-0000-4000-8000-000000000012",
      },
    });

    await publisher.publish(cleanup, context);

    expect(remover.remove).toHaveBeenCalledWith(
      [{ bucket: "client-files", objectPath: "owner/client/file.pdf" }],
      undefined,
    );
    expect(dispatch.dispatch).not.toHaveBeenCalled();
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it("fans out to external dispatch and realtime without losing either destination", async () => {
    const dispatch: OutboxDispatchSink = {
      mode: "external_idempotent_http",
      dispatch: vi.fn().mockResolvedValue(undefined),
    };
    const realtime: EventPublisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    const current = event();
    const publisher = new ComposedOutboxPublisher(dispatch, storage(), vi.fn(), realtime);

    await publisher.publish(current, context);

    expect(dispatch.dispatch).toHaveBeenCalledWith(current, context);
    expect(realtime.publish).toHaveBeenCalledWith(current, context);
  });

  it("supports realtime-only delivery while retaining honest local-only sink semantics", async () => {
    const records: JobsLogRecord[] = [];
    const realtime: EventPublisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    const current = event();
    const publisher = new ComposedOutboxPublisher(
      new LocalOnlyOutboxDispatchSink((record) => records.push(record)),
      storage(),
      vi.fn(),
      realtime,
    );

    await publisher.publish(current, context);

    expect(realtime.publish).toHaveBeenCalledWith(current, context);
    expect(records).toEqual([expect.objectContaining({
      dispatchMode: "local_only",
      externalPublished: false,
    })]);
  });

  it("attempts every configured destination and propagates a required failure", async () => {
    const dispatchError = new Error("external provider unavailable");
    const dispatch: OutboxDispatchSink = {
      mode: "external_idempotent_http",
      dispatch: vi.fn().mockRejectedValue(dispatchError),
    };
    const realtime: EventPublisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    const current = event();
    const publisher = new ComposedOutboxPublisher(dispatch, storage(), vi.fn(), realtime);

    await expect(publisher.publish(current, context)).rejects.toBe(dispatchError);
    expect(dispatch.dispatch).toHaveBeenCalledWith(current, context);
    expect(realtime.publish).toHaveBeenCalledWith(current, context);
  });

  it("leaves the outbox retryable and unacknowledged when configured realtime fails", async () => {
    const current = event();
    const recordPublished = vi.fn().mockResolvedValue(undefined);
    const recordFailure = vi.fn().mockResolvedValue(undefined);
    const repository: OutboxRepository = {
      claimDue: vi.fn().mockResolvedValue([current]),
      recordPublished,
      recordFailure,
    };
    const dispatch: OutboxDispatchSink = {
      mode: "external_idempotent_http",
      dispatch: vi.fn().mockResolvedValue(undefined),
    };
    const realtime: EventPublisher = {
      publish: vi.fn().mockRejectedValue(new Error("realtime provider unavailable")),
    };
    const worker = new OutboxWorker({
      repository,
      publisher: new ComposedOutboxPublisher(dispatch, storage(), vi.fn(), realtime),
      clock: () => NOW,
      backoff: { delayMs: () => 500 },
    });

    await expect(worker.runOnce()).resolves.toEqual({
      claimed: 1,
      succeeded: 0,
      failed: 1,
      deadLettered: 0,
    });
    expect(recordPublished).not.toHaveBeenCalled();
    expect(recordFailure).toHaveBeenCalledWith(current, expect.objectContaining({
      attempt: 1,
      error: "realtime provider unavailable",
      deadLetter: false,
      retryAt: new Date("2026-08-01T12:00:00.500Z"),
    }));
  });

  it("does not claim external publication in local-only mode", async () => {
    const records: JobsLogRecord[] = [];
    const sink = new LocalOnlyOutboxDispatchSink((record) => records.push(record));

    await sink.dispatch(event());

    expect(records).toEqual([expect.objectContaining({
      dispatchMode: "local_only",
      externalPublished: false,
    })]);
  });

  it("preserves the external idempotent HTTP auth, headers, and durable body contract", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const sink = new IdempotentHttpOutboxDispatchSink({
      url: "https://events.example.test/outbox",
      bearerToken: "external-test-token",
      fetch: fetchMock,
    });
    const current = event({ payload: { schemaVersion: 1, safe: true } });

    await sink.dispatch(current, context);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://events.example.test/outbox");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer external-test-token",
      "idempotency-key": context.idempotencyKey,
      "x-correlation-id": context.correlationId,
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      id: current.id,
      aggregateType: current.aggregateType,
      aggregateId: current.aggregateId,
      eventType: current.eventType,
      payload: current.payload,
      correlationId: current.correlationId,
      occurredAt: NOW.toISOString(),
      idempotencyKey: current.idempotencyKey,
    });
  });

  it("returns safe status-only errors from the optional external provider", async () => {
    const token = "external-test-token";
    const sink = new IdempotentHttpOutboxDispatchSink({
      url: "https://events.example.test/outbox",
      bearerToken: token,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("sensitive provider body", { status: 502 })),
    });

    const result = sink.dispatch(event(), context);
    await expect(result).rejects.toThrow("External outbox dispatch failed with HTTP 502.");
    await expect(result).rejects.not.toThrow(token);
  });
});
