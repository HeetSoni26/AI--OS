import type { GraphRealtimeEvent } from "@aios/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  privateRealtimeTopic,
  SupabaseRealtimeBroadcastSink,
} from "./supabase";

const OWNER_SUBJECT = "00000000-0000-4000-8000-000000000002";
const SERVICE_ROLE_KEY = "test-service-role-value";
const event: GraphRealtimeEvent = {
  eventId: "event:1",
  schemaVersion: 1,
  occurredAt: "2026-08-01T12:00:00.000Z",
  channel: "graph:updates",
  event: "node_deleted",
  payload: {
    nodeId: "00000000-0000-4000-8000-000000000020",
    stableKey: "client:00000000-0000-4000-8000-000000000003",
    entityId: "00000000-0000-4000-8000-000000000003",
  },
};
const context = {
  idempotencyKey: "outbox:test:1",
  correlationId: "correlation:test:1",
};

describe("privateRealtimeTopic", () => {
  it("creates owner/auth-scoped topics rather than public global channels", () => {
    expect(privateRealtimeTopic(OWNER_SUBJECT, "graph:updates")).toBe(
      `owner:${OWNER_SUBJECT}:graph:updates`,
    );
    expect(() => privateRealtimeTopic("global", "graph:updates")).toThrow(
      "valid owner authentication subject",
    );
  });
});

describe("SupabaseRealtimeBroadcastSink", () => {
  it("sends the supported private REST Broadcast request with server-only auth", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    const sink = new SupabaseRealtimeBroadcastSink({
      url: "https://project.supabase.co",
      serviceRoleKey: SERVICE_ROLE_KEY,
      fetch: fetchMock,
    });

    await sink.broadcast({ ownerAuthSubject: OWNER_SUBJECT, event }, context);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://project.supabase.co/realtime/v1/api/broadcast");
    expect(init).toMatchObject({ method: "POST", cache: "no-store" });
    const headers = init?.headers as Record<string, string>;
    expect(headers).toMatchObject({
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      "idempotency-key": context.idempotencyKey,
      "x-correlation-id": context.correlationId,
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      messages: [{
        topic: `owner:${OWNER_SUBJECT}:graph:updates`,
        event: "node_deleted",
        payload: event,
        private: true,
      }],
    });
  });

  it("deduplicates acknowledged event/idempotency pairs without suppressing distinct events", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    const sink = new SupabaseRealtimeBroadcastSink({
      url: "http://localhost:54321",
      serviceRoleKey: SERVICE_ROLE_KEY,
      fetch: fetchMock,
    });

    await sink.broadcast({ ownerAuthSubject: OWNER_SUBJECT, event }, context);
    await sink.broadcast({ ownerAuthSubject: OWNER_SUBJECT, event }, context);
    await sink.broadcast({ ownerAuthSubject: OWNER_SUBJECT, event: { ...event, eventId: "event:2" } }, context);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps failed deliveries retryable and returns safe provider errors", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("provider body containing internals", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const sink = new SupabaseRealtimeBroadcastSink({
      url: "https://project.supabase.co",
      serviceRoleKey: SERVICE_ROLE_KEY,
      fetch: fetchMock,
    });

    const first = sink.broadcast({ ownerAuthSubject: OWNER_SUBJECT, event }, context);
    await expect(first).rejects.toThrow("Supabase Realtime broadcast failed with HTTP 503.");
    await expect(first).rejects.not.toThrow(SERVICE_ROLE_KEY);
    await sink.broadcast({ ownerAuthSubject: OWNER_SUBJECT, event }, context);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds requests with an aborting timeout and does not expose credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    const sink = new SupabaseRealtimeBroadcastSink({
      url: "https://project.supabase.co",
      serviceRoleKey: SERVICE_ROLE_KEY,
      fetch: fetchMock,
      timeoutMs: 100,
    });

    const result = sink.broadcast({ ownerAuthSubject: OWNER_SUBJECT, event }, context);
    await expect(result).rejects.toThrow("Supabase Realtime broadcast timed out.");
    await expect(result).rejects.not.toThrow(SERVICE_ROLE_KEY);
  });
});
