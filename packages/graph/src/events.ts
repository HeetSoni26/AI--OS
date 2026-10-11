import {
  graphRealtimeEventSchema,
  nodeDataSchema,
  type EdgeData,
  type GraphNotificationData,
  type GraphRealtimeEvent,
  type NodeData,
} from "@aios/contracts";

export type GraphEffect =
  | { kind: "node_entrance" | "node_pulse" | "node_exit"; nodeId: string }
  | { kind: "edge_draw" | "edge_dissolve"; edgeId: string }
  | { kind: "agent_running_ring" | "agent_completion_check" | "agent_error_state"; nodeId: string }
  | { kind: "payment_glow"; nodeId: string };

export interface GraphEventState {
  nodes: readonly NodeData[];
  edges: readonly EdgeData[];
  notifications: readonly GraphNotificationData[];
  effects: readonly GraphEffect[];
  announcements: readonly string[];
  appliedEventIds: readonly string[];
}

export interface GraphEventReduction {
  state: GraphEventState;
  accepted: boolean;
  duplicate: boolean;
  refetchRequired: boolean;
  reason?: "invalid_event" | "missing_entity" | "invalid_node_update";
}

export const emptyGraphEventState: GraphEventState = Object.freeze({
  nodes: [],
  edges: [],
  notifications: [],
  effects: [],
  announcements: [],
  appliedEventIds: [],
});

function updateNode(state: GraphEventState, nodeId: string, updater: (node: NodeData) => NodeData): GraphEventState | undefined {
  const index = state.nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) return undefined;
  const nodes = [...state.nodes];
  nodes[index] = nodeDataSchema.parse(updater(nodes[index]!));
  return { ...state, nodes };
}

function appendEvent(state: GraphEventState, event: GraphRealtimeEvent): GraphEventState {
  return { ...state, appliedEventIds: [...state.appliedEventIds, event.eventId] };
}

function accepted(state: GraphEventState, event: GraphRealtimeEvent): GraphEventReduction {
  return { state: appendEvent(state, event), accepted: true, duplicate: false, refetchRequired: false };
}

function missing(state: GraphEventState): GraphEventReduction {
  return { state, accepted: false, duplicate: false, refetchRequired: true, reason: "missing_entity" };
}

