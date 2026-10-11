import type { PrismaClient } from "@aios/data";
import { describe, expect, it, vi } from "vitest";

import type { ClaimedOutboxEvent } from "../outbox/contracts";
import { DurableGraphRealtimeMapper } from "./mapper";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OWNER_SUBJECT = "00000000-0000-4000-8000-000000000002";
const CLIENT_ID = "00000000-0000-4000-8000-000000000003";
const CONTACT_ID = "00000000-0000-4000-8000-000000000004";
const CLIENT_GRAPH_ID = "00000000-0000-4000-8000-000000000020";
const CONTACT_GRAPH_ID = "00000000-0000-4000-8000-000000000021";

function outboxEvent(
  eventType: string,
  aggregateId: string,
  payload: Record<string, unknown> = {},
): ClaimedOutboxEvent {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    aggregateType: eventType.split(".")[0]!,
    aggregateId,
    eventType,
    payload: {
      eventId: "00000000-0000-4000-8000-000000000010",
      schemaVersion: 1,
      ownerId: OWNER_ID,
      occurredAt: NOW.toISOString(),
      payload,
    },
    correlationId: "test:correlation",
    occurredAt: NOW,
    idempotencyKey: `test:${eventType}:${aggregateId}`,
    attempt: 0,
    claimToken: "lease-1",
  };
}

function fakeDatabase() {
  return {
    ownerAccount: {
      findFirst: vi.fn().mockResolvedValue({ authSubject: OWNER_SUBJECT }),
    },
    graphNode: {
      findUnique: vi.fn(async ({ where }: { where: { stableKey: string } }) => {
        if (where.stableKey === `client:${CLIENT_ID}`) {
          return { id: CLIENT_GRAPH_ID, stableKey: where.stableKey, entityId: CLIENT_ID, label: "Acme", archivedAt: null, deletedAt: null };
        }
        if (where.stableKey === `contact:${CONTACT_ID}`) {
          return { id: CONTACT_GRAPH_ID, stableKey: where.stableKey, entityId: CONTACT_ID, label: "Primary contact", archivedAt: null, deletedAt: null };
        }
        return null;
      }),
    },
    client: {
      findFirst: vi.fn().mockResolvedValue({
        name: "Acme",
        industry: "Services",
        status: "ACTIVE",
        mrr: { toString: () => "1250" },
        startDate: new Date("2026-01-02T00:00:00.000Z"),
        _count: { projects: 2 },
      }),
    },
    contact: {
      findFirst: vi.fn().mockResolvedValue({
        name: "Primary contact",
        lastContactAt: NOW,
      }),
    },
    graphEdge: {
      findFirst: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000030",
        edgeType: "OWNERSHIP",
        provenance: "SYSTEM_PROJECTION",
        label: "has contact",
        metadata: { projectionVersion: 1, projectionKey: "clients.contacts" },
        createdAt: NOW,
        source: { id: CLIENT_GRAPH_ID },
        target: { id: CONTACT_GRAPH_ID },
      }),
    },
  } as unknown as PrismaClient;
}

