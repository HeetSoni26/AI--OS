import { paginationQuerySchema, type PaginationQuery } from "@aios/contracts";
import type { z } from "zod";
import { ApiRequestError, formatZodIssues } from "./errors";

export type QueryInput = Request | URL | URLSearchParams | string;

export function getSearchParams(input: QueryInput): URLSearchParams {
  if (input instanceof Request) return new URL(input.url).searchParams;
  if (input instanceof URL) return input.searchParams;
  if (input instanceof URLSearchParams) return input;
  return new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
}

export function queryParamsToObject(input: QueryInput): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  getSearchParams(input).forEach((value, key) => {
    const existing = result[key];
    if (existing === undefined) result[key] = value;
    else result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  });
  return result;
}

export function parseQuery<TSchema extends z.ZodType>(schema: TSchema, input: QueryInput): z.output<TSchema> {
  const result = schema.safeParse(queryParamsToObject(input));
  if (!result.success) {
    throw new ApiRequestError("VALIDATION_FAILED", "Query parameters are invalid.", {
      status: 422,
      details: formatZodIssues(result.error),
    });
  }
  return result.data;
}

export function parsePaginationQuery(input: QueryInput): PaginationQuery {
  return parseQuery(paginationQuerySchema, input);
}
