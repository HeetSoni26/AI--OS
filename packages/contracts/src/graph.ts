import { z } from "zod";
import { cursorSchema, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./api";

export const graphNodeTypes = [
  "client",
  "ai_agent",
  "tool",
  "sop",
  "human_contact",
  "task",
  "decision",
  "knowledge_memory",
  "revenue_finance",
  "hub",
] as const;
export const graphNodeTypeSchema = z.enum(graphNodeTypes);
export type GraphNodeType = z.infer<typeof graphNodeTypeSchema>;

export const GRAPH_NODE_TYPE_LABELS = {
  client: "Client",
  ai_agent: "AI Agent",
  tool: "Tool",
  sop: "SOP",
  human_contact: "Human / Contact",
  task: "Task",
  decision: "Decision",
  knowledge_memory: "Knowledge / Memory",
  revenue_finance: "Revenue / Finance",
  hub: "Hub (Category)",
} as const satisfies Record<GraphNodeType, string>;

/** Stable semantic icon keys; UI adapters may map these to any icon library. */
export const GRAPH_NODE_VISUALS = {
  client: { label: "Client", color: "#00F0FF", iconKey: "building", radius: 20 },
  ai_agent: { label: "AI Agent", color: "#39FF14", iconKey: "robot-gear", radius: 14 },
  tool: { label: "Tool", color: "#FF6B2B", iconKey: "wrench", radius: 12 },
  sop: { label: "SOP", color: "#CCCCCC", iconKey: "document", radius: 10 },
  human_contact: { label: "Human / Contact", color: "#FFD700", iconKey: "person", radius: 12 },
  task: { label: "Task", color: "#FFFFFF", iconKey: "checkbox", radius: 8 },
  decision: { label: "Decision", color: "#B026FF", iconKey: "lightbulb", radius: 10 },
  knowledge_memory: { label: "Knowledge / Memory", color: "#4488FF", iconKey: "brain", radius: 10 },
  revenue_finance: { label: "Revenue / Finance", color: "#00FF88", iconKey: "dollar", radius: 10 },
  hub: { label: "Hub (Category)", color: "#FFFFFF", iconKey: "custom", radius: 28 },
} as const satisfies Record<GraphNodeType, { label: string; color: `#${string}`; iconKey: string; radius: number }>;

export const graphEdgeTypes = ["ownership", "assignment", "data_flow", "dependency", "trigger", "reference", "financial"] as const;
export const graphEdgeTypeSchema = z.enum(graphEdgeTypes);
export type GraphEdgeType = z.infer<typeof graphEdgeTypeSchema>;

export const GRAPH_EDGE_TYPE_LABELS = {
  ownership: "Ownership",
  assignment: "Assignment",
  data_flow: "Data Flow",
  dependency: "Dependency",
  trigger: "Trigger",
  reference: "Reference",
  financial: "Financial",
} as const satisfies Record<GraphEdgeType, string>;

export const hubKeys = ["command", "clients", "agents", "finance", "pipeline_crm", "content", "knowledge", "automations", "tools"] as const;
export const hubKeySchema = z.enum(hubKeys);
export type HubKey = z.infer<typeof hubKeySchema>;

export const HUB_LABELS = {
  command: "Command",
  clients: "Clients",
  agents: "Agents",
  finance: "Finance",
  pipeline_crm: "Pipeline / CRM",
  content: "Content",
  knowledge: "Knowledge",
  automations: "Automations",
  tools: "Tools",
} as const satisfies Record<HubKey, string>;

export const hubPlacementHints = ["center", "upper_left", "upper_right", "lower_right", "right", "lower_left", "left", "lower_center", "periphery"] as const;
export const hubPlacementHintSchema = z.enum(hubPlacementHints);
export type HubPlacementHint = z.infer<typeof hubPlacementHintSchema>;

export const graphActionStates = ["active_running", "blocked", "completed", "pending", "scheduled", "failed"] as const;
export const graphActionStateSchema = z.enum(graphActionStates);
export type GraphActionState = z.infer<typeof graphActionStateSchema>;

export const GRAPH_ACTION_STATE_LABELS = {
  active_running: "Active / Running",
  blocked: "Blocked",
  completed: "Completed",
  pending: "Pending",
  scheduled: "Scheduled",
  failed: "Failed",
} as const satisfies Record<GraphActionState, string>;

export const graphEntityIdSchema = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/);
/** Persistent GraphNode primary keys and graph-edge endpoints are UUIDs. */
export const graphNodeIdSchema = z.uuid();
/** Source-domain entity IDs are UUIDs when a graph node projects source truth. */
export const graphSourceEntityIdSchema = z.uuid();
export const graphLabelSchema = z.string().trim().min(1).max(255);
export const graphSummarySchema = z.string().trim().min(1).max(1_000);
export const graphIsoDateTimeSchema = z.string().datetime({ offset: true });
export const graphIsoDateSchema = z.iso.date();
export const graphMoneySchema = z.number().finite().nonnegative().max(999_999_999_999.99);