describe("DurableGraphRealtimeMapper", () => {
  it("enriches client create and update events from authoritative rows without raw PII", async () => {
    const database = fakeDatabase();
    const mapper = new DurableGraphRealtimeMapper(database);

    const [created] = await mapper.map(outboxEvent("client.created", CLIENT_ID, {
      clientId: CLIENT_ID,
      contactEmail: "must-not-be-broadcast@example.com",
      notes: "must not be broadcast",
    }));
    const [updated] = await mapper.map(outboxEvent("client.updated", CLIENT_ID, {
      clientId: CLIENT_ID,
      token: "must-not-be-broadcast",
    }));

    expect(created).toMatchObject({
      ownerAuthSubject: OWNER_SUBJECT,
      event: {
        event: "node_created",
        payload: {
          node: {
            id: CLIENT_GRAPH_ID,
            stableKey: `client:${CLIENT_ID}`,
            entityId: CLIENT_ID,
            type: "client",
            label: "Acme",
          },
        },
      },
    });
    expect(updated).toMatchObject({
      event: {
        event: "node_updated",
        payload: {
          nodeId: CLIENT_GRAPH_ID,
          stableKey: `client:${CLIENT_ID}`,
          entityId: CLIENT_ID,
          changes: { status: "active" },
        },
      },
    });
    expect(JSON.stringify([created, updated])).not.toContain("must-not-be-broadcast");
    expect(JSON.stringify([created, updated])).not.toContain("contactEmail");
  });

  it("maps archive and delete lifecycle events to minimal node deletion events", async () => {
    const mapper = new DurableGraphRealtimeMapper(fakeDatabase());

    const [archived] = await mapper.map(outboxEvent("client.archived", CLIENT_ID));
    const [deleted] = await mapper.map(outboxEvent("client.deleted", CLIENT_ID));

    const identity = {
      nodeId: CLIENT_GRAPH_ID,
      stableKey: `client:${CLIENT_ID}`,
      entityId: CLIENT_ID,
    };
    expect(archived?.event).toMatchObject({ event: "node_deleted", payload: identity });
    expect(deleted?.event).toMatchObject({ event: "node_deleted", payload: identity });
  });

  it("maps contact creation to an enriched node and its authoritative projected edge", async () => {
    const mapper = new DurableGraphRealtimeMapper(fakeDatabase());

    const messages = await mapper.map(outboxEvent("contact.created", CONTACT_ID, {
      email: "must-not-be-broadcast@example.com",
    }));

    expect(messages.map((message) => message.event.event)).toEqual(["node_created", "edge_created"]);
    expect(messages[1]?.event).toMatchObject({
      eventId: "00000000-0000-4000-8000-000000000010:ownership",
      event: "edge_created",
      payload: {
        edge: {
          sourceNodeId: CLIENT_GRAPH_ID,
          targetNodeId: CONTACT_GRAPH_ID,
          origin: "projection",
          projectionKey: "clients.contacts",
        },
      },
    });
    expect(JSON.stringify(messages)).not.toContain("must-not-be-broadcast@example.com");
  });

  it("maps the graph service durable realtime envelope directly for edge create and delete", async () => {
    const mapper = new DurableGraphRealtimeMapper(fakeDatabase());
    const edge = {
      id: "edge:owner:1",
      type: "assignment",
      sourceNodeId: "00000000-0000-4000-8000-000000000040",
      targetNodeId: CLIENT_GRAPH_ID,
      label: null,
      origin: "owner",
      projectionKey: null,
      createdAt: NOW.toISOString(),
    };
    const realtime = (event: Record<string, unknown>) => outboxEvent("graph.realtime.v1", edge.id, { realtimeEvent: event });

    const [created] = await mapper.map(realtime({
      eventId: "untrusted:replacement",
      schemaVersion: 1,
      occurredAt: "2020-01-01T00:00:00.000Z",
      channel: "graph:updates",
      event: "edge_created",
      payload: { edge },
    }));
    const [deleted] = await mapper.map(realtime({
      eventId: "untrusted:replacement",
      schemaVersion: 1,
      occurredAt: "2020-01-01T00:00:00.000Z",
      channel: "graph:updates",
      event: "edge_deleted",
      payload: { edgeId: edge.id },
    }));

    expect(created).toMatchObject({ ownerAuthSubject: OWNER_SUBJECT, event: { eventId: "00000000-0000-4000-8000-000000000010", occurredAt: NOW.toISOString(), event: "edge_created", payload: { edge } } });
    expect(deleted?.event).toMatchObject({ event: "edge_deleted", payload: { edgeId: edge.id } });
    await expect(mapper.map(outboxEvent("graph.edge.created.v1", edge.id, { edge }))).resolves.toEqual([]);
  });

  it("skips non-graph and destructive internal events without inspecting sensitive payloads", async () => {
    const database = fakeDatabase();
    const mapper = new DurableGraphRealtimeMapper(database);
    const ownerLookup = database.ownerAccount.findFirst;

    await expect(mapper.map(outboxEvent("communication.created", CLIENT_ID, {
      body: "private communication",
      token: "secret",
    }))).resolves.toEqual([]);
    await expect(mapper.map(outboxEvent("storage.object_cleanup_requested", CLIENT_ID, {
      bucket: "client-files",
      objectPath: "private/path",
    }))).resolves.toEqual([]);
    expect(ownerLookup).not.toHaveBeenCalled();
  });
});
