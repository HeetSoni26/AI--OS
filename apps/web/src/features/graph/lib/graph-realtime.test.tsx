import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import type {
  GraphRealtimeEvent,
  GraphResponse,
  NodeData,
} from "@aios/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { graphQueryKeys } from "./graph-api";
import { useGraphRealtime } from "./graph-realtime";

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: vi.fn(),
}));

const OWNER_SUBJECT = "20000000-0000-4000-8000-000000000001";
const CLIENT_NODE_ID = "00000000-0000-4000-8000-000000000001";
const CONTACT_NODE_ID = "00000000-0000-4000-8000-000000000002";
const TASK_NODE_ID = "00000000-0000-4000-8000-000000000003";
const CLIENT_ENTITY_ID = "10000000-0000-4000-8000-000000000001";
const CONTACT_ENTITY_ID = "10000000-0000-4000-8000-000000000002";
const TASK_ENTITY_ID = "10000000-0000-4000-8000-000000000003";
const OCCURRED_AT = "2026-08-01T12:30:00.000Z";

const clientNode: NodeData = {
  id: CLIENT_NODE_ID,
  stableKey: `client:${CLIENT_ENTITY_ID}`,
  entityId: CLIENT_ENTITY_ID,
  type: "client",
  label: "Atlas Automation",
  summary: "Automation client account",
  status: "active",
  action: "active_running",
  tags: ["automation"],
  hubKeys: ["clients"],
  position: null,
  metadata: {
    name: "Atlas Automation",
    industry: "Automation",
    mrr: 4_000,
    status: "active",
    startDate: "2026-01-12",
    projectsCount: 3,
  },
};

const contactNode: NodeData = {
  id: CONTACT_NODE_ID,
  stableKey: `contact:${CONTACT_ENTITY_ID}`,
  entityId: CONTACT_ENTITY_ID,
  type: "human_contact",
  label: "Account contact",
  summary: null,
  status: "active",
  action: "pending",
  tags: [],
  hubKeys: ["clients"],
  position: null,
  metadata: {
    name: "Account contact",
    role: null,
    company: null,
    email: null,
    lastContact: null,
  },
};

const taskNode: NodeData = {
  id: TASK_NODE_ID,
  stableKey: `task:${TASK_ENTITY_ID}`,
  entityId: TASK_ENTITY_ID,
  type: "task",
  label: "Prepare workflow",
  summary: "Prepare the automation workflow",
  status: "todo",
  action: "pending",
  tags: ["workflow"],
  hubKeys: ["command"],
  position: null,
  metadata: {
    title: "Prepare workflow",
    status: "todo",
    dueDate: null,
    assignedAgentId: null,
    assignedPersonId: null,
  },
};

const graphResponse: GraphResponse = {
  nodes: [clientNode, contactNode],
  edges: [{
    id: "edge:atlas-contact",
    type: "ownership",
    sourceNodeId: CLIENT_NODE_ID,
    targetNodeId: CONTACT_NODE_ID,
    label: "Primary contact",
    origin: "projection",
    projectionKey: "clients",
    createdAt: OCCURRED_AT,
  }],
  generatedAt: OCCURRED_AT,
  revision: "revision:test",
};

type SubscriptionStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";
type BroadcastCallback = (message: { payload: unknown }) => void;

function realtimeMock() {
  const broadcasts = new Map<string, BroadcastCallback>();
  let subscriptionCallback: ((status: SubscriptionStatus) => void) | undefined;
  const channel = {
    on: vi.fn(function (_type: string, filter: { event: string }, callback: BroadcastCallback) {
      broadcasts.set(filter.event, callback);
      return channel;
    }),
    subscribe: vi.fn(function (callback: (status: SubscriptionStatus) => void) {
      subscriptionCallback = callback;
      return channel;
    }),
  };
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: OWNER_SUBJECT } },
        error: null,
      }),
    },
    realtime: { setAuth: vi.fn().mockResolvedValue(undefined) },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn().mockResolvedValue("ok"),
  };

  return {
    broadcasts,
    channel,
    client,
    emit(event: GraphRealtimeEvent | unknown, eventName?: string) {
      const name = eventName ?? (event as GraphRealtimeEvent).event;
      broadcasts.get(name)?.({ payload: event });
    },
    status(nextStatus: SubscriptionStatus) {
      subscriptionCallback?.(nextStatus);
    },
  };
}

