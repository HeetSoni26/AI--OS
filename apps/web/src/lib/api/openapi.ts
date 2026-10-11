import {
  API_VERSION,
  agentCreateSchema,
  chatbotCreateSchema,
  chatbotSourceCreateSchema,
  contentArtifactCreateSchema,
  brandProfileUpsertSchema,
  calendarEntryCreateSchema,
  crmLeadCreateSchema,
  expenseCreateSchema,
  invoiceCreateSchema,
  knowledgeCreateSchema,
  sopCreateSchema,
  sourcedLeadCreateSchema,
  workflowCreateSchema,
  agentMemoryCreateSchema,
  agentMemoryUpdateSchema,
  agentRunCreateSchema,
  agentUpdateSchema,
  assignmentCreateSchema,
  assignmentDtoSchema,
  clientArchiveRequestSchema,
  clientCreateSchema,
  clientDeletionCancellationSchema,
  clientDeletionImpactSchema,
  clientDeletionPlanSchema,
  clientDeletionRequestSchema,
  clientDtoSchema,
  clientInvoicesRelationSchema,
  clientListDtoSchema,
  clientRecoverRequestSchema,
  clientUpdateSchema,
  communicationCreateSchema,
  communicationDtoSchema,
  contactCreateSchema,
  contactDtoSchema,
  contactUpdateSchema,
  createOpenApiDocument,
  deliverableCreateSchema,
  deliverableDtoSchema,
  deliverableReorderSchema,
  deliverableUpdateSchema,
  deliveryGateResultSchema,
  directoryGroupKeys,
  edgeDataSchema,
  graphActionStates,
  graphDirectoryResponseSchema,
  graphEdgeCreateInputSchema,
  graphEdgeListResponseSchema,
  graphEdgeTypes,
  graphNodeDetailSchema,
  graphNodeListResponseSchema,
  graphNodeTypes,
  graphResponseSchema,
  graphSearchResponseSchema,
  hubKeys,
  nodeDataSchema,
  projectCreateSchema,
  projectDtoSchema,
  projectUpdateSchema,
  taskCreateSchema,
  taskDtoSchema,
  taskUpdateSchema,
  timeAggregationSchema,
  timeEntryDtoSchema,
  type OpenApiDocument,
} from "@aios/contracts";
import { z } from "zod";
import { assignmentUpdateSchema, manualTimeEntryCreateSchema, manualTimeEntryUpdateSchema, projectStatusUpdateSchema } from "./client-route-schemas";

const jsonContent = (schema: Record<string, unknown>, example?: unknown) => ({
  content: { "application/json": { schema, ...(example === undefined ? {} : { example }) } },
});

const errorResponse = (description: string, code: string, status: number) => ({
  description,
  headers: {
    "x-request-id": { schema: { type: "string" } },
    "x-api-version": { schema: { type: "string", const: API_VERSION } },
  },
  ...jsonContent(
    { $ref: "#/components/schemas/ApiErrorEnvelope" },
    { error: { code, message: description }, meta: { requestId: "req_example", apiVersion: API_VERSION } },
  ),
  "x-status-code": status,
});

const pathIdParameter = (name: string) => ({ name, in: "path", required: true, schema: { type: "string", format: "uuid" } });
const idempotencyParameter = {
  name: "Idempotency-Key",
  in: "header",
  required: false,
  description: "An 8-255 character operation key. Reuse with a different payload returns 409.",
  schema: { type: "string", minLength: 8, maxLength: 255, pattern: "^[a-zA-Z0-9:_-]+$" },
};
const preflightOperation = (operationId: string) => ({
  operationId,
  summary: "CORS preflight",
  security: [],
  responses: {
    "204": { description: "The origin, method, and headers are allowed." },
    "403": errorResponse("The CORS preflight is not allowed.", "CORS_REJECTED", 403),
  },
});

const authenticatedErrors = {
  "401": errorResponse("Authentication is required.", "UNAUTHORIZED", 401),
  "403": errorResponse("The authenticated owner or origin is not authorized.", "FORBIDDEN", 403),
  "413": errorResponse("The request body exceeds the route limit.", "BODY_TOO_LARGE", 413),
  "422": errorResponse("The request failed schema validation.", "VALIDATION_FAILED", 422),
  "429": errorResponse("The authenticated session request limit was exceeded.", "RATE_LIMITED", 429),
  "500": errorResponse("An unexpected server error occurred.", "INTERNAL_SERVER_ERROR", 500),
  "503": errorResponse("A required platform dependency is unavailable.", "RATE_LIMIT_UNAVAILABLE", 503),
};
const clientErrors = {
  "404": errorResponse("The requested client resource was not found.", "NOT_FOUND", 404),
  "409": errorResponse("The mutation conflicts with current domain state or an idempotent request.", "CONFLICT", 409),
  ...authenticatedErrors,
};
const graphErrors = {
  "400": errorResponse("The request body must be valid JSON.", "INVALID_JSON", 400),
  "404": errorResponse("The requested graph node, edge, or endpoint was not found.", "NOT_FOUND", 404),
  "409": errorResponse("The graph mutation is duplicate, projected, conflicting, or currently processing.", "CONFLICT", 409),
  ...authenticatedErrors,
};

const agentErrors = {
  "404": errorResponse("The requested agent, run, or approval was not found.", "NOT_FOUND", 404),
  "409": errorResponse("The operation conflicts with agent, run, or approval state.", "CONFLICT", 409),
  ...authenticatedErrors,
};

function agentOperation(options: {
  operationId: string;
  summary: string;
  successStatus?: number;
  successDescription?: string;
  requestSchema?: z.ZodType;
  mutation?: boolean;
  parameters?: Array<Record<string, unknown>>;
}) {
  const status = String(options.successStatus ?? 200);
  const mutation = options.mutation ?? options.requestSchema !== undefined;
  return {
    operationId: options.operationId,
    summary: options.summary,
    tags: ["AI agent runtime"],
    ...(options.parameters || mutation
      ? { parameters: [...(options.parameters ?? []), ...(mutation ? [idempotencyParameter] : [])] }
      : {}),
    ...(options.requestSchema
      ? { requestBody: { required: true, ...jsonContent(zodJsonSchema(options.requestSchema)) } }
      : {}),
    responses: {
      [status]: successEnvelope(options.successDescription ?? "The agent operation completed."),
      ...agentErrors,
    },
  };
}

function zodJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input", unrepresentable: "any" }) as Record<string, unknown> & { $schema?: string };
  delete generated.$schema;
  return generated;
}

