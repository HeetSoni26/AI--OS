import type {
  GraphDirectoryQuery,
  GraphDirectoryResponse,
  GraphEdgeCreateInput,
  GraphEdgeListQuery,
  GraphEdgeListResponse,
  GraphNodeDetail,
  GraphNodeListQuery,
  GraphNodeListResponse,
  GraphResponse,
  GraphSearchQuery,
  GraphSearchResponse,
} from "@aios/contracts";
import { apiFetch } from "@/lib/api-client";

const GRAPH_PATH = "/api/v1/graph";

const data = <T>(path: string, init?: RequestInit) =>
  apiFetch<T>(path, init).then((response) => response.data);

const json = (method: string, body?: unknown, idempotencyKey?: string): RequestInit => ({
  method,
  ...((body !== undefined || idempotencyKey)
    ? {
        headers: {
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
      }
    : {}),
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

function appendMany(params: URLSearchParams, key: string, values?: readonly string[]) {
  values?.forEach((value) => params.append(key, value));
}

function nodeQueryString(query: GraphNodeListQuery): string {
  const params = new URLSearchParams({ limit: String(query.limit) });
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.status) params.set("status", query.status);
  appendMany(params, "types", query.types);
  appendMany(params, "hubs", query.hubs);
  appendMany(params, "actions", query.actions);
  return params.toString();
}

function edgeQueryString(query: GraphEdgeListQuery): string {
  const params = new URLSearchParams({ limit: String(query.limit) });
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.nodeId) params.set("nodeId", query.nodeId);
  appendMany(params, "types", query.types);
  return params.toString();
}

function directoryQueryString(query: GraphDirectoryQuery): string {
  const params = new URLSearchParams();
  if (query.query) params.set("query", query.query);
  appendMany(params, "groups", query.groups);
  return params.toString();
}

function searchQueryString(query: GraphSearchQuery): string {
  const params = new URLSearchParams({ query: query.query, limit: String(query.limit) });
  appendMany(params, "types", query.types);
  return params.toString();
}

/** Browser adapter for the complete Part 4 graph API surface. */
export const graphApi = {
  graph: () => data<GraphResponse>(GRAPH_PATH),
  nodes: (query: GraphNodeListQuery) =>
    data<GraphNodeListResponse>(`${GRAPH_PATH}/nodes?${nodeQueryString(query)}`),
  edges: (query: GraphEdgeListQuery) =>
    data<GraphEdgeListResponse>(`${GRAPH_PATH}/edges?${edgeQueryString(query)}`),
  detail: (nodeId: string) => data<GraphNodeDetail>(`${GRAPH_PATH}/nodes/${nodeId}`),
  search: (query: GraphSearchQuery) =>
    data<GraphSearchResponse>(`${GRAPH_PATH}/search?${searchQueryString(query)}`),
  directory: (query: GraphDirectoryQuery = {}) => {
    const search = directoryQueryString(query);
    return data<GraphDirectoryResponse>(`${GRAPH_PATH}/directory${search ? `?${search}` : ""}`);
  },
  createEdge: (input: GraphEdgeCreateInput, idempotencyKey?: string) =>
    data<GraphNodeDetail["connections"][number]["edge"]>(`${GRAPH_PATH}/edges`, json("POST", input, idempotencyKey)),
  deleteEdge: (edgeId: string, idempotencyKey?: string) =>
    data<{ deleted: boolean; id: string }>(`${GRAPH_PATH}/edges/${encodeURIComponent(edgeId)}`, json("DELETE", undefined, idempotencyKey)),
};

export const graphQueryKeys = {
  root: ["graph"] as const,
  complete: () => [...graphQueryKeys.root, "complete"] as const,
  directoryRoot: () => [...graphQueryKeys.root, "directory"] as const,
  directory: (query: GraphDirectoryQuery = {}) => [...graphQueryKeys.directoryRoot(), query] as const,
  detail: (nodeId: string) => [...graphQueryKeys.root, "detail", nodeId] as const,
  searchRoot: () => [...graphQueryKeys.root, "search"] as const,
  search: (query: GraphSearchQuery) => [...graphQueryKeys.searchRoot(), query] as const,
};
