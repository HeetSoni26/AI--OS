export const GRAPH_CANVAS_NODE_THRESHOLD = 500 as const;
export const GRAPH_MAX_VISIBLE_NODES = 500 as const;

export type GraphRenderer = "svg" | "canvas" | "list";
export type GraphViewport = "desktop" | "tablet" | "mobile";

export interface RendererPolicyInput {
  nodeCount: number;
  viewport: GraphViewport;
}

export interface RendererPolicyDecision {
  renderer: GraphRenderer;
  reason: "mobile_equivalent_list" | "normal_crisp_svg" | "large_graph_canvas";
  paginationRecommended: boolean;
  maxVisibleNodes: number;
}

/** Pure switch policy only; this package intentionally pins no renderer dependency. */
export function selectGraphRenderer(input: RendererPolicyInput): RendererPolicyDecision {
  if (!Number.isInteger(input.nodeCount) || input.nodeCount < 0) throw new RangeError("nodeCount must be a non-negative integer.");
  if (input.viewport === "mobile") {
    return { renderer: "list", reason: "mobile_equivalent_list", paginationRecommended: input.nodeCount > GRAPH_MAX_VISIBLE_NODES, maxVisibleNodes: GRAPH_MAX_VISIBLE_NODES };
  }
  if (input.nodeCount >= GRAPH_CANVAS_NODE_THRESHOLD) {
    return { renderer: "canvas", reason: "large_graph_canvas", paginationRecommended: input.nodeCount > GRAPH_MAX_VISIBLE_NODES, maxVisibleNodes: GRAPH_MAX_VISIBLE_NODES };
  }
  return { renderer: "svg", reason: "normal_crisp_svg", paginationRecommended: false, maxVisibleNodes: GRAPH_MAX_VISIBLE_NODES };
}
