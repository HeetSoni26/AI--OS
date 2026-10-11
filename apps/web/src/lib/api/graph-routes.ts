import "server-only";

import {
  graphEntityIdSchema,
  type AuthContext,
} from "@aios/contracts";
import {
  GraphOperationsError,
  IdempotencyStatus,
  createGraphService,
  getDatabaseClient,
  type GraphOperationsErrorCode,
  type OwnerIdentity,
  type PrismaGraphService,
} from "@aios/data";
import { idempotencyFingerprint, idempotencyKeySchema } from "@aios/platform";
import { z } from "zod";
import { withAuthenticatedApi, type AuthenticatedApiHandler, type AuthenticatedApiOptions } from "./auth";
import { ApiRequestError, formatZodIssues } from "./errors";
import { resolveOwnerRecord } from "./domain-service";
import { queryParamsToObject, type QueryInput } from "./query";
import { successResponse, type ApiSuccessOptions } from "./response";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_ALLOWED_ORIGINS = process.env.AIOS_CORS_ORIGINS ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

type Database = ReturnType<typeof getDatabaseClient>;
type GraphMethod = "GET" | "POST" | "DELETE" | "OPTIONS";

export interface GraphApiServiceContext {
  database: Database;
  identity: OwnerIdentity;
  service: PrismaGraphService;
}

export interface GraphIdempotentResult<T> {
  data: T;
  replayed: boolean;
}

export const graphEmptyQuerySchema = z.strictObject({});

const graphErrorDefinitions = {
  INVALID_IDENTITY: { status: 403, message: "The authenticated owner is not authorized for graph operations." },
  INVALID_INPUT: { status: 422, message: "The graph operation input is invalid." },
  INVALID_CURSOR: { status: 422, message: "The graph cursor is invalid or does not match the active filters." },
  NOT_FOUND: { status: 404, message: "The requested graph resource was not found." },
  CONFLICT: { status: 409, message: "The graph operation conflicts with current state." },
  SOURCE_NOT_FOUND: { status: 404, message: "The source graph node was not found." },
  TARGET_NOT_FOUND: { status: 404, message: "The target graph node was not found." },
  SELF_REFERENCE: { status: 422, message: "A graph node cannot relate to itself." },
  DUPLICATE_EDGE: { status: 409, message: "That graph relationship already exists." },
  INVALID_ENDPOINT_TYPES: { status: 422, message: "The graph relationship does not support those endpoint types." },
  PROJECTED_EDGE_IMMUTABLE: { status: 409, message: "Projected graph relationships must be changed through their owning domain." },
} as const satisfies Record<GraphOperationsErrorCode, { status: number; message: string }>;

function allowedOrigins(): string[] {
  return [...new Set(DEFAULT_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean))];
}

/** Applies the shared secured API boundary and route-specific CORS methods to graph handlers. */
export function withGraphApi<TRouteContext = unknown>(
  handler: AuthenticatedApiHandler<TRouteContext>,
  allowedMethods: readonly GraphMethod[],
  options: AuthenticatedApiOptions = {},
) {
  const cors = options.cors ?? { allowedOrigins: allowedOrigins(), maxAgeSeconds: 600 };
  return withAuthenticatedApi<TRouteContext>(async (request, context, routeContext) => {
    try {
      return await handler(request, context, routeContext);
    } catch (error) {
      throw mapGraphOperationsError(error);
    }
  }, { ...options, cors: { ...cors, allowedMethods } });
}

/** Resolves the auth subject/email to one active database owner before constructing the graph service identity. */
export async function getGraphApiServiceContext(context: AuthContext): Promise<GraphApiServiceContext> {
  const database = getDatabaseClient();
  const owner = await resolveOwnerRecord(database, context.owner.id, context.owner.email);
  return {
    database,
    identity: {
      ownerSubject: owner.authSubject,
      ownerAccountId: owner.id,
      correlationId: context.requestId,
      actorType: "owner",
    },
    service: createGraphService(database),
  };
}

/** Parses strict graph query schemas while normalizing repeated and comma-delimited array parameters. */
export function parseGraphQuery<TSchema extends z.ZodType>(
  schema: TSchema,
  input: QueryInput,
  arrayKeys: readonly string[] = [],
): z.output<TSchema> {
  const object = queryParamsToObject(input);
  const searchParams = input instanceof Request
    ? new URL(input.url).searchParams
    : input instanceof URL
      ? input.searchParams
      : input instanceof URLSearchParams
        ? input
        : new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
  for (const key of arrayKeys) {
    if (!searchParams.has(key)) continue;
    object[key] = searchParams.getAll(key).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  }
  const result = schema.safeParse(object);
  if (!result.success) {
    throw new ApiRequestError("VALIDATION_FAILED", "Query parameters are invalid.", {
      status: 422,
      details: formatZodIssues(result.error),
    });
  }
  return result.data;
}

