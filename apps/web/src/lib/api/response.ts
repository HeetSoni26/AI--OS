import {
  API_VERSION,
  API_VERSION_HEADER,
  apiErrorEnvelopeSchema,
  createApiSuccessSchema,
  type ApiErrorDetail,
  type ApiResponseMeta,
  type PaginationMeta,
} from "@aios/contracts";
import type { z } from "zod";
import { getCorrelationHeaders } from "./request-id";

export interface ApiResponseOptions {
  status?: number;
  headers?: HeadersInit;
  requestId?: string;
}

export interface ApiSuccessOptions extends ApiResponseOptions {
  meta?: Partial<PaginationMeta>;
  schema?: z.ZodType;
}

function responseHeaders(requestId: string, headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  for (const [name, value] of getCorrelationHeaders(requestId)) result.set(name, value);
  result.set(API_VERSION_HEADER, API_VERSION);
  if (!result.has("cache-control")) result.set("cache-control", "no-store");
  return result;
}

export function successResponse<T>(data: T, options: ApiSuccessOptions & { requestId: string }): Response {
  const pagination: PaginationMeta = {
    total: options.meta?.total ?? (Array.isArray(data) ? data.length : 1),
    cursor: options.meta?.cursor ?? null,
    hasMore: options.meta?.hasMore ?? false,
  };
  const meta: ApiResponseMeta = { ...pagination, requestId: options.requestId, apiVersion: API_VERSION };
  const body = { data, meta };

  if (options.schema) createApiSuccessSchema(options.schema).parse(body);

  return Response.json(body, {
    status: options.status ?? 200,
    headers: responseHeaders(options.requestId, options.headers),
  });
}

export function errorResponse(error: ApiErrorDetail, options: ApiResponseOptions & { requestId: string }): Response {
  const body = apiErrorEnvelopeSchema.parse({
    error,
    meta: { requestId: options.requestId, apiVersion: API_VERSION },
  });
  return Response.json(body, {
    status: options.status ?? 500,
    headers: responseHeaders(options.requestId, options.headers),
  });
}

export function withResponseHeaders(response: Response, headers: HeadersInit): Response {
  const mergedHeaders = new Headers(response.headers);
  new Headers(headers).forEach((value, name) => mergedHeaders.set(name, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: mergedHeaders });
}
