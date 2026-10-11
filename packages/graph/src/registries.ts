import {
  GRAPH_EDGE_TYPE_LABELS,
  GRAPH_NODE_VISUALS,
  type GraphEdgeType,
  type GraphNodeType,
} from "@aios/contracts";

export const nodeTypeRegistry = Object.freeze(GRAPH_NODE_VISUALS);

export interface EdgeVisualDefinition {
  label: string;
  lineStyle: "solid" | "dashed" | "dotted";
  width: number;
  color: "inherit" | "#808080" | "#FF6B2B" | "#39FF14";
  opacity: number;
  animated: boolean;
  movingDots: boolean;
  arrow: boolean;
  markerIconKey: "dollar" | null;
  accessibleLabel: string;
  accessibleDescription: string;
  reducedMotionDescription: string;
}

export const edgeTypeRegistry = Object.freeze({
  ownership: {
    label: GRAPH_EDGE_TYPE_LABELS.ownership,
    lineStyle: "solid",
    width: 2,
    color: "inherit",
    opacity: 1,
    animated: false,
    movingDots: false,
    arrow: false,
    markerIconKey: null,
    accessibleLabel: "owns or contains",
    accessibleDescription: "The source hub owns or contains the target entity.",
    reducedMotionDescription: "A solid two-pixel line indicates ownership or containment.",
  },
  assignment: {
    label: GRAPH_EDGE_TYPE_LABELS.assignment,
    lineStyle: "dashed",
    width: 1,
    color: "inherit",
    opacity: 1,
    animated: false,
    movingDots: false,
    arrow: false,
    markerIconKey: null,
    accessibleLabel: "is assigned to",
    accessibleDescription: "The source agent or person is assigned to the target task or client.",
    reducedMotionDescription: "A one-pixel dashed line indicates an assignment.",
  },
  data_flow: {
    label: GRAPH_EDGE_TYPE_LABELS.data_flow,
    lineStyle: "dashed",
    width: 1,
    color: "inherit",
    opacity: 1,
    animated: true,
    movingDots: true,
    arrow: false,
    markerIconKey: null,
    accessibleLabel: "sends data to",
    accessibleDescription: "Data moves from the source entity to the target entity.",
    reducedMotionDescription: "A dashed line with a data-flow label replaces moving dots when motion is reduced.",
  },
  dependency: {
    label: GRAPH_EDGE_TYPE_LABELS.dependency,
    lineStyle: "dotted",
    width: 1,
    color: "#808080",
    opacity: 1,
    animated: false,
    movingDots: false,
    arrow: false,
    markerIconKey: null,
    accessibleLabel: "depends on",
    accessibleDescription: "The source entity depends on the target entity.",
    reducedMotionDescription: "A gray dotted line indicates a dependency.",
  },
  trigger: {
    label: GRAPH_EDGE_TYPE_LABELS.trigger,
    lineStyle: "solid",
    width: 1,
    color: "#FF6B2B",
    opacity: 1,
    animated: false,
    movingDots: false,
    arrow: true,
    markerIconKey: null,
    accessibleLabel: "triggers",
    accessibleDescription: "An event from the source entity triggers an action in the target entity.",
    reducedMotionDescription: "A solid orange line and arrow indicate a trigger.",
  },
  reference: {
    label: GRAPH_EDGE_TYPE_LABELS.reference,
    lineStyle: "solid",
    width: 0.5,
    color: "inherit",
    opacity: 0.35,
    animated: false,
    movingDots: false,
    arrow: false,
    markerIconKey: null,
    accessibleLabel: "references",
    accessibleDescription: "The source entity references the target knowledge entity.",
    reducedMotionDescription: "A thin translucent line indicates a reference.",
  },
  financial: {
    label: GRAPH_EDGE_TYPE_LABELS.financial,
    lineStyle: "solid",
    width: 1,
    color: "#39FF14",
    opacity: 1,
    animated: false,
    movingDots: false,
    arrow: false,
    markerIconKey: "dollar",
    accessibleLabel: "has financial relationship with",
    accessibleDescription: "The entities are connected by an invoice, payment, expense, or other money relationship.",
    reducedMotionDescription: "A green line with a dollar marker indicates a financial relationship.",
  },
} as const satisfies Record<GraphEdgeType, EdgeVisualDefinition>);

export function getNodeTypeDefinition(type: GraphNodeType) {
  return nodeTypeRegistry[type];
}

export function getEdgeTypeDefinition(type: GraphEdgeType) {
  return edgeTypeRegistry[type];
}