/** Parses untrusted realtime input before applying immutable, idempotent state transitions. */
export function reduceGraphRealtimeEvent(state: GraphEventState, input: unknown): GraphEventReduction {
  const parsed = graphRealtimeEventSchema.safeParse(input);
  if (!parsed.success) return { state, accepted: false, duplicate: false, refetchRequired: false, reason: "invalid_event" };
  const event = parsed.data;
  if (state.appliedEventIds.includes(event.eventId)) return { state, accepted: false, duplicate: true, refetchRequired: false };

  switch (event.event) {
    case "node_created": {
      const nodes = [...state.nodes.filter((node) => node.id !== event.payload.node.id), event.payload.node];
      return accepted({ ...state, nodes, effects: [...state.effects, { kind: "node_entrance", nodeId: event.payload.node.id }], announcements: [...state.announcements, `${event.payload.node.label} added to the graph.`] }, event);
    }
    case "node_updated": {
      const current = state.nodes.find((node) => node.id === event.payload.nodeId);
      if (!current || current.stableKey !== event.payload.stableKey || current.entityId !== event.payload.entityId) return missing(state);
      const changes = event.payload.changes;
      const candidate = {
        ...current,
        ...changes,
        metadata: changes.metadata === undefined ? current.metadata : { ...current.metadata, ...changes.metadata },
      };
      const validated = nodeDataSchema.safeParse(candidate);
      if (!validated.success) return { state, accepted: false, duplicate: false, refetchRequired: true, reason: "invalid_node_update" };
      const nodes = state.nodes.map((node) => node.id === current.id ? validated.data : node);
      return accepted({ ...state, nodes, effects: [...state.effects, { kind: "node_pulse", nodeId: current.id }], announcements: [...state.announcements, `${validated.data.label} updated.`] }, event);
    }
    case "node_deleted": {
      const node = state.nodes.find((item) => item.id === event.payload.nodeId);
      if (!node || node.stableKey !== event.payload.stableKey || node.entityId !== event.payload.entityId) return missing(state);
      const removedEdges = state.edges.filter((edge) => edge.sourceNodeId === node.id || edge.targetNodeId === node.id);
      return accepted({
        ...state,
        nodes: state.nodes.filter((item) => item.id !== node.id),
        edges: state.edges.filter((edge) => edge.sourceNodeId !== node.id && edge.targetNodeId !== node.id),
        effects: [...state.effects, ...removedEdges.map((edge) => ({ kind: "edge_dissolve" as const, edgeId: edge.id })), { kind: "node_exit", nodeId: node.id }],
        announcements: [...state.announcements, `${node.label} removed from the graph.`],
      }, event);
    }
    case "edge_created": {
      const edge = event.payload.edge;
      if (!state.nodes.some((node) => node.id === edge.sourceNodeId) || !state.nodes.some((node) => node.id === edge.targetNodeId)) return missing(state);
      const edges = [...state.edges.filter((item) => item.id !== edge.id), edge];
      return accepted({ ...state, edges, effects: [...state.effects, { kind: "edge_draw", edgeId: edge.id }], announcements: [...state.announcements, "A graph relationship was added."] }, event);
    }
    case "edge_deleted": {
      if (!state.edges.some((edge) => edge.id === event.payload.edgeId)) return missing(state);
      return accepted({ ...state, edges: state.edges.filter((edge) => edge.id !== event.payload.edgeId), effects: [...state.effects, { kind: "edge_dissolve", edgeId: event.payload.edgeId }], announcements: [...state.announcements, "A graph relationship was removed."] }, event);
    }
    case "status_changed": {
      const action = event.payload.status === "running" ? "active_running" : event.payload.status === "error" ? "failed" : event.payload.status === "scheduled" ? "scheduled" : event.payload.status === "paused" ? "blocked" : null;
      const next = updateNode(state, event.payload.agentId, (node) => {
        if (node.type !== "ai_agent") return node;
        return { ...node, status: event.payload.status, action, metadata: { ...node.metadata, status: event.payload.status } };
      });
      const agent = next?.nodes.find((node) => node.id === event.payload.agentId);
      if (!next || agent?.type !== "ai_agent") return missing(state);
      const effect: GraphEffect | undefined = event.payload.status === "running" ? { kind: "agent_running_ring", nodeId: agent.id } : event.payload.status === "error" ? { kind: "agent_error_state", nodeId: agent.id } : undefined;
      return accepted({ ...next, effects: effect ? [...next.effects, effect] : next.effects, announcements: [...next.announcements, `${agent.label} is ${event.payload.status}.`] }, event);
    }
    case "run_completed": {
      const agent = state.nodes.find((node) => node.id === event.payload.agentId && node.type === "ai_agent");
      if (!agent) return missing(state);
      return accepted({ ...state, effects: [...state.effects, { kind: "agent_completion_check", nodeId: agent.id }], announcements: [...state.announcements, `${agent.label} completed a run: ${event.payload.summary}`] }, event);
    }
    case "run_failed": {
      const next = updateNode(state, event.payload.agentId, (node) => node.type === "ai_agent" ? { ...node, status: "error", action: "failed", metadata: { ...node.metadata, status: "error" } } : node);
      const agent = next?.nodes.find((node) => node.id === event.payload.agentId);
      if (!next || agent?.type !== "ai_agent") return missing(state);
      return accepted({ ...next, effects: [...next.effects, { kind: "agent_error_state", nodeId: agent.id }], announcements: [...next.announcements, `${agent.label} run failed.`] }, event);
    }
    case "payment_received": {
      const next = updateNode(state, event.payload.invoiceId, (node) => node.type === "revenue_finance" ? { ...node, status: "paid", action: "completed", metadata: { ...node.metadata, status: "paid" } } : node);
      const invoice = next?.nodes.find((node) => node.id === event.payload.invoiceId);
      if (!next || invoice?.type !== "revenue_finance") return missing(state);
      return accepted({ ...next, effects: [...next.effects, { kind: "payment_glow", nodeId: invoice.id }], announcements: [...next.announcements, `Payment received for ${invoice.label}.`] }, event);
    }
    case "notification":
      return accepted({ ...state, notifications: [event.payload.notification, ...state.notifications], announcements: [...state.announcements, event.payload.notification.title] }, event);
  }
}
