"use client";

import { useEffect, useMemo, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import {
  graphRealtimeEventSchema,
  type GraphRealtimeEvent,
  type GraphResponse,
} from "@aios/contracts";
import { reduceGraphRealtimeEvent, type GraphEventState } from "@aios/graph";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { graphQueryKeys } from "./graph-api";

const GRAPH_UPDATE_EVENTS = [
  "node_created",
  "node_updated",
  "node_deleted",
  "edge_created",
  "edge_deleted",
] as const;
const MAX_SEEN_EVENT_IDS = 1_000;
const AUTH_SUBJECT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type GraphUpdateEvent = Extract<GraphRealtimeEvent, { channel: "graph:updates" }>;

export type GraphRealtimeStatus =
  | "connected"
  | "reconnecting"
  | "unavailable"
  | "unconfigured";

class BoundedEventIds {
  private readonly eventIds = new Set<string>();

  has(eventId: string): boolean {
    return this.eventIds.has(eventId);
  }

  add(eventId: string): void {
    this.eventIds.add(eventId);
    if (this.eventIds.size <= MAX_SEEN_EVENT_IDS) return;
    const oldestEventId = this.eventIds.values().next().value;
    if (oldestEventId) this.eventIds.delete(oldestEventId);
  }
}

function nodeIdsAffectedByEvent(
  event: GraphUpdateEvent,
  graph: GraphResponse | undefined,
): readonly string[] {
  switch (event.event) {
    case "node_created":
      return [event.payload.node.id];
    case "node_updated":
    case "node_deleted":
      return [event.payload.nodeId];
    case "edge_created":
      return [event.payload.edge.sourceNodeId, event.payload.edge.targetNodeId];
    case "edge_deleted": {
      const edge = graph?.edges.find((item) => item.id === event.payload.edgeId);
      return edge ? [edge.sourceNodeId, edge.targetNodeId] : [];
    }
  }
}

function eventAnnouncement(event: GraphUpdateEvent, graph: GraphResponse | undefined): string {
  switch (event.event) {
    case "node_created":
      return `${event.payload.node.label} added to the graph.`;
    case "node_updated": {
      const current = graph?.nodes.find((node) => node.id === event.payload.nodeId);
      return `${event.payload.changes.label ?? current?.label ?? "A graph node"} updated.`;
    }
    case "node_deleted": {
      const current = graph?.nodes.find((node) => node.id === event.payload.nodeId);
      return current ? `${current.label} removed from the graph.` : "A graph node was removed.";
    }
    case "edge_created":
      return "A graph relationship was added.";
    case "edge_deleted":
      return "A graph relationship was removed.";
  }
}

function eventState(graph: GraphResponse): GraphEventState {
  return {
    nodes: graph.nodes,
    edges: graph.edges,
    notifications: [],
    effects: [],
    announcements: [],
    appliedEventIds: [],
  };
}

function invalidateAffectedQueries(
  queryClient: QueryClient,
  event: GraphUpdateEvent,
  affectedNodeIds: readonly string[],
): void {
  const invalidations = affectedNodeIds.map((nodeId) =>
    queryClient.invalidateQueries({ queryKey: graphQueryKeys.detail(nodeId), exact: true }),
  );

  if (event.event.startsWith("node_")) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: graphQueryKeys.directoryRoot() }),
      queryClient.invalidateQueries({ queryKey: graphQueryKeys.searchRoot() }),
    );
  }

  void Promise.all(invalidations);
}

function reconcileAuthoritativeGraph(queryClient: QueryClient): void {
  void Promise.all([
    queryClient.invalidateQueries({
      queryKey: graphQueryKeys.complete(),
      exact: true,
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: graphQueryKeys.directoryRoot(),
      refetchType: "active",
    }),
  ]);
}

function applyGraphEvent(
  queryClient: QueryClient,
  event: GraphUpdateEvent,
  announce: (message: string) => void,
): void {
  const graph = queryClient.getQueryData<GraphResponse>(graphQueryKeys.complete());
  const affectedNodeIds = nodeIdsAffectedByEvent(event, graph);

  if (graph) {
    const reduction = reduceGraphRealtimeEvent(eventState(graph), event);
    if (reduction.accepted) {
      queryClient.setQueryData<GraphResponse>(graphQueryKeys.complete(), {
        ...graph,
        nodes: [...reduction.state.nodes],
        edges: [...reduction.state.edges],
      });
    } else if (reduction.refetchRequired) {
      void queryClient.invalidateQueries({
        queryKey: graphQueryKeys.complete(),
        exact: true,
      });
    }
  } else {
    void queryClient.invalidateQueries({
      queryKey: graphQueryKeys.complete(),
      exact: true,
    });
  }

  invalidateAffectedQueries(queryClient, event, affectedNodeIds);
  announce(eventAnnouncement(event, graph));
}

/**
 * Reconciles the complete graph cache against authenticated, owner-scoped private broadcasts.
 * Broadcast payloads remain untrusted until they pass the shared graph event schema.
 */
export function useGraphRealtime(announce: (message: string) => void): GraphRealtimeStatus {
  const queryClient = useQueryClient();
  const supabase = useMemo(() => {
    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);
  const [status, setStatus] = useState<GraphRealtimeStatus>(
    supabase ? "unavailable" : "unconfigured",
  );

  useEffect(() => {
    if (!supabase) {
      setStatus("unconfigured");
      return;
    }

    const controller = new AbortController();
    const seenEventIds = new BoundedEventIds();
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let hasSubscribed = false;
    let wasDisconnected = false;

    const handlePayload = (payload: unknown) => {
      if (controller.signal.aborted) return;
      const parsed = graphRealtimeEventSchema.safeParse(payload);
      if (!parsed.success || parsed.data.channel !== "graph:updates") return;
      const event = parsed.data as GraphUpdateEvent;
      if (seenEventIds.has(event.eventId)) return;
      seenEventIds.add(event.eventId);
      applyGraphEvent(queryClient, event, announce);
    };

    const subscribe = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (controller.signal.aborted) return;
      const subject = data.user?.id.trim();
      if (error || !subject || !AUTH_SUBJECT_PATTERN.test(subject)) {
        setStatus("unavailable");
        return;
      }

      try {
        await supabase.realtime.setAuth();
      } catch {
        if (!controller.signal.aborted) setStatus("unavailable");
        return;
      }
      if (controller.signal.aborted) return;

      channel = supabase.channel(`owner:${subject}:graph:updates`, {
        config: {
          private: true,
          broadcast: { ack: false, self: false },
        },
      });

      for (const eventName of GRAPH_UPDATE_EVENTS) {
        channel.on<GraphUpdateEvent>(
          "broadcast",
          { event: eventName },
          (message) => handlePayload(message.payload),
        );
      }

      channel.subscribe((nextStatus) => {
        if (controller.signal.aborted) return;
        if (nextStatus === "SUBSCRIBED") {
          const isReconnect = hasSubscribed && wasDisconnected;
          hasSubscribed = true;
          wasDisconnected = false;
          setStatus("connected");
          if (isReconnect) reconcileAuthoritativeGraph(queryClient);
          return;
        }

        if (
          nextStatus === "CHANNEL_ERROR"
          || nextStatus === "TIMED_OUT"
          || nextStatus === "CLOSED"
        ) {
          wasDisconnected = true;
          setStatus(hasSubscribed ? "reconnecting" : "unavailable");
        }
      });
    };

    void subscribe();

    return () => {
      controller.abort();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [announce, queryClient, supabase]);

  return status;
}