export function parseGraphPath<TSchema extends z.ZodType>(schema: TSchema, value: unknown, field: string): z.output<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiRequestError("VALIDATION_FAILED", `${field} is invalid.`, {
      status: 422,
      details: formatZodIssues(result.error),
    });
  }
  return result.data;
}

export function parseGraphEdgeId(value: unknown): string {
  return parseGraphPath(graphEntityIdSchema, value, "edgeId");
}

/** Converts only known graph-domain failures to canonical public errors; unknown failures remain masked. */
export function mapGraphOperationsError(error: unknown): ApiRequestError | unknown {
  if (!(error instanceof GraphOperationsError)) return error;
  const definition = graphErrorDefinitions[error.code];
  return new ApiRequestError(error.code, definition.message, { status: definition.status, cause: error });
}

/** Optional Idempotency-Key support for graph edge create and delete mutations. */
export async function executeGraphIdempotent<T>(
  request: Request,
  context: GraphApiServiceContext,
  operation: string,
  payload: unknown,
  execute: () => Promise<T>,
): Promise<GraphIdempotentResult<T>> {
  const rawKey = request.headers.get("idempotency-key");
  if (!rawKey) return { data: await execute(), replayed: false };
  const parsedKey = idempotencyKeySchema.safeParse(rawKey);
  if (!parsedKey.success) {
    throw new ApiRequestError("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key is invalid.", {
      status: 422,
      details: formatZodIssues(parsedKey.error),
    });
  }
  if (operation.length > 150) throw new Error("Idempotency operation names must not exceed 150 characters.");

  const key = parsedKey.data;
  const fingerprint = idempotencyFingerprint(key, operation, payload);
  const unique = { ownerSubject: context.identity.ownerSubject, idempotencyKey: key, operation };
  let record = await context.database.idempotencyRecord.findUnique({
    where: { ownerSubject_idempotencyKey_operation: unique },
  });
  if (record) {
    if (record.requestFingerprint !== fingerprint) {
      throw new ApiRequestError("IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used with a different request.", { status: 409 });
    }
    if (record.status === IdempotencyStatus.COMPLETED && record.responseBody && typeof record.responseBody === "object" && !Array.isArray(record.responseBody)) {
      const data = (record.responseBody as { data?: T }).data;
      if (data !== undefined) return { data, replayed: true };
    }
    if (record.status === IdempotencyStatus.PROCESSING && record.expiresAt > new Date()) {
      throw new ApiRequestError("IDEMPOTENCY_IN_PROGRESS", "An identical request is already processing.", {
        status: 409,
        headers: { "retry-after": "2" },
      });
    }
    record = await context.database.idempotencyRecord.update({
      where: { id: record.id },
      data: { status: IdempotencyStatus.PROCESSING, expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS) },
    });
  } else {
    try {
      record = await context.database.idempotencyRecord.create({
        data: {
          ownerSubject: context.identity.ownerSubject,
          idempotencyKey: key,
          operation,
          requestFingerprint: fingerprint,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        },
      });
    } catch {
      const concurrent = await context.database.idempotencyRecord.findUnique({
        where: { ownerSubject_idempotencyKey_operation: unique },
      });
      if (!concurrent || concurrent.requestFingerprint !== fingerprint) {
        throw new ApiRequestError("IDEMPOTENCY_CONFLICT", "Idempotency-Key could not be acquired.", { status: 409 });
      }
      throw new ApiRequestError("IDEMPOTENCY_IN_PROGRESS", "An identical request is already processing.", {
        status: 409,
        headers: { "retry-after": "2" },
      });
    }
  }

  try {
    const data = await execute();
    await context.database.idempotencyRecord.update({
      where: { id: record.id },
      data: {
        status: IdempotencyStatus.COMPLETED,
        responseStatus: 200,
        responseBody: JSON.parse(JSON.stringify({ data })),
      },
    });
    return { data, replayed: false };
  } catch (error) {
    await context.database.idempotencyRecord.update({ where: { id: record.id }, data: { status: IdempotencyStatus.FAILED } }).catch(() => undefined);
    throw error;
  }
}

export function graphIdempotentSuccessResponse<T>(
  result: GraphIdempotentResult<T>,
  requestId: string,
  options: Omit<ApiSuccessOptions, "requestId"> = {},
): Response {
  const headers = new Headers(options.headers);
  headers.set("idempotency-replayed", String(result.replayed));
  return successResponse(result.data, { ...options, requestId, headers });
}
