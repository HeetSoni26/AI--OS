import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { EdgeData, HubKey, NodeData } from "@aios/contracts";
import { getNodeTypeDefinition, hubRegistry } from "@aios/graph";

export type PositionedGraphNode = SimulationNodeDatum & {
  id: string;
  data: NodeData;
};

export type PositionedGraphEdge = SimulationLinkDatum<PositionedGraphNode> & {
  id: string;
  data: EdgeData;
  source: PositionedGraphNode | string;
  target: PositionedGraphNode | string;
};

export type SimulationSnapshot = Readonly<{
  nodes: readonly PositionedGraphNode[];
  edges: readonly PositionedGraphEdge[];
}>;

type Listener = (snapshot: SimulationSnapshot) => void;

function primaryHub(node: NodeData): HubKey | null {
  if (node.type === "hub") return node.metadata.hubKey;
  return node.hubKeys[0] ?? null;
}

function stableSeed(id: string, axis: "x" | "y") {
  let hash = axis === "x" ? 17 : 31;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 33 + id.charCodeAt(index)) | 0;
  return ((Math.abs(hash) % 1000) / 1000 - 0.5) * 120;
}

/** Owns a single incremental D3 simulation and preserves node physics across API reconciliations. */
export class GraphSimulationController {
  private width = 800;
  private height = 600;
  private listeners = new Set<Listener>();
  private nodes: PositionedGraphNode[] = [];
  private edges: PositionedGraphEdge[] = [];
  private reducedMotion = false;
  private readonly simulation: Simulation<PositionedGraphNode, PositionedGraphEdge>;

  constructor() {
    this.simulation = forceSimulation<PositionedGraphNode, PositionedGraphEdge>(this.nodes)
      .alphaDecay(0.035)
      .velocityDecay(0.35)
      .on("tick", () => this.publish());
    this.configureForces();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy() {
    this.simulation.stop();
    this.listeners.clear();
  }

  snapshot(): SimulationSnapshot {
    return { nodes: this.nodes, edges: this.edges };
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    this.simulation.alphaDecay(reduced ? 0.16 : 0.035);
    if (reduced) {
      this.simulation.stop();
      this.simulation.tick(60);
      this.publish();
    } else if (this.simulation.alpha() > this.simulation.alphaMin()) {
      this.simulation.restart();
    }
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.width = width;
    this.height = height;
    this.configureForces();
    this.simulation.alpha(0.22);
    if (this.reducedMotion) {
      this.simulation.stop();
      this.simulation.tick(24);
      this.publish();
    } else {
      this.simulation.restart();
    }
  }

  reconcile(nodeData: readonly NodeData[], edgeData: readonly EdgeData[]) {
    const previousNodeIds = new Set(this.nodes.map((node) => node.id));
    const previousEdgeIds = new Set(this.edges.map((edge) => edge.id));
    const structuralChange = previousNodeIds.size !== nodeData.length
      || previousEdgeIds.size !== edgeData.length
      || nodeData.some((node) => !previousNodeIds.has(node.id))
      || edgeData.some((edge) => !previousEdgeIds.has(edge.id));
    const existing = new Map(this.nodes.map((node) => [node.id, node]));
    const nextNodes = nodeData.map((data) => {
      const current = existing.get(data.id);
      if (current) {
        current.data = data;
        if (data.position?.fixed) {
          current.fx = data.position.x;
          current.fy = data.position.y;
        }
        return current;
      }
      const hub = primaryHub(data);
      const hint = hub ? hubRegistry[hub].normalizedPosition : { x: 0, y: 0 };
      const x = data.position?.x ?? this.width / 2 + hint.x * this.width * 0.32 + stableSeed(data.id, "x");
      const y = data.position?.y ?? this.height / 2 + hint.y * this.height * 0.32 + stableSeed(data.id, "y");
      const node: PositionedGraphNode = { id: data.id, data, x, y };
      if (data.position?.fixed) {
        node.fx = data.position.x;
        node.fy = data.position.y;
      }
      return node;
    });
    const nodeIds = new Set(nextNodes.map((node) => node.id));
    this.nodes = nextNodes;
    this.edges = edgeData
      .filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId))
      .map((data) => ({ id: data.id, data, source: data.sourceNodeId, target: data.targetNodeId }));
    this.simulation.nodes(this.nodes);
    this.configureForces();
    // Metadata-only updates reuse the settled simulation; structural changes get a bounded reheat.
    this.simulation.alpha(structuralChange ? (this.reducedMotion ? 0.28 : 0.55) : 0.08);
    if (this.reducedMotion) {
      this.simulation.stop();
      this.simulation.tick(structuralChange ? 60 : 4);
      this.publish();
    } else {
      this.simulation.restart();
    }
  }

  beginDrag(nodeId: string) {
    const node = this.nodes.find((entry) => entry.id === nodeId);
    if (!node) return;
    node.fx = node.x ?? this.width / 2;
    node.fy = node.y ?? this.height / 2;
    this.simulation.alphaTarget(this.reducedMotion ? 0 : 0.18).restart();
  }

  drag(nodeId: string, x: number, y: number) {
    const node = this.nodes.find((entry) => entry.id === nodeId);
    if (!node) return;
    node.fx = x;
    node.fy = y;
    this.publish();
  }

  endDrag(nodeId: string) {
    const node = this.nodes.find((entry) => entry.id === nodeId);
    if (!node) return;
    if (!node.data.position?.fixed && node.data.type !== "hub") {
      node.fx = null;
      node.fy = null;
    }
    this.simulation.alphaTarget(0);
  }

  private hubTarget(node: PositionedGraphNode, axis: "x" | "y") {
    const key = primaryHub(node.data);
    const normalized = key ? hubRegistry[key].normalizedPosition[axis] : 0;
    const size = axis === "x" ? this.width : this.height;
    return size / 2 + normalized * size * 0.36;
  }

  private configureForces() {
    const link = forceLink<PositionedGraphNode, PositionedGraphEdge>(this.edges)
      .id((node) => node.id)
      .distance((edge) => edge.data.type === "ownership" ? 86 : 112)
      .strength((edge) => edge.data.type === "ownership" ? 0.52 : 0.22);
    this.simulation
      .force("link", link)
      .force("charge", forceManyBody<PositionedGraphNode>().strength((node) => node.data.type === "hub" ? -540 : -145).distanceMax(420))
      .force("collision", forceCollide<PositionedGraphNode>().radius((node) => getNodeTypeDefinition(node.data.type).radius + 17).strength(0.9))
      .force("hub-x", forceX<PositionedGraphNode>((node) => this.hubTarget(node, "x")).strength((node) => node.data.type === "hub" ? 0.42 : 0.075))
      .force("hub-y", forceY<PositionedGraphNode>((node) => this.hubTarget(node, "y")).strength((node) => node.data.type === "hub" ? 0.42 : 0.075));
  }

  private publish() {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export function edgeEndpointId(endpoint: PositionedGraphNode | string): string {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}