const successEnvelope = (description: string) => ({
  description,
  headers: {
    "x-request-id": { schema: { type: "string" } },
    "x-api-version": { schema: { type: "string", const: API_VERSION } },
  },
  ...jsonContent({ $ref: "#/components/schemas/ApiSuccessEnvelope" }),
});

function clientOperation(options: {
  operationId: string;
  summary: string;
  successStatus?: number;
  successDescription?: string;
  requestSchema?: z.ZodType;
  mutation?: boolean;
  parameters?: Array<Record<string, unknown>>;
}) {
  const status = String(options.successStatus ?? 200);
  const mutation = options.mutation ?? options.requestSchema !== undefined;
  return {
    operationId: options.operationId,
    summary: options.summary,
    tags: ["Client operations"],
    ...(options.parameters || mutation
      ? { parameters: [...(options.parameters ?? []), ...(mutation ? [idempotencyParameter] : [])] }
      : {}),
    ...(options.requestSchema
      ? { requestBody: { required: true, ...jsonContent(zodJsonSchema(options.requestSchema)) } }
      : {}),
    responses: {
      [status]: successEnvelope(options.successDescription ?? "The client operation completed."),
      ...clientErrors,
    },
  };
}

const clientId = [pathIdParameter("clientId")];
const clientProjectIds = [pathIdParameter("clientId"), pathIdParameter("projectId")];
const listClientParameters = [
  { name: "cursor", in: "query", schema: { type: "string" } },
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
  { name: "search", in: "query", schema: { type: "string", maxLength: 200 } },
  { name: "status", in: "query", schema: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] } },
  { name: "industry", in: "query", schema: { type: "string", maxLength: 100 } },
  { name: "archiveScope", in: "query", schema: { type: "string", enum: ["active", "archived", "all"], default: "active" } },
  { name: "sort", in: "query", schema: { type: "string", enum: ["name", "mrr", "startDate", "status"], default: "name" } },
  { name: "direction", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "asc" } },
  { name: "view", in: "query", schema: { type: "string", enum: ["list", "grid"], default: "list" } },
];
const communicationParameters = [
  { name: "cursor", in: "query", schema: { type: "string" } },
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
  { name: "type", in: "query", schema: { type: "string" } },
  { name: "direction", in: "query", schema: { type: "string" } },
  { name: "order", in: "query", schema: { type: "string", enum: ["chronological", "reverse_chronological"], default: "reverse_chronological" } },
];
const invoiceParameters = [
  { name: "cursor", in: "query", schema: { type: "string", format: "uuid" } },
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
];