function Probe({ announce }: { announce: (message: string) => void }) {
  const status = useGraphRealtime(announce);
  return <p>{status}</p>;
}

function provider(queryClient: QueryClient) {
  return function Provider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function queryClientWithGraph() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(graphQueryKeys.complete(), graphResponse);
  return queryClient;
}

function graphEvent<T extends GraphRealtimeEvent>(event: T): T {
  return event;
}

beforeEach(() => {
  vi.mocked(createSupabaseBrowserClient).mockReset();
});

describe("useGraphRealtime", () => {
  it("reports unconfigured without starting auth or a channel", () => {
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(null);
    render(<Probe announce={vi.fn()} />, { wrapper: provider(queryClientWithGraph()) });
    expect(screen.getByText("unconfigured")).toBeInTheDocument();
  });

  it("authenticates and subscribes to every graph event on the private owner topic", async () => {
    const realtime = realtimeMock();
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(realtime.client as never);
    const { unmount } = render(<Probe announce={vi.fn()} />, {
      wrapper: provider(queryClientWithGraph()),
    });

    await waitFor(() => expect(realtime.client.channel).toHaveBeenCalledWith(
      `owner:${OWNER_SUBJECT}:graph:updates`,
      { config: { private: true, broadcast: { ack: false, self: false } } },
    ));
    expect(realtime.client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(realtime.client.realtime.setAuth).toHaveBeenCalledTimes(1);
    expect(realtime.channel.on.mock.calls.map((call) => call[1].event)).toEqual([
      "node_created",
      "node_updated",
      "node_deleted",
      "edge_created",
      "edge_deleted",
    ]);

    act(() => realtime.status("SUBSCRIBED"));
    expect(screen.getByText("connected")).toBeInTheDocument();
    unmount();
    expect(realtime.client.removeChannel).toHaveBeenCalledWith(realtime.channel);
  });

  it("reports unavailable when the authenticated subject cannot be established", async () => {
    const realtime = realtimeMock();
    realtime.client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("Authentication unavailable"),
    });
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(realtime.client as never);
    render(<Probe announce={vi.fn()} />, { wrapper: provider(queryClientWithGraph()) });

    expect(await screen.findByText("unavailable")).toBeInTheDocument();
    expect(realtime.client.channel).not.toHaveBeenCalled();
  });

  it("skips invalid payloads and duplicate event IDs", async () => {
    const realtime = realtimeMock();
    const announce = vi.fn();
    const queryClient = queryClientWithGraph();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(realtime.client as never);
    render(<Probe announce={announce} />, { wrapper: provider(queryClient) });
    await waitFor(() => expect(realtime.channel.subscribe).toHaveBeenCalled());

    act(() => realtime.emit({ event: "node_updated", payload: { changes: { label: "Untrusted" } } }, "node_updated"));
    expect(queryClient.getQueryData<GraphResponse>(graphQueryKeys.complete())?.nodes[0]?.label).toBe("Atlas Automation");
    expect(announce).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();

    const update = graphEvent({
      eventId: "event:node-update",
      schemaVersion: 1,
      occurredAt: OCCURRED_AT,
      channel: "graph:updates",
      event: "node_updated",
      payload: {
        nodeId: CLIENT_NODE_ID,
        stableKey: clientNode.stableKey,
        entityId: clientNode.entityId,
        changes: { label: "Atlas AI Automation" },
      },
    });
    act(() => {
      realtime.emit(update);
      realtime.emit(update);
    });

    expect(queryClient.getQueryData<GraphResponse>(graphQueryKeys.complete())?.nodes[0]?.label).toBe("Atlas AI Automation");
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Atlas AI Automation updated.");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: graphQueryKeys.detail(CLIENT_NODE_ID), exact: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: graphQueryKeys.directoryRoot() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: graphQueryKeys.searchRoot() });
  });

  it("reconciles node and edge creates, updates, and deletes with announcements", async () => {
    const realtime = realtimeMock();
    const announce = vi.fn();
    const queryClient = queryClientWithGraph();
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(realtime.client as never);
    render(<Probe announce={announce} />, { wrapper: provider(queryClient) });
    await waitFor(() => expect(realtime.channel.subscribe).toHaveBeenCalled());

    const created = graphEvent({
      eventId: "event:node-create",
      schemaVersion: 1,
      occurredAt: OCCURRED_AT,
      channel: "graph:updates",
      event: "node_created",
      payload: { node: taskNode },
    });
    const updated = graphEvent({
      eventId: "event:node-update-task",
      schemaVersion: 1,
      occurredAt: OCCURRED_AT,
      channel: "graph:updates",
      event: "node_updated",
      payload: {
        nodeId: TASK_NODE_ID,
        stableKey: taskNode.stableKey,
        entityId: taskNode.entityId,
        changes: { label: "Prepare production workflow", status: "in_progress" },
      },
    });
    const edgeCreated = graphEvent({
      eventId: "event:edge-create",
      schemaVersion: 1,
      occurredAt: OCCURRED_AT,
      channel: "graph:updates",
      event: "edge_created",
      payload: { edge: {
        id: "edge:atlas-task",
        type: "assignment",
        sourceNodeId: CLIENT_NODE_ID,
        targetNodeId: TASK_NODE_ID,
        label: "Assigned workflow",
        origin: "owner",
        projectionKey: null,
        createdAt: OCCURRED_AT,
      } },
    });
    const edgeDeleted = graphEvent({
      eventId: "event:edge-delete",
      schemaVersion: 1,
      occurredAt: OCCURRED_AT,
      channel: "graph:updates",
      event: "edge_deleted",
      payload: { edgeId: "edge:atlas-task" },
    });
    const deleted = graphEvent({
      eventId: "event:node-delete",
      schemaVersion: 1,
      occurredAt: OCCURRED_AT,
      channel: "graph:updates",
      event: "node_deleted",
      payload: {
        nodeId: TASK_NODE_ID,
        stableKey: taskNode.stableKey,
        entityId: taskNode.entityId,
      },
    });

    act(() => realtime.emit(created));
    expect(queryClient.getQueryData<GraphResponse>(graphQueryKeys.complete())?.nodes).toContainEqual(taskNode);
    act(() => realtime.emit(updated));
    expect(queryClient.getQueryData<GraphResponse>(graphQueryKeys.complete())?.nodes.find((node) => node.id === TASK_NODE_ID)).toMatchObject({ label: "Prepare production workflow", status: "in_progress" });
    act(() => realtime.emit(edgeCreated));
    expect(queryClient.getQueryData<GraphResponse>(graphQueryKeys.complete())?.edges.some((edge) => edge.id === "edge:atlas-task")).toBe(true);
    act(() => realtime.emit(edgeDeleted));
    expect(queryClient.getQueryData<GraphResponse>(graphQueryKeys.complete())?.edges.some((edge) => edge.id === "edge:atlas-task")).toBe(false);
    act(() => realtime.emit(deleted));
    expect(queryClient.getQueryData<GraphResponse>(graphQueryKeys.complete())?.nodes.some((node) => node.id === TASK_NODE_ID)).toBe(false);

    expect(announce.mock.calls.map(([message]) => message)).toEqual([
      "Prepare workflow added to the graph.",
      "Prepare production workflow updated.",
      "A graph relationship was added.",
      "A graph relationship was removed.",
      "Prepare production workflow removed from the graph.",
    ]);
  });

  it("marks disconnects as reconnecting and reconciles authoritative active queries after resubscribe", async () => {
    const realtime = realtimeMock();
    const queryClient = queryClientWithGraph();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    vi.mocked(createSupabaseBrowserClient).mockReturnValue(realtime.client as never);
    render(<Probe announce={vi.fn()} />, { wrapper: provider(queryClient) });
    await waitFor(() => expect(realtime.channel.subscribe).toHaveBeenCalled());

    act(() => realtime.status("SUBSCRIBED"));
    expect(screen.getByText("connected")).toBeInTheDocument();
    invalidate.mockClear();

    act(() => realtime.status("CHANNEL_ERROR"));
    expect(screen.getByText("reconnecting")).toBeInTheDocument();
    act(() => realtime.status("SUBSCRIBED"));
    expect(screen.getByText("connected")).toBeInTheDocument();

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: graphQueryKeys.complete(),
      exact: true,
      refetchType: "active",
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: graphQueryKeys.directoryRoot(),
      refetchType: "active",
    });
  });
});
