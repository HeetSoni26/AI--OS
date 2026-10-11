import {
  lensFiltersSchema,
  lensUrlSearchParamsSchema,
  type LensFilters,
  type NodeData,
} from "@aios/contracts";
import { isNodeInHub } from "./hubs";

export const DEFAULT_LENS_FILTERS: LensFilters = Object.freeze({ entity: "all", function: "all", action: "all" });
export const EXCLUDED_NODE_OPACITY = 0.1 as const;
export const INCLUDED_NODE_OPACITY = 1 as const;
export const LENS_URL_PARAM_KEYS = Object.freeze({ entity: "entity", function: "function", action: "action" } as const);

export interface FilteredGraphNode {
  node: NodeData;
  included: boolean;
  opacity: typeof EXCLUDED_NODE_OPACITY | typeof INCLUDED_NODE_OPACITY;
}

export function matchesLensFilters(node: NodeData, input: LensFilters): boolean {
  const filters = lensFiltersSchema.parse(input);
  const entityMatches = filters.entity === "all" || node.type === filters.entity;
  const functionMatches = filters.function === "all" || isNodeInHub(node, filters.function);
  const actionMatches = filters.action === "all" || node.action === filters.action;
  return entityMatches && functionMatches && actionMatches;
}

/** Excluded nodes remain in the result at exactly 10% opacity to preserve spatial context. */
export function applyLensFilters(nodes: readonly NodeData[], input: LensFilters): FilteredGraphNode[] {
  const filters = lensFiltersSchema.parse(input);
  return nodes.map((node) => {
    const included = matchesLensFilters(node, filters);
    return { node, included, opacity: included ? INCLUDED_NODE_OPACITY : EXCLUDED_NODE_OPACITY };
  });
}

function toSearchParams(input: string | URLSearchParams): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  const query = input.includes("?") ? input.slice(input.indexOf("?") + 1) : input;
  return new URLSearchParams(query);
}

export function parseLensFilters(input: string | URLSearchParams): LensFilters {
  const params = toSearchParams(input);
  const parsed = lensUrlSearchParamsSchema.safeParse({
    entity: params.get(LENS_URL_PARAM_KEYS.entity) ?? undefined,
    function: params.get(LENS_URL_PARAM_KEYS.function) ?? undefined,
    action: params.get(LENS_URL_PARAM_KEYS.action) ?? undefined,
  });
  return parsed.success ? lensFiltersSchema.parse(parsed.data) : { ...DEFAULT_LENS_FILTERS };
}

/** Serializes only active filters and preserves unrelated URL parameters when supplied. */
export function serializeLensFilters(filtersInput: LensFilters, base: string | URLSearchParams = ""): string {
  const filters = lensFiltersSchema.parse(filtersInput);
  const params = toSearchParams(base);
  for (const key of Object.values(LENS_URL_PARAM_KEYS)) params.delete(key);
  if (filters.entity !== "all") params.set(LENS_URL_PARAM_KEYS.entity, filters.entity);
  if (filters.function !== "all") params.set(LENS_URL_PARAM_KEYS.function, filters.function);
  if (filters.action !== "all") params.set(LENS_URL_PARAM_KEYS.action, filters.action);
  return params.toString();
}

export function clearAllLensFilters(base: string | URLSearchParams = ""): { filters: LensFilters; search: string } {
  const params = toSearchParams(base);
  for (const key of Object.values(LENS_URL_PARAM_KEYS)) params.delete(key);
  return { filters: { ...DEFAULT_LENS_FILTERS }, search: params.toString() };
}