const graphNodeExample = {
  id: "e11791d8-d71f-4ea9-a2e2-46bbeb10618d",
  stableKey: "client:89d555ac-adc8-4887-8703-dc519db7f528",
  entityId: "89d555ac-adc8-4887-8703-dc519db7f528",
  type: "client",
  label: "Acme Automation",
  summary: "Automation client",
  status: "active",
  action: "active_running",
  tags: ["priority"],
  hubKeys: ["clients"],
  position: null,
  metadata: { name: "Acme Automation", industry: "Automation", mrr: 1250, status: "active", startDate: "2026-07-01", projectsCount: 2 },
};
const graphEdgeExample = {
  id: "7d31b783-df4b-4f82-b9c9-7f29d236299f",
  type: "assignment",
  sourceNodeId: "e11791d8-d71f-4ea9-a2e2-46bbeb10618d",
  targetNodeId: "65175aad-eeb1-452b-9a33-736b99e02972",
  label: "owns",
  origin: "owner",
  projectionKey: null,
  createdAt: "2026-08-01T10:00:00.000Z",
};
const graphDirectoryExample = {
  groups: [{
    key: "clients",
    label: "Clients",
    count: 1,
    items: [{
      nodeId: graphNodeExample.id,
      stableKey: graphNodeExample.stableKey,
      entityId: graphNodeExample.entityId,
      label: graphNodeExample.label,
      nodeType: graphNodeExample.type,
      status: graphNodeExample.status,
      statusLabel: "Active",
      secondaryLabel: "$1,250 MRR",
      hubKeys: graphNodeExample.hubKeys,
      sortValue: 1250,
    }],
  }],
  total: 1,
};
const graphSecurity = [{ BearerAuth: [] }, { CookieSession: [] }];
const graphArrayParameter = (name: string, values: readonly string[]) => ({
  name,
  in: "query",
  required: false,
  description: "May be repeated, comma-delimited, or use both forms.",
  style: "form",
  explode: true,
  schema: { type: "array", uniqueItems: true, items: { type: "string", enum: values } },
});
const graphPaginationParameters = [
  { name: "cursor", in: "query", required: false, schema: { type: "string", minLength: 1, maxLength: 2048, pattern: "^[A-Za-z0-9_-]+$" } },
  { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
];
const graphSuccessResponse = (description: string, dataSchema: Record<string, unknown>, example: unknown, mutation = false) => ({
  description,
  headers: {
    "x-request-id": { schema: { type: "string" } },
    "x-api-version": { schema: { type: "string", const: API_VERSION } },
    ...(mutation ? { "idempotency-replayed": { schema: { type: "string", enum: ["true", "false"] } } } : {}),
  },
  ...jsonContent({
    allOf: [
      { $ref: "#/components/schemas/ApiSuccessEnvelope" },
      { type: "object", properties: { data: dataSchema } },
    ],
  }, {
    data: example,
    meta: { total: Array.isArray(example) ? example.length : 1, cursor: null, hasMore: false, requestId: "req_graph_example", apiVersion: API_VERSION },
  }),
});
const graphOperation = (options: {
  operationId: string;
  summary: string;
  dataSchema: Record<string, unknown>;
  example: unknown;
  successStatus?: number;
  parameters?: Array<Record<string, unknown>>;
  requestSchema?: z.ZodType;
  mutation?: boolean;
}) => ({
  operationId: options.operationId,
  summary: options.summary,
  tags: ["Knowledge graph"],
  security: graphSecurity,
  ...(options.parameters || options.mutation ? { parameters: [...(options.parameters ?? []), ...(options.mutation ? [idempotencyParameter] : [])] } : {}),
  ...(options.requestSchema ? { requestBody: { required: true, ...jsonContent(zodJsonSchema(options.requestSchema), { sourceNodeId: graphEdgeExample.sourceNodeId, targetNodeId: graphEdgeExample.targetNodeId, type: graphEdgeExample.type, label: graphEdgeExample.label }) } } : {}),
  responses: {
    [String(options.successStatus ?? 200)]: graphSuccessResponse("The graph operation completed.", options.dataSchema, options.example, options.mutation),
    ...(options.mutation && options.successStatus === 201
      ? { "200": graphSuccessResponse("A completed idempotent graph mutation was replayed.", options.dataSchema, options.example, true) }
      : {}),
    ...graphErrors,
  },
});
const graphPaths: Record<string, Record<string, unknown>> = {
  "/api/v1/graph": {
    get: graphOperation({
      operationId: "getCompleteGraph",
      summary: "Get the complete bounded owner graph",
      dataSchema: { $ref: "#/components/schemas/Graph" },
      example: { nodes: [graphNodeExample], edges: [graphEdgeExample], generatedAt: "2026-08-01T10:00:00.000Z", revision: "graph-v1-1" },
    }),
    options: preflightOperation("preflightGraph"),
  },
  "/api/v1/graph/directory": {
    get: graphOperation({
      operationId: "getGraphDirectory",
      summary: "Get the authoritative owner graph directory",
      dataSchema: { $ref: "#/components/schemas/GraphDirectory" },
      example: graphDirectoryExample,
      parameters: [
        { name: "query", in: "query", required: false, description: "Fuzzy-match directory labels, summaries, and tags.", schema: { type: "string", maxLength: 200 } },
        graphArrayParameter("groups", directoryGroupKeys),
      ],
    }),
    options: preflightOperation("preflightGraphDirectory"),
  },
  "/api/v1/graph/nodes": {
    get: graphOperation({
      operationId: "listGraphNodes",
      summary: "Filter and cursor-page graph nodes",
      dataSchema: { $ref: "#/components/schemas/GraphNodeList" },
      example: { nodes: [graphNodeExample], meta: { total: 1, cursor: null, hasMore: false } },
      parameters: [
        ...graphPaginationParameters,
        graphArrayParameter("types", graphNodeTypes),
        graphArrayParameter("hubs", hubKeys),
        graphArrayParameter("actions", graphActionStates),
        { name: "status", in: "query", required: false, schema: { type: "string", minLength: 1, maxLength: 100 } },
      ],
    }),
    options: preflightOperation("preflightGraphNodes"),
  },
  "/api/v1/graph/nodes/{nodeId}": {
    parameters: [pathIdParameter("nodeId")],
    get: graphOperation({
      operationId: "getGraphNode",
      summary: "Get a graph node and its live connections",
      dataSchema: { $ref: "#/components/schemas/GraphNodeDetail" },
      example: { node: graphNodeExample, connections: [] },
    }),
    options: preflightOperation("preflightGraphNode"),
  },
  "/api/v1/graph/edges": {
    get: graphOperation({
      operationId: "listGraphEdges",
      summary: "Filter and cursor-page graph edges",
      dataSchema: { $ref: "#/components/schemas/GraphEdgeList" },
      example: { edges: [graphEdgeExample], meta: { total: 1, cursor: null, hasMore: false } },
      parameters: [
        ...graphPaginationParameters,
        graphArrayParameter("types", graphEdgeTypes),
        { name: "nodeId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
      ],
    }),
    post: graphOperation({
      operationId: "createGraphEdge",
      summary: "Create an owner-managed graph relationship",
      dataSchema: { $ref: "#/components/schemas/GraphEdge" },
      example: graphEdgeExample,
      successStatus: 201,
      requestSchema: graphEdgeCreateInputSchema,
      mutation: true,
    }),
    options: preflightOperation("preflightGraphEdges"),
  },
  "/api/v1/graph/edges/{edgeId}": {
    parameters: [{ name: "edgeId", in: "path", required: true, schema: { type: "string", minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9._:-]+$" } }],
    delete: graphOperation({
      operationId: "deleteGraphEdge",
      summary: "Delete an owner-managed graph relationship",
      dataSchema: { $ref: "#/components/schemas/GraphEdge" },
      example: graphEdgeExample,
      mutation: true,
    }),
    options: preflightOperation("preflightGraphEdge"),
  },
  "/api/v1/graph/search": {
    get: graphOperation({
      operationId: "searchGraph",
      summary: "Search graph labels, types, tags, and summaries",
      dataSchema: { $ref: "#/components/schemas/GraphSearch" },
      example: { results: [{ node: graphNodeExample, score: 0.98, matchedFields: ["label"] }], query: "Acme", total: 1 },
      parameters: [
        { name: "query", in: "query", required: true, schema: { type: "string", minLength: 1, maxLength: 200 } },
        graphArrayParameter("types", graphNodeTypes),
        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
      ],
    }),
    options: preflightOperation("preflightGraphSearch"),
  },
};

const clientPaths: Record<string, Record<string, unknown>> = {
  "/api/v1/clients": {
    get: clientOperation({ operationId: "listClients", summary: "List, filter, sort, and cursor-page clients", parameters: listClientParameters }),
    post: clientOperation({ operationId: "createClient", summary: "Create a client", successStatus: 201, requestSchema: clientCreateSchema }),
    options: preflightOperation("preflightClients"),
  },
  "/api/v1/clients/{clientId}": {
    parameters: clientId,
    get: clientOperation({ operationId: "getClient", summary: "Get client detail" }),
    patch: clientOperation({ operationId: "updateClient", summary: "Update client fields", requestSchema: clientUpdateSchema }),
    delete: clientOperation({ operationId: "archiveClient", summary: "Archive a client", requestSchema: clientArchiveRequestSchema }),
    options: preflightOperation("preflightClient"),
  },
  "/api/v1/clients/{clientId}/recover": {
    parameters: clientId,
    post: clientOperation({ operationId: "recoverClient", summary: "Recover an archived client", requestSchema: clientRecoverRequestSchema }),
    options: preflightOperation("preflightRecoverClient"),
  },
  "/api/v1/clients/{clientId}/deletion": {
    parameters: clientId,
    get: clientOperation({ operationId: "getClientDeletionImpact", summary: "Preview deletion impact" }),
    post: clientOperation({ operationId: "scheduleClientDeletion", summary: "Schedule client deletion after seven days", successStatus: 202, requestSchema: clientDeletionRequestSchema }),
    delete: clientOperation({ operationId: "cancelClientDeletion", summary: "Cancel pending client deletion", requestSchema: clientDeletionCancellationSchema }),
    options: preflightOperation("preflightClientDeletion"),
  },
  "/api/v1/clients/{clientId}/contacts": {
    parameters: clientId,
    get: clientOperation({ operationId: "listClientContacts", summary: "List normalized client contacts" }),
    post: clientOperation({ operationId: "createClientContact", summary: "Create a client contact", successStatus: 201, requestSchema: contactCreateSchema }),
    options: preflightOperation("preflightClientContacts"),
  },
  "/api/v1/clients/{clientId}/contacts/{contactId}": {
    parameters: [...clientId, pathIdParameter("contactId")],
    get: clientOperation({ operationId: "getClientContact", summary: "Get a client contact" }),
    patch: clientOperation({ operationId: "updateClientContact", summary: "Update a client contact", requestSchema: contactUpdateSchema }),
    delete: clientOperation({ operationId: "deleteClientContact", summary: "Soft-delete a client contact", mutation: true }),
    options: preflightOperation("preflightClientContact"),
  },
  "/api/v1/clients/{clientId}/projects": {
    parameters: clientId,
    get: clientOperation({ operationId: "listClientProjects", summary: "List client projects and work summaries" }),
    post: clientOperation({ operationId: "createClientProject", summary: "Create a client project", successStatus: 201, requestSchema: projectCreateSchema }),
    options: preflightOperation("preflightClientProjects"),
  },
  "/api/v1/clients/{clientId}/projects/{projectId}": {
    parameters: clientProjectIds,
    get: clientOperation({ operationId: "getClientProject", summary: "Get a client project" }),
    patch: clientOperation({ operationId: "updateClientProject", summary: "Update a client project", requestSchema: projectUpdateSchema }),
    delete: clientOperation({ operationId: "deleteClientProject", summary: "Soft-delete a client project", mutation: true }),
    options: preflightOperation("preflightClientProject"),
  },
  "/api/v1/clients/{clientId}/projects/{projectId}/status": {
    parameters: clientProjectIds,
    get: clientOperation({ operationId: "getClientProjectStatus", summary: "Read project delivery status" }),
    patch: clientOperation({ operationId: "updateClientProjectStatus", summary: "Transition project status with delivery gating", requestSchema: projectStatusUpdateSchema }),
    options: preflightOperation("preflightClientProjectStatus"),
  },
  "/api/v1/clients/{clientId}/projects/{projectId}/tasks": {
    parameters: clientProjectIds,
    get: clientOperation({ operationId: "listClientProjectTasks", summary: "List project tasks" }),
    post: clientOperation({ operationId: "createClientProjectTask", summary: "Create a project task", successStatus: 201, requestSchema: taskCreateSchema }),
    options: preflightOperation("preflightClientProjectTasks"),
  },
  "/api/v1/clients/{clientId}/projects/{projectId}/tasks/{taskId}": {
    parameters: [...clientProjectIds, pathIdParameter("taskId")],
    get: clientOperation({ operationId: "getClientProjectTask", summary: "Get a project task" }),
    patch: clientOperation({ operationId: "updateClientProjectTask", summary: "Update a project task", requestSchema: taskUpdateSchema }),
    delete: clientOperation({ operationId: "deleteClientProjectTask", summary: "Soft-delete a project task", mutation: true }),
    options: preflightOperation("preflightClientProjectTask"),
  },
  "/api/v1/clients/{clientId}/projects/{projectId}/assignments": {
    parameters: clientProjectIds,
    get: clientOperation({ operationId: "listClientProjectAssignments", summary: "List human and agent assignments" }),
    post: clientOperation({ operationId: "createClientProjectAssignment", summary: "Create a persisted assignment", successStatus: 201, requestSchema: assignmentCreateSchema }),
    options: preflightOperation("preflightClientProjectAssignments"),
  },
  "/api/v1/clients/{clientId}/projects/{projectId}/assignments/{assignmentId}": {
    parameters: [...clientProjectIds, pathIdParameter("assignmentId")],
    get: clientOperation({ operationId: "getClientProjectAssignment", summary: "Get a project assignment" }),
    patch: clientOperation({ operationId: "updateClientProjectAssignment", summary: "Update a project assignment", requestSchema: assignmentUpdateSchema }),
    delete: clientOperation({ operationId: "deleteClientProjectAssignment", summary: "Soft-delete a project assignment", mutation: true }),
    options: preflightOperation("preflightClientProjectAssignment"),
  },
  "/api/v1/clients/{clientId}/projects/{projectId}/time": {
    parameters: clientProjectIds,
    get: clientOperation({ operationId: "listClientProjectTime", summary: "List time entries with source aggregation" }),
    post: clientOperation({ operationId: "createClientProjectManualTime", summary: "Create a non-overlapping manual time entry", successStatus: 201, requestSchema: manualTimeEntryCreateSchema }),
    options: preflightOperation("preflightClientProjectTime"),
  },
  "/api/v1/clients/{clientId}/projects/{projectId}/time/{timeEntryId}": {
    parameters: [...clientProjectIds, pathIdParameter("timeEntryId")],
    get: clientOperation({ operationId: "getClientProjectTimeEntry", summary: "Get a manual time entry" }),
    patch: clientOperation({ operationId: "updateClientProjectTimeEntry", summary: "Update a manual time entry", requestSchema: manualTimeEntryUpdateSchema }),
    delete: clientOperation({ operationId: "deleteClientProjectTimeEntry", summary: "Soft-delete a manual time entry", mutation: true }),
    options: preflightOperation("preflightClientProjectTimeEntry"),
  },
  "/api/v1/clients/{clientId}/projects/{projectId}/deliverables": {
    parameters: clientProjectIds,
    get: clientOperation({ operationId: "listClientProjectDeliverables", summary: "List ordered project deliverables" }),
    post: clientOperation({ operationId: "createClientProjectDeliverable", summary: "Create a deliverable", successStatus: 201, requestSchema: deliverableCreateSchema }),
    options: preflightOperation("preflightClientProjectDeliverables"),
  },
  "/api/v1/clients/{clientId}/projects/{projectId}/deliverables/{deliverableId}": {
    parameters: [...clientProjectIds, pathIdParameter("deliverableId")],
    get: clientOperation({ operationId: "getClientProjectDeliverable", summary: "Get a project deliverable" }),
    patch: clientOperation({ operationId: "updateClientProjectDeliverable", summary: "Update completion or deliverable fields", requestSchema: deliverableUpdateSchema }),
    delete: clientOperation({ operationId: "deleteClientProjectDeliverable", summary: "Soft-delete a deliverable subject to delivery gate", mutation: true }),
    options: preflightOperation("preflightClientProjectDeliverable"),
  },
  "/api/v1/clients/{clientId}/projects/{projectId}/deliverables/reorder": {
    parameters: clientProjectIds,
    patch: clientOperation({ operationId: "reorderClientProjectDeliverables", summary: "Atomically reorder every live deliverable", requestSchema: deliverableReorderSchema }),
    options: preflightOperation("preflightClientProjectDeliverableReorder"),
  },
  "/api/v1/clients/{clientId}/projects/{projectId}/delivery-gate": {
    parameters: clientProjectIds,
    get: clientOperation({ operationId: "getClientProjectDeliveryGate", summary: "List incomplete required deliverable blockers" }),
    options: preflightOperation("preflightClientProjectDeliveryGate"),
  },
  "/api/v1/clients/{clientId}/communications": {
    parameters: clientId,
    get: clientOperation({ operationId: "listClientCommunications", summary: "List chronological client communications", parameters: communicationParameters }),
    post: clientOperation({ operationId: "createClientCommunication", summary: "Log a client communication", successStatus: 201, requestSchema: communicationCreateSchema }),
    options: preflightOperation("preflightClientCommunications"),
  },
  "/api/v1/clients/{clientId}/invoices": {
    parameters: clientId,
    get: clientOperation({ operationId: "listClientInvoices", summary: "Read the real client invoice relation", parameters: invoiceParameters }),
    options: preflightOperation("preflightClientInvoices"),
  },
  "/api/v1/clients/{clientId}/logo": {
    parameters: clientId,
    get: {
      operationId: "downloadClientLogo",
      summary: "Create a five-minute signed private logo download",
      tags: ["Client operations"],
      responses: {
        "307": { description: "Redirect to a short-lived signed private object URL.", headers: { location: { schema: { type: "string", format: "uri" } }, "cache-control": { schema: { type: "string", const: "private, no-store" } } } },
        ...clientErrors,
      },
    },
    post: {
      operationId: "uploadClientLogo",
      summary: "Validate and store a private client logo",
      tags: ["Client operations"],
      parameters: [idempotencyParameter],
      requestBody: { required: true, content: { "image/png": { schema: { type: "string", format: "binary" } }, "image/jpeg": { schema: { type: "string", format: "binary" } }, "image/webp": { schema: { type: "string", format: "binary" } } } },
      responses: { "201": successEnvelope("Logo stored and linked."), "415": errorResponse("Image type is unsupported.", "UNSUPPORTED_IMAGE_TYPE", 415), ...clientErrors },
    },
    delete: clientOperation({ operationId: "deleteClientLogo", summary: "Remove the active private client logo", mutation: true }),
    options: preflightOperation("preflightClientLogo"),
  },
};

const agentIdParameter = [pathIdParameter("agentId")];

const agentPaths: Record<string, Record<string, unknown>> = {
  "/api/v1/agents": {
    get: agentOperation({
      operationId: "listAgents",
      summary: "List, search, and filter AI agents",
      parameters: [
        { name: "search", in: "query", required: false, schema: { type: "string", maxLength: 200 } },
        { name: "archiveScope", in: "query", required: false, schema: { type: "string", enum: ["active", "archived", "all"] } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
        { name: "cursor", in: "query", required: false, schema: { type: "string", maxLength: 500 } },
        { name: "clientId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
      ],
    }),
    post: agentOperation({ operationId: "createAgent", summary: "Create an AI agent with its first configuration version", successStatus: 201, requestSchema: agentCreateSchema }),
    options: preflightOperation("preflightAgents"),
  },
  "/api/v1/agents/{agentId}": {
    parameters: agentIdParameter,
    get: agentOperation({ operationId: "getAgent", summary: "Get agent detail with recent runs, memory, and configuration history" }),
    patch: agentOperation({ operationId: "updateAgent", summary: "Update agent configuration (records a new version when it changes)", requestSchema: agentUpdateSchema }),
    delete: agentOperation({ operationId: "deleteAgent", summary: "Soft-delete an agent and cancel its queued runs", mutation: true }),
    options: preflightOperation("preflightAgent"),
  },
  "/api/v1/agents/{agentId}/run": {
    parameters: agentIdParameter,
    post: agentOperation({ operationId: "runAgent", summary: "Dispatch an agent run (budget-checked, approval-aware)", successStatus: 202, requestSchema: agentRunCreateSchema }),
    options: preflightOperation("preflightRunAgent"),
  },
  "/api/v1/agents/{agentId}/pause": {
    parameters: agentIdParameter,
    post: agentOperation({ operationId: "pauseAgent", summary: "Pause an agent and cancel queued runs", mutation: true }),
    options: preflightOperation("preflightPauseAgent"),
  },
  "/api/v1/agents/{agentId}/resume": {
    parameters: agentIdParameter,
    post: agentOperation({ operationId: "resumeAgent", summary: "Resume a paused agent", mutation: true }),
    options: preflightOperation("preflightResumeAgent"),
  },
  "/api/v1/agents/{agentId}/runs": {
    parameters: agentIdParameter,
    get: agentOperation({
      operationId: "listAgentRuns",
      summary: "List the agent's runs with filters and cursor pagination",
      parameters: [
        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
        { name: "cursor", in: "query", required: false, schema: { type: "string", maxLength: 500 } },
      ],
    }),
    options: preflightOperation("preflightAgentRuns"),
  },
  "/api/v1/agents/{agentId}/memory": {
    parameters: agentIdParameter,
    get: agentOperation({ operationId: "listAgentMemory", summary: "List agent memories scoped by client" }),
    post: agentOperation({ operationId: "createAgentMemory", summary: "Create an agent memory entry", successStatus: 201, requestSchema: agentMemoryCreateSchema }),
    options: preflightOperation("preflightAgentMemory"),
  },
  "/api/v1/agents/{agentId}/memory/{memoryId}": {
    parameters: [...agentIdParameter, pathIdParameter("memoryId")],
    patch: agentOperation({ operationId: "updateAgentMemory", summary: "Edit an agent memory (versioned, audited)", requestSchema: agentMemoryUpdateSchema }),
    delete: agentOperation({ operationId: "deleteAgentMemory", summary: "Soft-delete an agent memory", mutation: true }),
    options: preflightOperation("preflightAgentMemoryItem"),
  },
  "/api/v1/agents/{agentId}/config-versions": {
    parameters: agentIdParameter,
    get: agentOperation({ operationId: "listAgentConfigVersions", summary: "List configuration versions recorded for the agent" }),
    options: preflightOperation("preflightAgentConfigVersions"),
  },
  "/api/v1/agents/{agentId}/budget": {
    parameters: agentIdParameter,
    get: agentOperation({ operationId: "getAgentBudget", summary: "Read today's token usage against the daily budget" }),
    options: preflightOperation("preflightAgentBudget"),
  },
  "/api/v1/agents/runs": {
    get: agentOperation({
      operationId: "listAgentRunsGlobal",
      summary: "List runs across all agents with filters",
      parameters: [
        { name: "agentId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
        { name: "cursor", in: "query", required: false, schema: { type: "string", maxLength: 500 } },
      ],
    }),
    options: preflightOperation("preflightAllAgentRuns"),
  },
  "/api/v1/agents/approvals": {
    get: agentOperation({ operationId: "listAgentApprovals", summary: "List approval checkpoints, pending by default" }),
    options: preflightOperation("preflightAgentApprovals"),
  },
  "/api/v1/agents/approvals/{approvalId}": {
    parameters: [pathIdParameter("approvalId")],
    post: agentOperation({ operationId: "decideAgentApproval", summary: "Approve or reject a run approval checkpoint", mutation: true }),
    options: preflightOperation("preflightDecideAgentApproval"),
  },
  "/api/v1/agents/runtime": {
    get: agentOperation({ operationId: "getAgentRuntimeStatus", summary: "Read runtime queue, scheduler, and provider status" }),
    options: preflightOperation("preflightAgentRuntime"),
  },
};

const chatbotPaths: Record<string, Record<string, unknown>> = {
  "/api/v1/chatbots": {
    get: agentOperation({
      operationId: "listChatbots",
      summary: "List, search, and filter client chatbots",
      parameters: [
        { name: "search", in: "query", required: false, schema: { type: "string", maxLength: 200 } },
        { name: "clientId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
        { name: "cursor", in: "query", required: false, schema: { type: "string", maxLength: 500 } },
      ],
    }),
    post: agentOperation({ operationId: "createChatbot", summary: "Create a client chatbot with its first configuration version", successStatus: 201, requestSchema: chatbotCreateSchema }),
    options: preflightOperation("preflightChatbots"),
  },
  "/api/v1/chatbots/{chatbotId}": {
    parameters: [pathIdParameter("chatbotId")],
    get: agentOperation({ operationId: "getChatbot", summary: "Get chatbot detail with sources, Q&A, and conversations" }),
    patch: agentOperation({ operationId: "updateChatbot", summary: "Update chatbot configuration (a new version is recorded when config changes)", requestSchema: chatbotCreateSchema }),
    options: preflightOperation("preflightChatbot"),
  },
  "/api/v1/chatbots/{chatbotId}/status": {
    parameters: [pathIdParameter("chatbotId")],
    post: agentOperation({ operationId: "setChatbotStatus", summary: "Deploy, pause, or archive a chatbot", mutation: true }),
    options: preflightOperation("preflightChatbotStatus"),
  },
  "/api/v1/chatbots/{chatbotId}/sources": {
    parameters: [pathIdParameter("chatbotId")],
    post: agentOperation({ operationId: "ingestChatbotSource", summary: "Ingest knowledge content and extract reviewable Q&A pairs", successStatus: 201, requestSchema: chatbotSourceCreateSchema }),
    options: preflightOperation("preflightChatbotSources"),
  },
  "/api/v1/chatbots/{chatbotId}/sources/{sourceId}/approve": {
    parameters: [pathIdParameter("chatbotId"), pathIdParameter("sourceId")],
    post: agentOperation({ operationId: "approveChatbotSource", summary: "Approve a source and its Q&A pairs for deployment", mutation: true }),
    options: preflightOperation("preflightApproveChatbotSource"),
  },
  "/api/v1/chatbots/{chatbotId}/chat": {
    parameters: [pathIdParameter("chatbotId")],
    post: agentOperation({ operationId: "chatWithChatbot", summary: "Send a grounded chat turn (escalates below the confidence threshold)", successStatus: 201, mutation: true }),
    options: preflightOperation("preflightChatWithChatbot"),
  },
  "/api/v1/chatbots/conversations": {
    get: agentOperation({ operationId: "listChatbotConversations", summary: "List conversations across chatbots with filters" }),
    options: preflightOperation("preflightChatbotConversations"),
  },
  "/api/v1/chatbots/conversations/{conversationId}": {
    parameters: [pathIdParameter("conversationId")],
    get: agentOperation({ operationId: "getChatbotConversation", summary: "Get the full conversation transcript" }),
    post: agentOperation({ operationId: "resolveChatbotConversation", summary: "Mark a conversation resolved", mutation: true }),
    options: preflightOperation("preflightChatbotConversation"),
  },
}
const domainPaths: Record<string, Record<string, unknown>> = {
  "/api/v1/workflows": {
    get: agentOperation({ operationId: "listWorkflows", summary: "List workflow automations" }),
    post: agentOperation({ operationId: "createWorkflow", summary: "Create a workflow from a validated blueprint", successStatus: 201, requestSchema: workflowCreateSchema }),
    options: preflightOperation("preflightWorkflows"),
  },
  "/api/v1/workflows/{workflowId}": {
    parameters: [pathIdParameter("workflowId")],
    get: agentOperation({ operationId: "getWorkflow", summary: "Get workflow detail with versions and executions" }),
    patch: agentOperation({ operationId: "updateWorkflow", summary: "Update a workflow (records a new version)" }),
    options: preflightOperation("preflightWorkflow"),
  },
  "/api/v1/workflows/{workflowId}/status": {
    parameters: [pathIdParameter("workflowId")],
    post: agentOperation({ operationId: "setWorkflowStatus", summary: "Activate, pause, or archive a tested workflow", mutation: true }),
    options: preflightOperation("preflightWorkflowStatus"),
  },
  "/api/v1/workflows/{workflowId}/test": {
    parameters: [pathIdParameter("workflowId")],
    post: agentOperation({ operationId: "recordWorkflowTest", summary: "Record a sandbox test execution (required before activation)", successStatus: 201, mutation: true }),
    options: preflightOperation("preflightWorkflowTest"),
  },
  "/api/v1/workflows/executions": {
    get: agentOperation({ operationId: "listWorkflowExecutions", summary: "List workflow executions" }),
    options: preflightOperation("preflightWorkflowExecutions"),
  },
  "/api/v1/webhooks/n8n": {
    get: { operationId: "describeN8nWebhook", summary: "Webhook ingress description and signature policy", security: [], responses: { "200": successEnvelope("Webhook ingress contract.") } },
    post: { operationId: "receiveN8nExecutionEvent", summary: "Receive provider execution events (HMAC-verified when configured)", security: [], responses: { "201": successEnvelope("Execution event recorded."), "202": successEnvelope("Event acknowledged without a matching workflow."), "400": errorResponse("The webhook body must be a valid workflow event.", "INVALID_JSON", 400), "401": errorResponse("The webhook signature is invalid.", "WEBHOOK_SIGNATURE_INVALID", 401) } },
  },
  "/api/v1/content": {
    get: agentOperation({ operationId: "listContentArtifacts", summary: "List client and agency content artifacts" }),
    post: agentOperation({ operationId: "createContentArtifact", summary: "Create a content draft (approval flow starts at draft)", successStatus: 201, requestSchema: contentArtifactCreateSchema }),
    options: preflightOperation("preflightContent"),
  },
  "/api/v1/content/{artifactId}": {
    parameters: [pathIdParameter("artifactId")],
    get: agentOperation({ operationId: "getContentArtifact", summary: "Get artifact detail with versions and calendar entries" }),
    patch: agentOperation({ operationId: "updateContentArtifact", summary: "Edit an artifact (creates a version and resets approval)" }),
    options: preflightOperation("preflightContentArtifact"),
  },
  "/api/v1/content/{artifactId}/status": {
    parameters: [pathIdParameter("artifactId")],
    post: agentOperation({ operationId: "setContentArtifactStatus", summary: "Advance the artifact approval state machine", mutation: true }),
    options: preflightOperation("preflightContentArtifactStatus"),
  },
  "/api/v1/content/{artifactId}/calendar": {
    parameters: [pathIdParameter("artifactId")],
    post: agentOperation({ operationId: "scheduleContentArtifact", summary: "Schedule an approved artifact for publishing", successStatus: 201, requestSchema: calendarEntryCreateSchema }),
    options: preflightOperation("preflightScheduleContent"),
  },
  "/api/v1/content/brand": {
    get: agentOperation({ operationId: "listBrandProfiles", summary: "List scoped brand voice profiles" }),
    post: agentOperation({ operationId: "upsertBrandProfile", summary: "Create or update a scoped brand voice profile", successStatus: 201, requestSchema: brandProfileUpsertSchema }),
    options: preflightOperation("preflightBrandProfiles"),
  },
  "/api/v1/content/calendar": {
    get: agentOperation({ operationId: "listContentCalendar", summary: "List scheduled content entries" }),
    options: preflightOperation("preflightContentCalendar"),
  },
  "/api/v1/pipeline/leads": {
    get: agentOperation({ operationId: "listCrmLeads", summary: "List agency CRM leads" }),
    post: agentOperation({ operationId: "createCrmLead", summary: "Capture an agency CRM lead (New stage)", successStatus: 201, requestSchema: crmLeadCreateSchema }),
    options: preflightOperation("preflightCrmLeads"),
  },
  "/api/v1/pipeline/leads/{leadId}": {
    parameters: [pathIdParameter("leadId")],
    get: agentOperation({ operationId: "getCrmLead", summary: "Get lead detail with proposals and stage history" }),
    patch: agentOperation({ operationId: "updateCrmLead", summary: "Update lead fields" }),
    options: preflightOperation("preflightCrmLead"),
  },
  "/api/v1/pipeline/leads/{leadId}/stage": {
    parameters: [pathIdParameter("leadId")],
    post: agentOperation({ operationId: "updateCrmLeadStage", summary: "Move a lead between pipeline stages (history recorded)", mutation: true }),
    options: preflightOperation("preflightCrmLeadStage"),
  },
  "/api/v1/pipeline/proposals": {
    get: agentOperation({ operationId: "listProposals", summary: "List versioned proposals" }),
    post: agentOperation({ operationId: "createProposal", summary: "Create a draft proposal from a controlled template", successStatus: 201 }),
    options: preflightOperation("preflightProposals"),
  },
  "/api/v1/pipeline/proposals/{proposalId}/status": {
    parameters: [pathIdParameter("proposalId")],
    post: agentOperation({ operationId: "updateProposalStatus", summary: "Send, view, accept, or reject a proposal (drives lead stages)", mutation: true }),
    options: preflightOperation("preflightProposalStatus"),
  },
  "/api/v1/pipeline/sourced-leads": {
    get: agentOperation({ operationId: "listSourcedLeads", summary: "List client-sourced leads with fit scores" }),
    post: agentOperation({ operationId: "createSourcedLead", summary: "Add a sourced lead (deduplicated by identity fingerprint)", successStatus: 201, requestSchema: sourcedLeadCreateSchema }),
    options: preflightOperation("preflightSourcedLeads"),
  },
  "/api/v1/finance/invoices": {
    get: agentOperation({ operationId: "listInvoices", summary: "List invoices with items and payments" }),
    post: agentOperation({ operationId: "createInvoice", summary: "Create an invoice draft with server-verified totals", successStatus: 201, requestSchema: invoiceCreateSchema }),
    options: preflightOperation("preflightInvoices"),
  },
  "/api/v1/finance/invoices/{invoiceId}": {
    parameters: [pathIdParameter("invoiceId")],
    post: agentOperation({ operationId: "invoiceAction", summary: "Send, flag overdue, cancel, or record a payment", mutation: true }),
    options: preflightOperation("preflightInvoiceAction"),
  },
  "/api/v1/finance/expenses": {
    get: agentOperation({ operationId: "listExpenses", summary: "List expenses" }),
    post: agentOperation({ operationId: "createExpense", summary: "Record a manual expense", successStatus: 201, requestSchema: expenseCreateSchema }),
    options: preflightOperation("preflightExpenses"),
  },
  "/api/v1/finance/dashboard": {
    get: agentOperation({ operationId: "getFinanceDashboard", summary: "MRR, revenue, expenses, margin, outstanding, and client profitability" }),
    options: preflightOperation("preflightFinanceDashboard"),
  },
  "/api/v1/knowledge": {
    get: agentOperation({ operationId: "listKnowledge", summary: "Search knowledge entries by title, content, or tag" }),
    post: agentOperation({ operationId: "createKnowledge", summary: "Create a knowledge entry (version 1)", successStatus: 201, requestSchema: knowledgeCreateSchema }),
    options: preflightOperation("preflightKnowledge"),
  },
  "/api/v1/knowledge/{entryId}": {
    parameters: [pathIdParameter("entryId")],
    get: agentOperation({ operationId: "getKnowledge", summary: "Read an entry (records access)" }),
    patch: agentOperation({ operationId: "updateKnowledge", summary: "Edit an entry (creates a version)" }),
    options: preflightOperation("preflightKnowledgeEntry"),
  },
  "/api/v1/knowledge/sops": {
    get: agentOperation({ operationId: "listSops", summary: "List SOPs with steps and execution history" }),
    post: agentOperation({ operationId: "createSop", summary: "Create an SOP with ordered steps", successStatus: 201, requestSchema: sopCreateSchema }),
    options: preflightOperation("preflightSops"),
  },
  "/api/v1/knowledge/sops/{sopId}/executions": {
    parameters: [pathIdParameter("sopId")],
    post: agentOperation({ operationId: "recordSopExecution", summary: "Record a checklist execution against the current SOP version", successStatus: 201, mutation: true }),
    options: preflightOperation("preflightSopExecution"),
  },
  "/api/v1/knowledge/notifications": {
    get: agentOperation({ operationId: "listNotifications", summary: "List notification records with unread count" }),
    post: agentOperation({ operationId: "markAllNotificationsRead", summary: "Mark every notification read", mutation: true }),
    options: preflightOperation("preflightNotifications"),
  },
  "/api/v1/knowledge/notifications/{notificationId}/read": {
    parameters: [pathIdParameter("notificationId")],
    post: agentOperation({ operationId: "markNotificationRead", summary: "Mark one notification read", mutation: true }),
    options: preflightOperation("preflightNotificationRead"),
  },
  "/api/v1/settings": {
    get: agentOperation({ operationId: "getWorkspaceSettings", summary: "Workspace posture and integration configuration states (no secrets)" }),
    options: preflightOperation("preflightSettings"),
  },
};
;


export function createAiosOpenApiDocument(): OpenApiDocument {
  return createOpenApiDocument({
    title: "AI OS API",
    description: "Owner-authenticated versioned API platform for the AI Automation Agency OS.",
    version: process.env.npm_package_version ?? "0.1.0",
    serverUrl: "/",
    paths: {
      "/api/auth/logout": {
        post: {
          operationId: "logoutOwner",
          summary: "Terminate the owner cookie session",
          description: "Cookie-authenticated mutation protected by the configured trusted-origin policy.",
          security: [{ CookieSession: [] }],
          responses: {
            "200": successEnvelope("The owner session was terminated."),
            "403": errorResponse("The mutation origin is not trusted.", "CSRF_REJECTED", 403),
            "500": authenticatedErrors["500"],
          },
        },
      },
      "/api/health": {
        get: {
          operationId: "getPublicHealth",
          summary: "Public liveness check",
          security: [],
          responses: { "200": { description: "The web service is running.", ...jsonContent({ type: "object", required: ["status", "service", "timestamp", "version"] }) } },
        },
      },
      "/api/openapi": {
        get: { operationId: "getOpenApiDocument", summary: "OpenAPI 3.1 document", security: [], responses: { "200": { description: "The current API contract.", ...jsonContent({ type: "object", required: ["openapi", "info", "paths", "components"] }) } } },
      },
      ...clientPaths,
      ...graphPaths,
      ...agentPaths,
      ...chatbotPaths,
      ...domainPaths,
      "/api/v1/integrations/gmail": {
        get: { operationId: "getGmailConnection", summary: "Read Gmail configuration, connection, and sync state", responses: { "200": successEnvelope("Safe Gmail connection state."), ...authenticatedErrors } },
        options: preflightOperation("preflightGmailConnection"),
      },
      "/api/v1/integrations/gmail/connect": {
        post: { operationId: "startGmailOAuth", summary: "Create an owner/session-bound Gmail OAuth authorization URL", responses: { "200": successEnvelope("Short-lived Gmail authorization URL."), ...authenticatedErrors } },
        options: preflightOperation("preflightStartGmailOAuth"),
      },
      "/api/v1/integrations/gmail/callback": {
        get: { operationId: "completeGmailOAuth", summary: "Validate OAuth state and store Gmail refresh access in Supabase Vault", parameters: [{ name: "code", in: "query", required: true, schema: { type: "string" } }, { name: "state", in: "query", required: true, schema: { type: "string" } }], responses: { "303": { description: "Gmail connected; redirect to client operations." }, "400": errorResponse("Callback parameters or authorization are invalid.", "GMAIL_CALLBACK_INVALID", 400), "409": errorResponse("OAuth state was replayed or offline access is missing.", "CONFLICT", 409), ...authenticatedErrors } },
      },
      "/api/v1/integrations/gmail/sync": {
        post: { operationId: "requestGmailSync", summary: "Request a durable Gmail synchronization", responses: { "202": successEnvelope("Synchronization request state."), "409": errorResponse("Gmail is not connected or requires reconnection.", "GMAIL_NOT_CONNECTED", 409), ...authenticatedErrors } },
        options: preflightOperation("preflightGmailSync"),
      },
      "/api/v1/health": {
        get: { operationId: "getReadiness", summary: "Owner-authenticated readiness check", description: "Validates auth configuration and probes the database without exposing credentials or host details.", responses: { "200": successEnvelope("Required services are ready."), ...authenticatedErrors, "503": { description: "Readiness is degraded or a required policy dependency is unavailable.", ...jsonContent({ oneOf: [{ $ref: "#/components/schemas/ApiSuccessEnvelope" }, { $ref: "#/components/schemas/ApiErrorEnvelope" }] }) } } },
        options: preflightOperation("preflightReadiness"),
      },
    },
  });
}

export const openApiDocument = createAiosOpenApiDocument();
openApiDocument.components.securitySchemes.CookieSession = { type: "apiKey", in: "cookie", name: "sb-access-token" };
Object.assign(openApiDocument.components.schemas, {
  ClientList: zodJsonSchema(clientListDtoSchema),
  Client: zodJsonSchema(clientDtoSchema),
  Contact: zodJsonSchema(contactDtoSchema),
  Project: zodJsonSchema(projectDtoSchema),
  Task: zodJsonSchema(taskDtoSchema),
  Assignment: zodJsonSchema(assignmentDtoSchema),
  TimeEntry: zodJsonSchema(timeEntryDtoSchema),
  TimeAggregation: zodJsonSchema(timeAggregationSchema),
  Deliverable: zodJsonSchema(deliverableDtoSchema),
  DeliveryGate: zodJsonSchema(deliveryGateResultSchema),
  Communication: zodJsonSchema(communicationDtoSchema),
  ClientInvoices: zodJsonSchema(clientInvoicesRelationSchema),
  ClientDeletionImpact: zodJsonSchema(clientDeletionImpactSchema),
  ClientDeletionPlan: zodJsonSchema(clientDeletionPlanSchema),
  Graph: zodJsonSchema(graphResponseSchema),
  GraphDirectory: zodJsonSchema(graphDirectoryResponseSchema),
  GraphNode: zodJsonSchema(nodeDataSchema),
  GraphNodeList: zodJsonSchema(graphNodeListResponseSchema),
  GraphNodeDetail: zodJsonSchema(graphNodeDetailSchema),
  GraphEdge: zodJsonSchema(edgeDataSchema),
  GraphEdgeCreate: zodJsonSchema(graphEdgeCreateInputSchema),
  GraphEdgeList: zodJsonSchema(graphEdgeListResponseSchema),
  GraphSearch: zodJsonSchema(graphSearchResponseSchema),
});
export { API_VERSION };