export const graphPositionSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  fixed: z.boolean(),
});
export type GraphPosition = z.infer<typeof graphPositionSchema>;

const nodeBaseShape = {
  id: graphNodeIdSchema,
  stableKey: graphEntityIdSchema,
  entityId: graphSourceEntityIdSchema.nullable(),
  label: graphLabelSchema,
  summary: graphSummarySchema.nullable(),
  status: z.string().trim().min(1).max(100).nullable(),
  action: graphActionStateSchema.nullable(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50),
  hubKeys: z.array(hubKeySchema).max(hubKeys.length),
  position: graphPositionSchema.nullable(),
} as const;

export const clientNodeMetadataSchema = z.strictObject({
  name: graphLabelSchema,
  industry: z.string().trim().min(1).max(100).nullable(),
  mrr: graphMoneySchema,
  status: z.enum(["prospect", "onboarding", "active", "paused", "churned"]),
  startDate: graphIsoDateSchema.nullable(),
  projectsCount: z.number().int().nonnegative(),
});
export const aiAgentNodeMetadataSchema = z.strictObject({
  name: graphLabelSchema,
  status: z.enum(["running", "idle", "error", "scheduled", "paused"]),
  lastRun: graphIsoDateTimeSchema.nullable(),
  tasksCompleted: z.number().int().nonnegative(),
});
export const toolNodeMetadataSchema = z.strictObject({
  name: graphLabelSchema,
  category: z.string().trim().min(1).max(100),
  connectionStatus: z.enum(["connected", "disconnected", "error"]),
  lastSync: graphIsoDateTimeSchema.nullable(),
});
export const sopNodeMetadataSchema = z.strictObject({
  title: graphLabelSchema,
  lastUpdated: graphIsoDateTimeSchema,
  stepsCount: z.number().int().nonnegative(),
  linkedClientIds: z.array(graphNodeIdSchema),
});
export const humanContactNodeMetadataSchema = z.strictObject({
  name: graphLabelSchema,
  role: z.string().trim().min(1).max(150).nullable(),
  company: z.string().trim().min(1).max(255).nullable(),
  email: z.string().email().nullable(),
  lastContact: graphIsoDateTimeSchema.nullable(),
});
export const taskNodeMetadataSchema = z.strictObject({
  title: graphLabelSchema,
  status: z.enum(["backlog", "todo", "in_progress", "blocked", "review", "done", "cancelled"]),
  dueDate: graphIsoDateSchema.nullable(),
  assignedAgentId: graphNodeIdSchema.nullable(),
  assignedPersonId: graphNodeIdSchema.nullable(),
});
export const decisionNodeMetadataSchema = z.strictObject({
  title: graphLabelSchema,
  date: graphIsoDateSchema,
  rationale: z.string().trim().min(1).max(5_000),
  outcome: z.string().trim().min(1).max(5_000).nullable(),
});
export const knowledgeMemoryNodeMetadataSchema = z.strictObject({
  title: graphLabelSchema,
  category: z.string().trim().min(1).max(100),
  lastAccessed: graphIsoDateTimeSchema.nullable(),
  wordCount: z.number().int().nonnegative(),
});
export const revenueFinanceNodeMetadataSchema = z.strictObject({
  amount: graphMoneySchema,
  type: z.enum(["income", "expense"]),
  date: graphIsoDateSchema,
  clientId: graphNodeIdSchema.nullable(),
  status: z.string().trim().min(1).max(100),
});
export const hubNodeMetadataSchema = z.strictObject({
  hubKey: hubKeySchema,
  name: graphLabelSchema,
  entityCount: z.number().int().nonnegative(),
  summaryStat: graphSummarySchema,
});

