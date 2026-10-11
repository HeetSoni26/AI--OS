import "server-only";

import { createHash } from "node:crypto";
import { API_VERSION, API_VERSION_HEADER, type AuthContext } from "@aios/contracts";
import { log } from "@aios/observability";
import { getOwner, type OwnerIdentity } from "@/lib/auth/guards";
import { isTrustedMutationOrigin } from "@/lib/security/csrf";
import { withLimitedBody } from "./body";
import { corsPreflightResponse, getCorsHeaders, parseAllowedOrigins, type CorsOptions } from "./cors";
import { ApiRequestError } from "./errors";
import { createConfiguredApiRateLimiter, createRateLimitInput, getRateLimitHeaders, type ApiRateLimiter } from "./rate-limit";
import { getCorrelationHeaders, getRequestId } from "./request-id";
import { errorResponse, withResponseHeaders } from "./response";

export type OwnerResolver = (accessToken?: string) => Promise<OwnerIdentity | null>;
export type AuthenticatedApiContext = AuthContext;
export type AuthenticatedApiHandler<TRouteContext = unknown> = (
  request: Request,
  context: AuthenticatedApiContext,
  routeContext: TRouteContext,
) => Response | Promise<Response>;

export interface AuthenticatedApiOptions {
  bodyLimitBytes?: number;
  bodyMode?: "buffer" | "stream";
  cors?: CorsOptions;
  rateLimiter?: ApiRateLimiter;
  resolveOwner?: OwnerResolver;
}

function defaultCorsOptions(): CorsOptions {
  return {
    allowedOrigins: parseAllowedOrigins(process.env.AIOS_CORS_ORIGINS ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    maxAgeSeconds: 600,
  };
}

function bearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization) return undefined;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match?.[1]) throw new ApiRequestError("UNAUTHORIZED", "A valid bearer token is required.", { status: 401, headers: { "www-authenticate": "Bearer" } });
  return match[1];
}

function sessionIdentifier(request: Request, ownerId: string, token?: string): string {
  const source = token ? `bearer:${token}` : request.headers.get("cookie") ? `cookie:${request.headers.get("cookie")}` : `owner:${ownerId}`;
  return createHash("sha256").update(source).digest("hex");
}

function isMutation(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export async function requireApiOwner(
  request: Request,
  resolveOwner: OwnerResolver = getOwner,
  requestId = getRequestId(request),
): Promise<AuthenticatedApiContext> {
  const token = bearerToken(request);
  const owner = await resolveOwner(token);
  if (!owner) {
    throw new ApiRequestError("UNAUTHORIZED", "Authentication is required.", {
      status: 401,
      headers: { "www-authenticate": "Bearer" },
    });
  }
  if (!token && isMutation(request.method) && !isTrustedMutationOrigin(request)) {
    throw new ApiRequestError("CSRF_REJECTED", "The request origin is not trusted.", { status: 403 });
  }
  return {
    owner,
    ownerId: owner.id,
    userId: owner.id,
    sessionId: sessionIdentifier(request, owner.id, token),
    requestId,
    apiVersion: API_VERSION,
  };
}

function platformHeaders(requestId: string, corsHeaders: Headers, rateLimitHeaders?: Headers): Headers {
  const headers = new Headers(corsHeaders);
  getCorrelationHeaders(requestId).forEach((value, name) => headers.set(name, value));
  rateLimitHeaders?.forEach((value, name) => headers.set(name, value));
  headers.set(API_VERSION_HEADER, API_VERSION);
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return headers;
}

/** Applies owner auth, per-session throttling, CORS/CSRF, bounded bodies, and safe envelopes. */
export function withAuthenticatedApi<TRouteContext = unknown>(
  handler: AuthenticatedApiHandler<TRouteContext>,
  options: AuthenticatedApiOptions = {},
) {
  return async function authenticatedApiHandler(request: Request, routeContext?: TRouteContext): Promise<Response> {
    const requestId = getRequestId(request);
    const corsOptions = options.cors ?? defaultCorsOptions();
    const corsHeaders = getCorsHeaders(request, corsOptions);

    if (request.method === "OPTIONS") {
      return withResponseHeaders(corsPreflightResponse(request, corsOptions), platformHeaders(requestId, corsHeaders));
    }

    const origin = request.headers.get("origin");
    if (origin && !corsOptions.allowedOrigins.includes(origin)) {
      return errorResponse(
        { code: "CORS_REJECTED", message: "The request origin is not allowed." },
        { status: 403, requestId, headers: platformHeaders(requestId, corsHeaders) },
      );
    }

    let rateLimitHeaders: Headers | undefined;
    try {
      const context = await requireApiOwner(request, options.resolveOwner, requestId);
      let limiter: ApiRateLimiter;
      try {
        limiter = options.rateLimiter ?? createConfiguredApiRateLimiter();
      } catch (cause) {
        throw new ApiRequestError("RATE_LIMIT_UNAVAILABLE", "API rate limiting is temporarily unavailable.", { status: 503, cause });
      }

      let rateLimit;
      try {
        rateLimit = await limiter.check(createRateLimitInput(context.sessionId, request));
      } catch (cause) {
        throw new ApiRequestError("RATE_LIMIT_UNAVAILABLE", "API rate limiting is temporarily unavailable.", { status: 503, cause });
      }
      rateLimitHeaders = getRateLimitHeaders(rateLimit);
      if (!rateLimit.allowed) {
        throw new ApiRequestError("RATE_LIMITED", "Too many requests. Try again later.", { status: 429, headers: rateLimitHeaders });
      }

      const boundedRequest = options.bodyMode === "stream"
        ? request
        : await withLimitedBody(request, { limitBytes: options.bodyLimitBytes });
      const response = await handler(boundedRequest, context, routeContext as TRouteContext);
      return withResponseHeaders(response, platformHeaders(requestId, corsHeaders, rateLimitHeaders));
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const headers = platformHeaders(requestId, corsHeaders, rateLimitHeaders);
        new Headers(error.headers).forEach((value, name) => headers.set(name, value));
        return errorResponse(
          { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
          { status: error.status, requestId, headers },
        );
      }
      log("error", "Authenticated API request failed.", {
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return errorResponse(
        { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." },
        { status: 500, requestId, headers: platformHeaders(requestId, corsHeaders, rateLimitHeaders) },
      );
    }
  };
}

export const withApiAuth = withAuthenticatedApi;
