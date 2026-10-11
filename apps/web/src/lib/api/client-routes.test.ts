import { beforeEach, describe, expect, it, vi } from "vitest";

const dataMocks = vi.hoisted(() => {
  class ClientOperationsError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly details?: Readonly<Record<string, unknown>>,
    ) {
      super(message);
      this.name = "ClientOperationsError";
    }
  }
  return { ClientOperationsError };
});
vi.mock("@aios/data", () => ({
  AssignmentType: { AGENT: "AGENT", HUMAN: "HUMAN" },
  ClientOperationsError: dataMocks.ClientOperationsError,
  IdempotencyStatus: { PROCESSING: "PROCESSING", COMPLETED: "COMPLETED", FAILED: "FAILED" },
  createClientOperationsService: vi.fn(),
  getDatabaseClient: vi.fn(),
}));

import { ClientOperationsError, IdempotencyStatus } from "@aios/data";
import { createMemoryApiRateLimiter, resetMemoryApiRateLimits } from "./rate-limit";
import { successResponse } from "./response";
import {
  executeIdempotent,
  manualTimeEntryCreateSchema,
  mapClientDto,
  mapClientOperationsError,
  parseEntityId,
  withClientApi,
  type ClientApiServiceContext,
} from "./client-routes";

const owner = { id: "7db01860-09c9-42c4-b993-283c5cfeb9d6", email: "owner@example.com", displayName: "Owner" };
const cors = { allowedOrigins: ["https://app.example.com"] };

beforeEach(() => resetMemoryApiRateLimits());