export type ClientNodeMetadata = z.infer<typeof clientNodeMetadataSchema>;
export type AiAgentNodeMetadata = z.infer<typeof aiAgentNodeMetadataSchema>;
export type ToolNodeMetadata = z.infer<typeof toolNodeMetadataSchema>;
export type SopNodeMetadata = z.infer<typeof sopNodeMetadataSchema>;
export type HumanContactNodeMetadata = z.infer<typeof humanContactNodeMetadataSchema>;
export type TaskNodeMetadata = z.infer<typeof taskNodeMetadataSchema>;
export type DecisionNodeMetadata = z.infer<typeof decisionNodeMetadataSchema>;
export type KnowledgeMemoryNodeMetadata = z.infer<typeof knowledgeMemoryNodeMetadataSchema>;
export type RevenueFinanceNodeMetadata = z.infer<typeof revenueFinanceNodeMetadataSchema>;
export type HubNodeMetadata = z.infer<typeof hubNodeMetadataSchema>;

const createNodeSchema = <TType extends GraphNodeType, TMetadata extends z.ZodType>(type: TType, metadata: TMetadata) =>
  z.strictObject({ ...nodeBaseShape, type: z.literal(type), metadata });

export const clientNodeDataSchema = createNodeSchema("client", clientNodeMetadataSchema);
export const aiAgentNodeDataSchema = createNodeSchema("ai_agent", aiAgentNodeMetadataSchema);
export const toolNodeDataSchema = createNodeSchema("tool", toolNodeMetadataSchema);
export const sopNodeDataSchema = createNodeSchema("sop", sopNodeMetadataSchema);
export const humanContactNodeDataSchema = createNodeSchema("human_contact", humanContactNodeMetadataSchema);
export const taskNodeDataSchema = createNodeSchema("task", taskNodeMetadataSchema);
export const decisionNodeDataSchema = createNodeSchema("decision", decisionNodeMetadataSchema);
export const knowledgeMemoryNodeDataSchema = createNodeSchema("knowledge_memory", knowledgeMemoryNodeMetadataSchema);
export const revenueFinanceNodeDataSchema = createNodeSchema("revenue_finance", revenueFinanceNodeMetadataSchema);
export const hubNodeDataSchema = createNodeSchema("hub", hubNodeMetadataSchema);

/** Metadata is discriminated by node type and every object rejects unknown fields. */
export const nodeDataSchema = z.discriminatedUnion("type", [
  clientNodeDataSchema,
  aiAgentNodeDataSchema,
  toolNodeDataSchema,
  sopNodeDataSchema,
  humanContactNodeDataSchema,
  taskNodeDataSchema,
  decisionNodeDataSchema,
  knowledgeMemoryNodeDataSchema,
  revenueFinanceNodeDataSchema,
  hubNodeDataSchema,
]).superRefine((node, context) => {
  if (node.id === node.stableKey) {
    context.addIssue({ code: "custom", path: ["stableKey"], message: "A stable projection key cannot replace the persistent graph UUID." });
  }
  if (node.type === "hub" && node.entityId !== null) {
    context.addIssue({ code: "custom", path: ["entityId"], message: "Structural hub nodes do not project a source business entity." });
  }
  if (node.type !== "hub" && node.entityId === null) {
    context.addIssue({ code: "custom", path: ["entityId"], message: "Source projections require their business entity UUID." });
  }
  if (node.entityId !== null && (node.entityId === node.id || node.entityId === node.stableKey)) {
    context.addIssue({ code: "custom", path: ["entityId"], message: "Source business identity cannot replace graph identity or the stable projection key." });
  }
});
export type NodeData = z.infer<typeof nodeDataSchema>;

export const graphEdgeOrigins = ["projection", "owner"] as const;
export const graphEdgeOriginSchema = z.enum(graphEdgeOrigins);
export type GraphEdgeOrigin = z.infer<typeof graphEdgeOriginSchema>;

export const edgeDataSchema = z.strictObject({
  /** Stored edges use UUIDs; deterministic virtual membership edges use bounded read-model keys. */
  id: graphEntityIdSchema,
  type: graphEdgeTypeSchema,
  sourceNodeId: graphNodeIdSchema,
  targetNodeId: graphNodeIdSchema,
  label: z.string().trim().min(1).max(255).nullable(),
  origin: graphEdgeOriginSchema,
  projectionKey: z.string().trim().min(1).max(200).nullable(),
  createdAt: graphIsoDateTimeSchema,
}).superRefine((edge, context) => {
  if (edge.sourceNodeId === edge.targetNodeId) context.addIssue({ code: "custom", path: ["targetNodeId"], message: "Self-referential graph edges are not allowed." });
  if (edge.origin === "projection" && edge.projectionKey === null) context.addIssue({ code: "custom", path: ["projectionKey"], message: "Projected edges require a projection key." });
  if (edge.origin === "owner" && edge.projectionKey !== null) context.addIssue({ code: "custom", path: ["projectionKey"], message: "Owner edges cannot claim a projection key." });
});
export type EdgeData = z.infer<typeof edgeDataSchema>;

