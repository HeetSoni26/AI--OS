import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { API_VERSION } from "@aios/contracts";
import { withAuthenticatedApi } from "./auth";
import { createMemoryApiRateLimiter, resetMemoryApiRateLimits, type ApiRateLimiter } from "./rate-limit";
import { successResponse } from "./response";

const owner = { id: "owner-1", email: "owner@example.com", displayName: "Owner" };
const cors = { allowedOrigins: ["https://app.example.com"] };

beforeEach(() => resetMemoryApiRateLimits());

describe("authenticated API policy chain", () => {
  it("returns a normalized 401 instead of redirecting", async () => {
    const route = withAuthenticatedApi(async () => new Response(), {
      cors,
      resolveOwner: async () => null,
      rateLimiter: createMemoryApiRateLimiter(),
    });
    const response = await route(new Request("https://api.example.com/api/v1/example"));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(await response.json()).toMatchObject({
      error: { code: "UNAUTHORIZED" },
      meta: { apiVersion: API_VERSION },
    });
  });

  it("validates bearer auth, isolates the session identifier, and returns platform headers", async () => {
    let suppliedToken: string | undefined;
    let rateIdentifier = "";
    const rateLimiter: ApiRateLimiter = {
      async check(input) {
        rateIdentifier = input.identifier;
        return { allowed: true, limit: input.limit, remaining: 99, resetAt: new Date("2099-01-01T00:00:00Z") };
      },
    };
    const route = withAuthenticatedApi(async (_request, context) => successResponse({ ownerId: context.ownerId }, { requestId: context.requestId }), {
      cors,
      resolveOwner: async (token) => { suppliedToken = token; return owner; },
      rateLimiter,
    });
    const response = await route(new Request("https://api.example.com/api/v1/example", {
      headers: { authorization: "Bearer test.jwt.token", origin: "https://app.example.com", "x-request-id": "req_bearer" },
    }));
    expect(suppliedToken).toBe("test.jwt.token");
    expect(rateIdentifier).toMatch(/^[a-f0-9]{64}$/);
    expect(rateIdentifier).not.toContain("test.jwt.token");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req_bearer");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("99");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
  });

  it("rejects malformed bearer credentials and disallowed actual origins", async () => {
    const route = withAuthenticatedApi(async () => new Response("not reached"), {
      cors,
      resolveOwner: async () => owner,
      rateLimiter: createMemoryApiRateLimiter(),
    });
    const malformed = await route(new Request("https://api.example.com/api/v1/example", { headers: { authorization: "Basic credential" } }));
    expect(malformed.status).toBe(401);
    const blocked = await route(new Request("https://api.example.com/api/v1/example", { headers: { authorization: "Bearer token", origin: "https://evil.example" } }));
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ error: { code: "CORS_REJECTED" } });
  });

  it("enforces 100 requests per window and resets deterministically", async () => {
    let now = 1_000;
    const limiter = createMemoryApiRateLimiter(() => now);
    const input = { identifier: "session-one", request: new Request("https://api.example.com"), limit: 100, windowSeconds: 60 };
    for (let count = 0; count < 100; count += 1) expect((await limiter.check(input)).allowed).toBe(true);
    const denied = await limiter.check(input);
    expect(denied).toMatchObject({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    now += 60_000;
    expect(await limiter.check(input)).toMatchObject({ allowed: true, remaining: 99 });
  });

  it("fails closed when the rate-limit backend is unavailable", async () => {
    const route = withAuthenticatedApi(async () => new Response("not reached"), {
      cors,
      resolveOwner: async () => owner,
      rateLimiter: { async check() { throw new Error("redis unavailable"); } },
    });
    const response = await route(new Request("https://api.example.com/api/v1/example", { headers: { authorization: "Bearer token" } }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "RATE_LIMIT_UNAVAILABLE" } });
  });

  it("passes Next route context through authenticated dynamic handlers", async () => {
    const route = withAuthenticatedApi<{ params: Promise<{ clientId: string }> }>(async (_request, context, routeContext) => {
      const { clientId } = await routeContext.params;
      return successResponse({ clientId }, { requestId: context.requestId });
    }, {
      cors,
      resolveOwner: async () => owner,
      rateLimiter: createMemoryApiRateLimiter(),
    });
    const response = await route(
      new Request("https://api.example.com/api/v1/clients/client-1", { headers: { authorization: "Bearer token" } }),
      { params: Promise.resolve({ clientId: "client-1" }) },
    );
    expect(await response.json()).toMatchObject({ data: { clientId: "client-1" } });
  });

  it("enforces the configured route body limit", async () => {
    const route = withAuthenticatedApi(async () => new Response("not reached"), {
      bodyLimitBytes: 4,
      cors,
      resolveOwner: async () => owner,
      rateLimiter: createMemoryApiRateLimiter(),
    });
    const response = await route(new Request("https://api.example.com/api/v1/example", {
      method: "POST",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: "12345",
    }));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "BODY_TOO_LARGE" } });
  });
});
