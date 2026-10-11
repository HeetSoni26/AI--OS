import "server-only";

import { getDatabaseClient, type OwnerIdentity, type PrismaClient } from "@aios/data";
import { idempotencyFingerprint, idempotencyKeySchema } from "@aios/platform";
import { IdempotencyStatus } from "@aios/data";
import { z } from "zod";
import { withAuthenticatedApi, type AuthenticatedApiContext, type AuthenticatedApiHandler, type AuthenticatedApiOptions } from "./auth";
import { ApiRequestError } from "./errors";
import { successResponse } from "./response";

export type Database = PrismaClient;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

export interface DomainServiceContext<TService> {
  database: Database;
  identity: OwnerIdentity;
  service: TService;
}

export interface IdempotentResult<T> {
  data: T;
  replayed: boolean;
}

function iso(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

export function apiIso(value: Date | null | undefined): string | null {
  return iso(value);
}

export function apiEnum(value: unknown): string {
  return String(value).toLowerCase();
}

export function apiNumber(value: { toString(): string } | number | null | undefined): number {
  return value == null ? 0 : Number(value.toString());
}

export function apiRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Adds the shared platform policy and converts typed domain failures to API errors. */
export function withDomainApi<TRouteContext = unknown>(
  mapError: (error: unknown) => ApiRequestError | unknown,
  handler: AuthenticatedApiHandler<TRouteContext>,
  options: AuthenticatedApiOptions = {},
) {
  return withAuthenticatedApi<TRouteContext>(async (request, context, routeContext) => {
    try {
      return await handler(request, context, routeContext);
    } catch (error) {
      throw mapError(error);
    }
  }, options);
}

export async function getDomainServiceContext<TService>(
  context: AuthenticatedApiContext,
  createService: (database: Database) => TService,
): Promise<DomainServiceContext<TService>> {
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
    service: createService(database),
  };
}

/** Success envelope without an `error` key (the client treats any error key as failure). */
export function domainSuccess(data: unknown, requestId: string, options: { status?: number; headers?: HeadersInit } = {}): Response {
  return successResponse(data, {
    requestId,
    ...(options.status !== undefined ? { status: options.status } : {}),
    ...(options.headers ? { headers: options.headers } : {}),
  });
}

export function requirePathUuid(value: string, field = "id"): string {
  if (!UUID_PATTERN.test(value)) {
    throw new ApiRequestError("VALIDATION_FAILED", `${field} must be a valid UUID.`, { status: 422 });
  }
  return value;
}

/** Optional Idempotency-Key support for domain JSON mutations. */
export async function domainIdempotent<T>(
  request: Request,
  context: DomainServiceContext<unknown>,
  operation: string,
  payload: unknown,
  execute: () => Promise<T>,
): Promise<IdempotentResult<T>> {
  const rawKey = request.headers.get("idempotency-key");
  if (!rawKey) return { data: await execute(), replayed: false };
  const parsedKey = idempotencyKeySchema.safeParse(rawKey);
  if (!parsedKey.success) {
    throw new ApiRequestError("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key is invalid.", { status: 422 });
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
      throw new ApiRequestError("IDEMPOTENCY_IN_PROGRESS", "An identical request is already processing.", { status: 409, headers: { "retry-after": "2" } });
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
      throw new ApiRequestError("IDEMPOTENCY_IN_PROGRESS", "An identical request is already processing.", { status: 409, headers: { "retry-after": "2" } });
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

export function domainIdempotentSuccess<T>(result: IdempotentResult<T>, requestId: string): Response {
  const headers = new Headers({ "idempotency-replayed": String(result.replayed) });
  return successResponse(result.data, { requestId, headers });
}

export { z };


/**
 * Resolves the active OwnerAccount for an authenticated context. In public
 * demo mode the synthetic demo identity falls back to the single active owner
 * (this is a single-operator system, so there is exactly one to find).
 */
export async function resolveOwnerRecord(
  database: Database,
  ownerSubject: string,
  ownerEmail: string,
): Promise<{ id: string; authSubject: string }> {
  const byMatch = await database.ownerAccount.findFirst({
    where: {
      active: true,
      OR: [
        ...(UUID_PATTERN.test(ownerSubject) ? [{ authSubject: ownerSubject }] : []),
        { email: { equals: ownerEmail, mode: "insensitive" as const } },
      ],
    },
    select: { id: true, authSubject: true },
  });
  if (byMatch) return byMatch;
  if (process.env.AIOS_DEMO_MODE === "true") {
    const fallback = await database.ownerAccount.findFirst({
      where: { active: true },
      select: { id: true, authSubject: true },
    });
    if (fallback) return fallback;
  }
  throw new ApiRequestError("FORBIDDEN", "The authenticated owner is not active.", { status: 403 });
}
