import {
  edgeDataSchema,
  graphEdgeCreateInputSchema,
  graphEdgeTypeSchema,
  type EdgeData,
  type GraphEdgeCreateInput,
  type GraphEdgeType,
  type NodeData,
} from "@aios/contracts";

export const relationshipErrorCodes = [
  "SOURCE_NOT_FOUND",
  "TARGET_NOT_FOUND",
  "SELF_REFERENCE",
  "DUPLICATE_EDGE",
  "INVALID_ENDPOINT_TYPES",
  "PROJECTED_EDGE_IMMUTABLE",
] as const;
export type RelationshipErrorCode = (typeof relationshipErrorCodes)[number];

export type RelationshipValidationResult =
  | { valid: true; source: NodeData; target: NodeData }
  | { valid: false; code: RelationshipErrorCode; message: string };

export interface RelationshipValidationContext {
  nodes: readonly NodeData[];
  edges?: readonly EdgeData[];
}

function isFinanceHub(node: NodeData): boolean {
  return node.type === "hub" && node.metadata.hubKey === "finance";
}

const endpointPolicies = {
  ownership: (source: NodeData, target: NodeData) => source.type === "hub" && target.type !== "hub",
  assignment: (source: NodeData, target: NodeData) =>
    (source.type === "ai_agent" || source.type === "human_contact") && (target.type === "task" || target.type === "client"),
  data_flow: (_source: NodeData, _target: NodeData) => true,
  dependency: (source: NodeData, target: NodeData) => source.type !== "hub" && ["tool", "sop", "knowledge_memory", "ai_agent"].includes(target.type),
  trigger: (source: NodeData, target: NodeData) =>
    ["tool", "task", "decision", "knowledge_memory", "hub"].includes(source.type) && ["ai_agent", "tool", "task", "hub"].includes(target.type),
  reference: (_source: NodeData, target: NodeData) => ["sop", "decision", "knowledge_memory"].includes(target.type),
  financial: (source: NodeData, target: NodeData) =>
    [source, target].some((node) => node.type === "revenue_finance" || isFinanceHub(node)) &&
    [source, target].every((node) => node.type === "client" || node.type === "revenue_finance" || isFinanceHub(node)),
} as const satisfies Record<GraphEdgeType, (source: NodeData, target: NodeData) => boolean>;

export const relationshipEndpointPolicy = Object.freeze(endpointPolicies);

export function validateRelationshipCreate(input: GraphEdgeCreateInput, context: RelationshipValidationContext): RelationshipValidationResult {
  const parsed = graphEdgeCreateInputSchema.safeParse(input);
  if (!parsed.success) {
    const selfReference = input.sourceNodeId === input.targetNodeId;
    return {
      valid: false,
      code: selfReference ? "SELF_REFERENCE" : "INVALID_ENDPOINT_TYPES",
      message: selfReference ? "A node cannot relate to itself." : "The relationship input is invalid.",
    };
  }

  const source = context.nodes.find((node) => node.id === parsed.data.sourceNodeId);
  if (!source) return { valid: false, code: "SOURCE_NOT_FOUND", message: "The source node does not exist in the authoritative graph." };
  const target = context.nodes.find((node) => node.id === parsed.data.targetNodeId);
  if (!target) return { valid: false, code: "TARGET_NOT_FOUND", message: "The target node does not exist in the authoritative graph." };

  const duplicate = context.edges?.some(
    (edge) => edge.sourceNodeId === source.id && edge.targetNodeId === target.id && edge.type === parsed.data.type,
  );
  if (duplicate) return { valid: false, code: "DUPLICATE_EDGE", message: "That relationship already exists." };

  if (!endpointPolicies[parsed.data.type](source, target)) {
    return {
      valid: false,
      code: "INVALID_ENDPOINT_TYPES",
      message: `${parsed.data.type} does not support ${source.type} → ${target.type}.`,
    };
  }
  return { valid: true, source, target };
}

export function canDeleteRelationship(edge: EdgeData): { allowed: true } | { allowed: false; code: "PROJECTED_EDGE_IMMUTABLE"; message: string } {
  if (edge.origin === "projection") {
    return {
      allowed: false,
      code: "PROJECTED_EDGE_IMMUTABLE",
      message: "Projected relationships are derived from source truth and must be changed through their owning domain.",
    };
  }
  return { allowed: true };
}

export function createOwnerRelationship(
  id: string,
  input: GraphEdgeCreateInput,
  createdAt: string,
  context: RelationshipValidationContext,
): EdgeData {
  const validation = validateRelationshipCreate(input, context);
  if (!validation.valid) throw new Error(`${validation.code}: ${validation.message}`);
  return edgeDataSchema.parse({ id, ...graphEdgeCreateInputSchema.parse(input), origin: "owner", projectionKey: null, createdAt });
}

export function createProjectedRelationship(
  projectionKey: string,
  edge: Omit<EdgeData, "origin" | "projectionKey">,
): EdgeData {
  graphEdgeTypeSchema.parse(edge.type);
  return edgeDataSchema.parse({ ...edge, origin: "projection", projectionKey });
}
