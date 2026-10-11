import { API_VERSION, STANDARD_REQUEST_BODY_LIMIT_BYTES } from "@aios/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GET as getOpenApi } from "@/app/api/openapi/route";
import { limitedUploadBody, parseJsonBody, readBodyBytes, withLimitedBody } from "./body";
import { corsPreflightResponse, getCorsHeaders, parseAllowedOrigins } from "./cors";
import { ApiRequestError } from "./errors";
import { openApiDocument } from "./openapi";
import { parsePaginationQuery, parseQuery } from "./query";
import { getRateLimitHeaders } from "./rate-limit";
import { getRequestId } from "./request-id";
import { errorResponse, successResponse } from "./response";

describe("API responses and correlation", () => {
  it("returns a normalized success envelope and platform headers", async () => {
    const response = successResponse([{ id: "one" }], {
      requestId: "req_123",
      meta: { total: 2, cursor: "next_cursor", hasMore: true },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req_123");
    expect(response.headers.get("x-correlation-id")).toBe("req_123");
    expect(response.headers.get("x-api-version")).toBe(API_VERSION);
    expect(await response.json()).toEqual({
      data: [{ id: "one" }],
      meta: { total: 2, cursor: "next_cursor", hasMore: true, requestId: "req_123", apiVersion: API_VERSION },
    });
  });

  it("returns a normalized error without exposing unspecified internals", async () => {
    const response = errorResponse(
      { code: "VALIDATION_FAILED", message: "Input is invalid.", details: [{ path: "name", message: "Required" }] },
      { status: 422, requestId: "req_456" },
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_FAILED", message: "Input is invalid.", details: [{ path: "name", message: "Required" }] },
      meta: { requestId: "req_456", apiVersion: API_VERSION },
    });
  });

  it("accepts safe inbound request IDs and replaces unsafe values", () => {
    expect(getRequestId(new Headers({ "x-request-id": "req_external-1" }))).toBe("req_external-1");
    expect(getRequestId(new Headers({ "x-request-id": "unsafe value\n" }))).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("API input helpers", () => {
  it("parses bounded pagination and typed query parameters", () => {
    expect(parsePaginationQuery("limit=10&cursor=opaque_cursor")).toEqual({ limit: 10, cursor: "opaque_cursor" });
    expect(parsePaginationQuery("")).toEqual({ limit: 25 });
    expect(parseQuery(z.object({ active: z.enum(["true", "false"]) }), "active=true")).toEqual({ active: "true" });
    expect(() => parsePaginationQuery("limit=1000")).toThrowError(ApiRequestError);
  });

  it("counts streamed body bytes even without Content-Length", async () => {
    const request = new Request("http://localhost/api/v1/example", { method: "POST", body: "12345" });
    await expect(readBodyBytes(request, { limitBytes: 4 })).rejects.toMatchObject({ code: "BODY_TOO_LARGE", status: 413 });
  });

  it("rejects declared oversized bodies before reading", async () => {
    const request = new Request("http://localhost/api/v1/example", {
      method: "POST",
      headers: { "content-length": String(STANDARD_REQUEST_BODY_LIMIT_BYTES + 1) },
      body: "{}",
    });
    await expect(readBodyBytes(request)).rejects.toMatchObject({ code: "BODY_TOO_LARGE", status: 413 });
  });

  it("aborts a streaming upload without buffering beyond its limit", async () => {
    const request = new Request("http://localhost/api/v1/upload", { method: "POST", body: "12345" });
    const reader = limitedUploadBody(request, 4).getReader();
    await expect(reader.read()).rejects.toMatchObject({ code: "BODY_TOO_LARGE", status: 413 });
  });

  it("validates JSON and recreates a readable bounded request", async () => {
    const request = new Request("http://localhost/api/v1/example", { method: "POST", body: JSON.stringify({ name: "Ada" }) });
    const bounded = await withLimitedBody(request, { limitBytes: 100 });
    expect(await parseJsonBody(bounded, z.object({ name: z.string().min(1) }))).toEqual({ name: "Ada" });

    const malformed = new Request("http://localhost/api/v1/example", { method: "POST", body: "{" });
    await expect(parseJsonBody(malformed, z.object({}))).rejects.toMatchObject({ code: "INVALID_JSON", status: 400 });
  });
});

describe("CORS and rate-limit policy", () => {
  const options = { allowedOrigins: ["https://app.example.com"], maxAgeSeconds: 600 };

  it("adds credentialed CORS headers only for allowlisted origins", () => {
    const allowed = new Request("https://api.example.com/api/v1", { headers: { origin: "https://app.example.com" } });
    const blocked = new Request("https://api.example.com/api/v1", { headers: { origin: "https://evil.example" } });
    expect(getCorsHeaders(allowed, options).get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(getCorsHeaders(allowed, options).get("access-control-allow-credentials")).toBe("true");
    expect(getCorsHeaders(blocked, options).has("access-control-allow-origin")).toBe(false);
    expect(parseAllowedOrigins(" https://a.example,https://a.example, https://b.example ")).toEqual(["https://a.example", "https://b.example"]);
  });

  it("accepts allowed preflight requests and rejects other origins", () => {
    const allowed = corsPreflightResponse(new Request("https://api.example.com", { method: "OPTIONS", headers: { origin: "https://app.example.com" } }), options);
    const blocked = corsPreflightResponse(new Request("https://api.example.com", { method: "OPTIONS", headers: { origin: "https://evil.example" } }), options);
    expect(allowed.status).toBe(204);
    expect(blocked.status).toBe(403);
  });

  it("formats standard rate-limit and retry headers", () => {
    const headers = getRateLimitHeaders({ allowed: false, limit: 100, remaining: 0, resetAt: new Date(10_000), retryAfterSeconds: 7 });
    expect(Object.fromEntries(headers)).toMatchObject({
      "retry-after": "7",
      "x-ratelimit-limit": "100",
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": "10",
    });
  });
});

describe("OpenAPI route", () => {
  it("publishes the generated OpenAPI 3.1 contract as JSON", async () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
    expect(openApiDocument.paths).toHaveProperty("/api/v1/health");
    expect(openApiDocument.components.securitySchemes).toHaveProperty("BearerAuth");

    const response = getOpenApi();
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual(openApiDocument);
  });
});