describe("client route authentication and error boundary", () => {
  it("returns an authenticated normalized success envelope", async () => {
    const route = withClientApi(async (_request, context) => successResponse({ ownerId: context.ownerId }, { requestId: context.requestId }), {
      cors,
      resolveOwner: async () => owner,
      rateLimiter: createMemoryApiRateLimiter(),
    });
    const response = await route(new Request("https://api.example.com/api/v1/clients", {
      headers: { authorization: "Bearer token", "x-request-id": "req_clients_success" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { ownerId: owner.id }, meta: { requestId: "req_clients_success" } });
  });

  it("rejects unauthenticated requests before reaching the client handler", async () => {
    const handler = vi.fn(async () => new Response("not reached"));
    const route = withClientApi(handler, {
      cors,
      resolveOwner: async () => null,
      rateLimiter: createMemoryApiRateLimiter(),
    });
    const response = await route(new Request("https://api.example.com/api/v1/clients"));
    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("maps safe transactional service failures without exposing internals", async () => {
    const route = withClientApi(async () => {
      throw new ClientOperationsError("DELIVERY_BLOCKED", "Complete required deliverables.", {
        blockers: [{ deliverableId: "6bdfe89f-359f-4d40-bbd6-5f3e998771ab", title: "Owner approval", reason: "required_incomplete" }],
      });
    }, {
      cors,
      resolveOwner: async () => owner,
      rateLimiter: createMemoryApiRateLimiter(),
    });
    const response = await route(new Request("https://api.example.com/api/v1/clients/one", {
      headers: { authorization: "Bearer token", "x-request-id": "req_delivery_gate" },
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "DELIVERY_BLOCKED", details: { blockers: [{ reason: "required_incomplete" }] } },
      meta: { requestId: "req_delivery_gate" },
    });
  });
});

describe("client route validation and DTO adapters", () => {
  it("rejects invalid path UUIDs with a 422 API error", () => {
    expect(() => parseEntityId("not-a-uuid", "clientId")).toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED", status: 422 }));
    expect(parseEntityId("e11791d8-d71f-4ea9-a2e2-46bbeb10618d", "clientId")).toBe("e11791d8-d71f-4ea9-a2e2-46bbeb10618d");
  });

  it("validates manual time boundaries before service execution", () => {
    const result = manualTimeEntryCreateSchema.safeParse({
      projectId: "5798eca6-0d79-41ad-9564-c81630c74beb",
      startedAt: "2026-08-01T10:00:00.000Z",
      endedAt: "2026-08-01T09:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]).toMatchObject({ path: ["endedAt"] });
  });

  it("normalizes database enums, dates, decimals, counts, and primary contact", () => {
    const dto = mapClientDto({
      id: "e11791d8-d71f-4ea9-a2e2-46bbeb10618d",
      name: "Acme",
      industry: "Automation",
      status: "ACTIVE",
      website: "https://acme.example",
      logoFileId: null,
      mrr: { toString: () => "1250.50" },
      totalRevenue: { toString: () => "6000.00" },
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      contactName: "Ada",
      contactEmail: "ada@acme.example",
      contactPhone: "+1 555 0100",
      notes: "Owner-only notes",
      archivedAt: null,
      deletedAt: null,
      createdAt: new Date("2026-07-01T10:00:00.000Z"),
      updatedAt: new Date("2026-08-01T10:00:00.000Z"),
      contacts: [{ id: "a726ca91-bdd1-4cf0-aef1-8d68acafacbb", name: "Ada", isPrimary: true }],
      projects: [{ id: "a55b6137-2c38-4102-a8c4-00af441188be" }],
      auditSummaries: [{
        id: "90774d78-c553-4bbb-96b3-00230a0804b6",
        action: "update",
        entityType: "client",
        entityId: "e11791d8-d71f-4ea9-a2e2-46bbeb10618d",
        actorType: "owner",
        correlationId: "req_client_audit",
        changeSummary: { changedFields: ["status"] },
        createdAt: new Date("2026-08-01T09:00:00.000Z"),
      }],
    });
    expect(dto).toMatchObject({
      status: "active",
      mrr: 1250.5,
      startDate: "2026-07-01",
      primaryContactName: "Ada",
      contactCount: 1,
      projectCount: 1,
      auditSummaries: [{ action: "update", createdAt: "2026-08-01T09:00:00.000Z", changeSummary: { changedFields: ["status"] } }],
    });
  });

  it("maps each domain error code to the expected HTTP boundary", () => {
    expect(mapClientOperationsError(new ClientOperationsError("NOT_FOUND", "Missing"))).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(mapClientOperationsError(new ClientOperationsError("INVALID_INPUT", "Invalid"))).toMatchObject({ status: 422, code: "INVALID_INPUT" });
    expect(mapClientOperationsError(new ClientOperationsError("INVALID_IDENTITY", "Forbidden"))).toMatchObject({ status: 403, code: "INVALID_IDENTITY" });
  });
});

describe("client mutation idempotency", () => {
  it("replays a completed response and rejects key reuse with another payload", async () => {
    type RecordRow = {
      id: string;
      ownerSubject: string;
      idempotencyKey: string;
      operation: string;
      requestFingerprint: string;
      status: string;
      responseBody: unknown;
      expiresAt: Date;
    };
    let row: RecordRow | null = null;
    const idempotencyRecord = {
      findUnique: vi.fn(async () => row),
      create: vi.fn(async ({ data }: { data: Omit<RecordRow, "id" | "status" | "responseBody"> }) => {
        row = { id: "94917546-cdb0-43bd-b0fb-cf2c3f8b3664", ...data, status: IdempotencyStatus.PROCESSING, responseBody: null };
        return row;
      }),
      update: vi.fn(async ({ data }: { data: Partial<RecordRow> }) => {
        row = { ...row!, ...data };
        return row;
      }),
    };
    const services = {
      database: { idempotencyRecord },
      identity: {
        ownerSubject: owner.id,
        ownerAccountId: "3f7760fe-b5c3-4f59-b1e0-884181ed99b3",
        correlationId: "req_idempotent",
      },
      service: {},
    } as unknown as ClientApiServiceContext;
    const request = new Request("https://api.example.com/api/v1/clients", { headers: { "idempotency-key": "client_test_001" } });
    const execute = vi.fn(async () => ({ id: "e11791d8-d71f-4ea9-a2e2-46bbeb10618d" }));

    const first = await executeIdempotent(request, services, "clients.create", { name: "Acme" }, execute);
    const replay = await executeIdempotent(request, services, "clients.create", { name: "Acme" }, execute);
    expect(first.replayed).toBe(false);
    expect(replay).toEqual({ data: first.data, replayed: true });
    expect(execute).toHaveBeenCalledTimes(1);

    await expect(executeIdempotent(request, services, "clients.create", { name: "Different" }, execute)).rejects.toMatchObject({
      status: 409,
      code: "IDEMPOTENCY_CONFLICT",
    });
  });
});
