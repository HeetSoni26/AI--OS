import { describe, expect, it } from "vitest";
import { emptyGraphEventState, reduceGraphRealtimeEvent, type GraphEventState } from "./events";
import {
  AGENT_GRAPH_ID,
  CLIENT_ENTITY_ID,
  CLIENT_GRAPH_ID,
  INVOICE_GRAPH_ID,
  makeAgent,
  makeClient,
  makeEdge,
  makeInvoice,
  TEST_NOW,
} from "./test-helpers";

const eventBase = { schemaVersion: 1 as const, occurredAt: TEST_NOW };
const CLIENT_IDENTITY = { nodeId: CLIENT_GRAPH_ID, stableKey: `client:${CLIENT_ENTITY_ID}`, entityId: CLIENT_ENTITY_ID };
const BETA_GRAPH_ID = "00000000-0000-4000-8000-000000000105";
const BETA_ENTITY_ID = "00000000-0000-4000-8000-000000000205";
const MISSING_GRAPH_ID = "00000000-0000-4000-8000-000000000999";
const initial: GraphEventState = {
  ...emptyGraphEventState,
  nodes: [makeClient(), makeAgent(), makeInvoice()],
  edges: [makeEdge()],
};

describe("safe graph realtime reducer", () => {
  it("rejects malformed input without changing state", () => {
    const result = reduceGraphRealtimeEvent(initial, { event: "node_deleted", payload: { nodeId: CLIENT_GRAPH_ID } });
    expect(result).toMatchObject({ accepted: false, duplicate: false, refetchRequired: false, reason: "invalid_event" });
    expect(result.state).toBe(initial);
  });

  it("applies create/update/delete events by graph UUID while retaining source identities", () => {
    const createdNode = makeClient({ id: BETA_GRAPH_ID, stableKey: `client:${BETA_ENTITY_ID}`, entityId: BETA_ENTITY_ID, label: "Beta Realty", metadata: { name: "Beta Realty", industry: "Realty", mrr: 1_000, status: "onboarding", startDate: null, projectsCount: 0 } });
    const created = reduceGraphRealtimeEvent(initial, { ...eventBase, eventId: "event:create", channel: "graph:updates", event: "node_created", payload: { node: createdNode } });
    expect(created.state.nodes).toHaveLength(4);
    expect(created.state.effects.at(-1)).toEqual({ kind: "node_entrance", nodeId: BETA_GRAPH_ID });

    const updated = reduceGraphRealtimeEvent(created.state, { ...eventBase, eventId: "event:update", channel: "graph:updates", event: "node_updated", payload: { nodeId: BETA_GRAPH_ID, stableKey: createdNode.stableKey, entityId: BETA_ENTITY_ID, changes: { label: "Beta Group", metadata: { mrr: 2_000 } } } });
    expect(updated.state.nodes.find((node) => node.id === BETA_GRAPH_ID)).toMatchObject({ stableKey: `client:${BETA_ENTITY_ID}`, entityId: BETA_ENTITY_ID, label: "Beta Group", metadata: { name: "Beta Realty", mrr: 2_000 } });
    expect(updated.state.effects.at(-1)).toEqual({ kind: "node_pulse", nodeId: BETA_GRAPH_ID });

    const deleted = reduceGraphRealtimeEvent(updated.state, { ...eventBase, eventId: "event:delete", channel: "graph:updates", event: "node_deleted", payload: CLIENT_IDENTITY });
    expect(deleted.state.nodes.some((node) => node.id === CLIENT_GRAPH_ID)).toBe(false);
    expect(deleted.state.edges).toHaveLength(0);
    expect(deleted.state.effects).toContainEqual({ kind: "edge_dissolve", edgeId: "edge:1" });
  });

  it("applies edge events only when graph UUID endpoints exist", () => {
    const edge = makeEdge({ id: "edge:2", targetNodeId: INVOICE_GRAPH_ID, type: "data_flow" });
    const created = reduceGraphRealtimeEvent(initial, { ...eventBase, eventId: "event:edge-create", channel: "graph:updates", event: "edge_created", payload: { edge } });
    expect(created.state.edges).toContainEqual(edge);
    const deleted = reduceGraphRealtimeEvent(created.state, { ...eventBase, eventId: "event:edge-delete", channel: "graph:updates", event: "edge_deleted", payload: { edgeId: "edge:2" } });
    expect(deleted.state.edges).not.toContainEqual(edge);

    const missing = reduceGraphRealtimeEvent(initial, { ...eventBase, eventId: "event:edge-missing", channel: "graph:updates", event: "edge_created", payload: { edge: makeEdge({ id: "edge:bad", targetNodeId: MISSING_GRAPH_ID }) } });
    expect(missing).toMatchObject({ accepted: false, refetchRequired: true, reason: "missing_entity" });
  });

  it("updates agent status and run outcome visual states", () => {
    const running = reduceGraphRealtimeEvent(initial, { ...eventBase, eventId: "event:running", channel: "agent:status", event: "status_changed", payload: { agentId: AGENT_GRAPH_ID, status: "running" } });
    expect(running.state.nodes.find((node) => node.id === AGENT_GRAPH_ID)).toMatchObject({ status: "running", action: "active_running", metadata: { status: "running" } });
    expect(running.state.effects.at(-1)).toEqual({ kind: "agent_running_ring", nodeId: AGENT_GRAPH_ID });

    const completed = reduceGraphRealtimeEvent(running.state, { ...eventBase, eventId: "event:complete", channel: "agent:status", event: "run_completed", payload: { agentId: AGENT_GRAPH_ID, runId: "run:1", summary: "Built chatbot" } });
    expect(completed.state.effects.at(-1)).toEqual({ kind: "agent_completion_check", nodeId: AGENT_GRAPH_ID });

    const failed = reduceGraphRealtimeEvent(completed.state, { ...eventBase, eventId: "event:fail", channel: "agent:status", event: "run_failed", payload: { agentId: AGENT_GRAPH_ID, runId: "run:2", error: "Provider down" } });
    expect(failed.state.nodes.find((node) => node.id === AGENT_GRAPH_ID)).toMatchObject({ status: "error", action: "failed" });
    expect(failed.state.effects.at(-1)).toEqual({ kind: "agent_error_state", nodeId: AGENT_GRAPH_ID });
  });

  it("applies payment and notification events", () => {
    const paid = reduceGraphRealtimeEvent(initial, { ...eventBase, eventId: "event:paid", channel: "finance:updates", event: "payment_received", payload: { invoiceId: INVOICE_GRAPH_ID, amount: 5_000 } });
    expect(paid.state.nodes.find((node) => node.id === INVOICE_GRAPH_ID)).toMatchObject({ status: "paid", action: "completed", metadata: { status: "paid" } });
    expect(paid.state.effects.at(-1)).toEqual({ kind: "payment_glow", nodeId: INVOICE_GRAPH_ID });

    const notified = reduceGraphRealtimeEvent(paid.state, { ...eventBase, eventId: "event:notification", channel: "notifications:new", event: "notification", payload: { notification: { id: "notification:1", title: "Payment received", message: "Acme paid", severity: "success", relatedNodeId: INVOICE_GRAPH_ID, createdAt: TEST_NOW } } });
    expect(notified.state.notifications[0]?.title).toBe("Payment received");
  });

  it("is idempotent and requests authoritative refetch for missed entities", () => {
    const event = { ...eventBase, eventId: "event:once", channel: "graph:updates", event: "node_deleted", payload: CLIENT_IDENTITY };
    const first = reduceGraphRealtimeEvent(initial, event);
    const duplicate = reduceGraphRealtimeEvent(first.state, event);
    expect(duplicate).toMatchObject({ accepted: false, duplicate: true, refetchRequired: false });

    const missing = reduceGraphRealtimeEvent(initial, { ...eventBase, eventId: "event:missing", channel: "graph:updates", event: "node_deleted", payload: { nodeId: MISSING_GRAPH_ID, stableKey: "client:missing", entityId: null } });
    expect(missing).toMatchObject({ accepted: false, refetchRequired: true, reason: "missing_entity" });
  });

  it("rejects partial metadata updates that violate the discriminated contract", () => {
    const result = reduceGraphRealtimeEvent(initial, { ...eventBase, eventId: "event:bad-update", channel: "graph:updates", event: "node_updated", payload: { ...CLIENT_IDENTITY, changes: { metadata: { mrr: -1 } } } });
    expect(result).toMatchObject({ accepted: false, refetchRequired: true, reason: "invalid_node_update" });
  });
});