export const hubDefinitionSchema = z.strictObject({
  key: hubKeySchema,
  nodeId: graphNodeIdSchema,
  stableKey: graphEntityIdSchema,
  label: graphLabelSchema,
  iconKey: z.string().trim().min(1).max(100),
  placementHint: hubPlacementHintSchema,
  normalizedPosition: z.strictObject({ x: z.number().min(-1).max(1), y: z.number().min(-1).max(1) }),
  containedTypes: z.array(graphNodeTypeSchema.exclude(["hub"])),
  contents: z.array(z.string().trim().min(1).max(255)).min(1),
  summary: graphSummarySchema,
});
export type HubDefinition = z.infer<typeof hubDefinitionSchema>;

export const graphListMetaSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  cursor: cursorSchema.nullable(),
  hasMore: z.boolean(),
});
export const graphResponseSchema = z.strictObject({
  nodes: z.array(nodeDataSchema),
  edges: z.array(edgeDataSchema),
  generatedAt: graphIsoDateTimeSchema,
  revision: z.string().trim().min(1).max(200),
});
export const graphNodeListResponseSchema = z.strictObject({ nodes: z.array(nodeDataSchema), meta: graphListMetaSchema });
export const graphEdgeListResponseSchema = z.strictObject({ edges: z.array(edgeDataSchema), meta: graphListMetaSchema });
export type GraphResponse = z.infer<typeof graphResponseSchema>;
export type GraphNodeListResponse = z.infer<typeof graphNodeListResponseSchema>;
export type GraphEdgeListResponse = z.infer<typeof graphEdgeListResponseSchema>;

export const graphNodeListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  types: z.array(graphNodeTypeSchema).optional(),
  hubs: z.array(hubKeySchema).optional(),
  actions: z.array(graphActionStateSchema).optional(),
  status: z.string().trim().min(1).max(100).optional(),
});
export const graphEdgeListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  types: z.array(graphEdgeTypeSchema).optional(),
  nodeId: graphNodeIdSchema.optional(),
});
export type GraphNodeListQuery = z.infer<typeof graphNodeListQuerySchema>;
export type GraphEdgeListQuery = z.infer<typeof graphEdgeListQuerySchema>;

export const graphConnectionSchema = z.strictObject({ edge: edgeDataSchema, node: nodeDataSchema, direction: z.enum(["incoming", "outgoing"]) });
export const graphNodeDetailSchema = z.strictObject({ node: nodeDataSchema, connections: z.array(graphConnectionSchema) });
export type GraphNodeDetail = z.infer<typeof graphNodeDetailSchema>;

