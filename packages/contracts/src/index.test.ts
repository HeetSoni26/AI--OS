import { describe, expect, it } from "vitest";
import {
  API_RATE_LIMIT_REQUESTS,
  API_RATE_LIMIT_WINDOW_SECONDS,
  API_VERSION,
  FILE_UPLOAD_BODY_LIMIT_BYTES,
  InvalidCursorError,
  STANDARD_REQUEST_BODY_LIMIT_BYTES,
  apiErrorSchema,
  apiResponseMetaSchema,
  createApiSuccessSchema,
  createOpenApiDocument,
  decodeCursor,
  encodeCursor,
  graphDirectoryResponseSchema,
  graphEdgeCreateInputSchema,
  healthResponseSchema,
  nodeDataSchema,
  ownerNavigationSchema,
  paginationQuerySchema,
} from "./index";

describe("shared API contracts", () => {
  it("accepts a healthy service response", () => {
    expect(
      healthResponseSchema.parse({
        status: "ok",
        service: "aios-web",
        timestamp: new Date().toISOString(),
        version: "0.1.0",
      }),
    ).toBeTruthy();
  });

  it("rejects navigation targets outside the application", () => {
    expect(() => ownerNavigationSchema.parse({ label: "Unsafe", href: "https://example.com", description: "External", icon: "link" })).toThrow();
  });

  it("requires the normalized API error envelope", () => {
    expect(apiErrorSchema.safeParse({ message: "wrong shape" }).success).toBe(false);
    expect(
      apiErrorSchema.parse({
        error: { code: "NOT_FOUND", message: "The resource was not found." },
        meta: { requestId: "req_123", apiVersion: API_VERSION },
      }),
    ).toBeTruthy();
  });

  it("validates normalized success metadata", () => {
    const schema = createApiSuccessSchema(healthResponseSchema);
    const response = schema.parse({
      data: { status: "ok", service: "aios-web", timestamp: new Date().toISOString(), version: "0.1.0" },
      meta: { total: 1, cursor: null, hasMore: false, requestId: "req_123", apiVersion: API_VERSION },
    });
    expect(apiResponseMetaSchema.parse(response.meta)).toMatchObject({ total: 1, hasMore: false, apiVersion: "v1" });
    expect(schema.safeParse({ data: response.data }).success).toBe(false);
  });

  it("coerces bounded cursor pagination query values", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 25 });
    expect(paginationQuerySchema.parse({ limit: "100", cursor: "opaque_cursor" })).toEqual({ limit: 100, cursor: "opaque_cursor" });
    expect(paginationQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("round-trips opaque Unicode cursor state and rejects malformed cursors", () => {
    const value = { createdAt: "2026-07-31T00:00:00.000Z", id: "客户_42" };
    const cursor = encodeCursor(value);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor)).toEqual(value);
    expect(() => decodeCursor("not-a-valid-payload")).toThrow(InvalidCursorError);
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() => encodeCursor(circular)).toThrow(InvalidCursorError);
  });

  it("exports platform limits from one contract", () => {
    expect(STANDARD_REQUEST_BODY_LIMIT_BYTES).toBe(10 * 1024 * 1024);
    expect(FILE_UPLOAD_BODY_LIMIT_BYTES).toBe(100 * 1024 * 1024);
    expect(API_RATE_LIMIT_REQUESTS).toBe(100);
    expect(API_RATE_LIMIT_WINDOW_SECONDS).toBe(60);
  });

  it("keeps graph UUID, stable projection key, and source UUID explicit in read and write contracts", () => {
    const node = nodeDataSchema.parse({
      id: "00000000-0000-4000-8000-000000000101",
      stableKey: "client:00000000-0000-4000-8000-000000000201",
      entityId: "00000000-0000-4000-8000-000000000201",
      type: "client",
      label: "Acme",
      summary: null,
      status: "active",
      action: "active_running",
      tags: [],
      hubKeys: ["clients"],
      position: null,
      metadata: { name: "Acme", industry: null, mrr: 0, status: "active", startDate: null, projectsCount: 0 },
    });
    expect(new Set([node.id, node.stableKey, node.entityId])).toHaveLength(3);
    expect(graphEdgeCreateInputSchema.safeParse({ sourceNodeId: node.stableKey, targetNodeId: node.id, type: "reference" }).success).toBe(false);
    expect(graphDirectoryResponseSchema.parse({
      total: 1,
      groups: [{ key: "clients", label: "Clients", count: 1, items: [{ nodeId: node.id, stableKey: node.stableKey, entityId: node.entityId, label: node.label, nodeType: node.type, status: node.status, statusLabel: "Active", secondaryLabel: null, hubKeys: node.hubKeys, sortValue: null }] }],
    }).groups[0]?.items[0]).toMatchObject({ nodeId: node.id, stableKey: node.stableKey, entityId: node.entityId });
  });

  it("generates an OpenAPI 3.1 document with bearer security and reusable schemas", () => {
    const document = createOpenApiDocument({ paths: { "/api/v1/example": { get: { responses: { "200": { description: "OK" } } } } } });
    expect(document.openapi).toBe("3.1.0");
    expect(document.security).toEqual([{ BearerAuth: [] }]);
    expect(document.components.securitySchemes.BearerAuth).toMatchObject({ type: "http", scheme: "bearer", bearerFormat: "JWT" });
    expect(document.components.schemas).toHaveProperty("ApiErrorEnvelope");
    expect(document.components.schemas).toHaveProperty("PaginationQuery");
    expect(document.paths).toHaveProperty("/api/v1/example");
  });
});