export const graphSearchQuerySchema = z.strictObject({
  query: z.string().trim().min(1).max(200),
  types: z.array(graphNodeTypeSchema).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const graphSearchResultSchema = z.strictObject({
  node: nodeDataSchema,
  score: z.number().finite().min(0).max(1),
  matchedFields: z.array(z.enum(["label", "type", "tag", "summary"])).min(1),
});
export const graphSearchResponseSchema = z.strictObject({ results: z.array(graphSearchResultSchema), query: z.string(), total: z.number().int().nonnegative() });
export type GraphSearchQuery = z.infer<typeof graphSearchQuerySchema>;
export type GraphSearchResult = z.infer<typeof graphSearchResultSchema>;
export type GraphSearchResponse = z.infer<typeof graphSearchResponseSchema>;

export const directoryGroupKeys = ["ai_agents", "clients", "tools", "recent_tasks", "knowledge"] as const;
export const directoryGroupKeySchema = z.enum(directoryGroupKeys);
export const graphDirectoryItemSchema = z.strictObject({
  nodeId: graphNodeIdSchema,
  stableKey: graphEntityIdSchema,
  entityId: graphSourceEntityIdSchema.nullable(),
  label: graphLabelSchema,
  nodeType: graphNodeTypeSchema,
  status: z.string().trim().min(1).max(100).nullable(),
  statusLabel: z.string().trim().min(1).max(100).nullable(),
  secondaryLabel: z.string().trim().min(1).max(255).nullable(),
  hubKeys: z.array(hubKeySchema),
  sortValue: z.number().finite().nullable(),
});
export const graphDirectoryGroupSchema = z.strictObject({ key: directoryGroupKeySchema, label: graphLabelSchema, count: z.number().int().nonnegative(), items: z.array(graphDirectoryItemSchema) });
export const graphDirectoryResponseSchema = z.strictObject({ groups: z.array(graphDirectoryGroupSchema), total: z.number().int().nonnegative() });
export const graphDirectoryQuerySchema = z.strictObject({ query: z.string().trim().max(200).optional(), groups: z.array(directoryGroupKeySchema).optional() });
export type DirectoryGroupKey = z.infer<typeof directoryGroupKeySchema>;
export type GraphDirectoryItem = z.infer<typeof graphDirectoryItemSchema>;
export type GraphDirectoryGroup = z.infer<typeof graphDirectoryGroupSchema>;
export type GraphDirectoryResponse = z.infer<typeof graphDirectoryResponseSchema>;
export type GraphDirectoryQuery = z.infer<typeof graphDirectoryQuerySchema>;

/** Prompt 4 requires every listed node type and every hub to be addressable through LENS. */
export const lensEntityFilters = ["all", ...graphNodeTypes] as const;
export const lensEntityFilterSchema = z.enum(lensEntityFilters);
export const lensFunctionFilters = ["all", ...hubKeys] as const;
export const lensFunctionFilterSchema = z.enum(lensFunctionFilters);
export const lensActionFilters = ["all", ...graphActionStates] as const;
export const lensActionFilterSchema = z.enum(lensActionFilters);
export const lensFiltersSchema = z.strictObject({
  entity: lensEntityFilterSchema.default("all"),
  function: lensFunctionFilterSchema.default("all"),
  action: lensActionFilterSchema.default("all"),
});
export const lensUrlSearchParamsSchema = z.strictObject({
  entity: lensEntityFilterSchema.optional(),
  function: lensFunctionFilterSchema.optional(),
  action: lensActionFilterSchema.optional(),
});
export type LensEntityFilter = z.infer<typeof lensEntityFilterSchema>;
export type LensFunctionFilter = z.infer<typeof lensFunctionFilterSchema>;
export type LensActionFilter = z.infer<typeof lensActionFilterSchema>;
export type LensFilters = z.infer<typeof lensFiltersSchema>;
export type LensUrlSearchParams = z.infer<typeof lensUrlSearchParamsSchema>;

export const graphEdgeCreateInputSchema = z.strictObject({
  sourceNodeId: graphNodeIdSchema,
  targetNodeId: graphNodeIdSchema,
  type: graphEdgeTypeSchema,
  label: z.string().trim().min(1).max(255).nullable().default(null),
}).refine((edge) => edge.sourceNodeId !== edge.targetNodeId, { path: ["targetNodeId"], message: "Self-referential graph edges are not allowed." });
export const graphEdgeDeleteInputSchema = z.strictObject({ id: graphEntityIdSchema });
export type GraphEdgeCreateInput = z.infer<typeof graphEdgeCreateInputSchema>;
export type GraphEdgeDeleteInput = z.infer<typeof graphEdgeDeleteInputSchema>;

export const GRAPH_REALTIME_SCHEMA_VERSION = 1 as const;
export const graphRealtimeChannels = ["graph:updates", "agent:status", "finance:updates", "notifications:new"] as const;
export const graphRealtimeChannelSchema = z.enum(graphRealtimeChannels);

const realtimeBaseShape = {
  eventId: graphEntityIdSchema,
  schemaVersion: z.literal(GRAPH_REALTIME_SCHEMA_VERSION),
  occurredAt: graphIsoDateTimeSchema,
} as const;
const graphNodeChangesSchema = z.strictObject({
  label: graphLabelSchema.optional(),
  summary: graphSummarySchema.nullable().optional(),
  status: z.string().trim().min(1).max(100).nullable().optional(),
  action: graphActionStateSchema.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  hubKeys: z.array(hubKeySchema).max(hubKeys.length).optional(),
  position: graphPositionSchema.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((changes) => Object.keys(changes).length > 0, "Node changes cannot be empty.");

const graphRealtimeNodeIdentityShape = {
  nodeId: graphNodeIdSchema,
  stableKey: graphEntityIdSchema,
  entityId: graphSourceEntityIdSchema.nullable(),
} as const;

export const graphNodeCreatedEventSchema = z.strictObject({ ...realtimeBaseShape, channel: z.literal("graph:updates"), event: z.literal("node_created"), payload: z.strictObject({ node: nodeDataSchema }) });
export const graphNodeUpdatedEventSchema = z.strictObject({ ...realtimeBaseShape, channel: z.literal("graph:updates"), event: z.literal("node_updated"), payload: z.strictObject({ ...graphRealtimeNodeIdentityShape, changes: graphNodeChangesSchema }) });
export const graphNodeDeletedEventSchema = z.strictObject({ ...realtimeBaseShape, channel: z.literal("graph:updates"), event: z.literal("node_deleted"), payload: z.strictObject(graphRealtimeNodeIdentityShape) });
export const graphEdgeCreatedEventSchema = z.strictObject({ ...realtimeBaseShape, channel: z.literal("graph:updates"), event: z.literal("edge_created"), payload: z.strictObject({ edge: edgeDataSchema }) });
export const graphEdgeDeletedEventSchema = z.strictObject({ ...realtimeBaseShape, channel: z.literal("graph:updates"), event: z.literal("edge_deleted"), payload: z.strictObject({ edgeId: graphEntityIdSchema }) });
export const agentStatusChangedEventSchema = z.strictObject({ ...realtimeBaseShape, channel: z.literal("agent:status"), event: z.literal("status_changed"), payload: z.strictObject({ agentId: graphNodeIdSchema, status: z.enum(["running", "idle", "error", "scheduled", "paused"]), message: z.string().trim().min(1).max(500).optional() }) });
export const agentRunCompletedEventSchema = z.strictObject({ ...realtimeBaseShape, channel: z.literal("agent:status"), event: z.literal("run_completed"), payload: z.strictObject({ agentId: graphNodeIdSchema, runId: graphEntityIdSchema, summary: graphSummarySchema }) });
export const agentRunFailedEventSchema = z.strictObject({ ...realtimeBaseShape, channel: z.literal("agent:status"), event: z.literal("run_failed"), payload: z.strictObject({ agentId: graphNodeIdSchema, runId: graphEntityIdSchema, error: z.string().trim().min(1).max(1_000) }) });
export const financePaymentReceivedEventSchema = z.strictObject({ ...realtimeBaseShape, channel: z.literal("finance:updates"), event: z.literal("payment_received"), payload: z.strictObject({ invoiceId: graphNodeIdSchema, amount: graphMoneySchema }) });
export const graphNotificationDataSchema = z.strictObject({ id: graphEntityIdSchema, title: graphLabelSchema, message: z.string().trim().min(1).max(1_000), severity: z.enum(["info", "success", "warning", "error"]), relatedNodeId: graphNodeIdSchema.nullable(), createdAt: graphIsoDateTimeSchema });
export const graphNotificationEventSchema = z.strictObject({ ...realtimeBaseShape, channel: z.literal("notifications:new"), event: z.literal("notification"), payload: z.strictObject({ notification: graphNotificationDataSchema }) });

export type GraphNodeCreatedEvent = z.infer<typeof graphNodeCreatedEventSchema>;
export type GraphNodeUpdatedEvent = z.infer<typeof graphNodeUpdatedEventSchema>;
export type GraphNodeDeletedEvent = z.infer<typeof graphNodeDeletedEventSchema>;
export type GraphEdgeCreatedEvent = z.infer<typeof graphEdgeCreatedEventSchema>;
export type GraphEdgeDeletedEvent = z.infer<typeof graphEdgeDeletedEventSchema>;
export type AgentStatusChangedEvent = z.infer<typeof agentStatusChangedEventSchema>;
export type AgentRunCompletedEvent = z.infer<typeof agentRunCompletedEventSchema>;
export type AgentRunFailedEvent = z.infer<typeof agentRunFailedEventSchema>;
export type FinancePaymentReceivedEvent = z.infer<typeof financePaymentReceivedEventSchema>;
export type GraphNotificationEvent = z.infer<typeof graphNotificationEventSchema>;

export const graphRealtimeEventSchema = z.discriminatedUnion("event", [
  graphNodeCreatedEventSchema,
  graphNodeUpdatedEventSchema,
  graphNodeDeletedEventSchema,
  graphEdgeCreatedEventSchema,
  graphEdgeDeletedEventSchema,
  agentStatusChangedEventSchema,
  agentRunCompletedEventSchema,
  agentRunFailedEventSchema,
  financePaymentReceivedEventSchema,
  graphNotificationEventSchema,
]);
export type GraphRealtimeEvent = z.infer<typeof graphRealtimeEventSchema>;
export type GraphNotificationData = z.infer<typeof graphNotificationDataSchema>;
