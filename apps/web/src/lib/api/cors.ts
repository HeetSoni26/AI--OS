const DEFAULT_ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const DEFAULT_ALLOWED_HEADERS = ["authorization", "content-type", "idempotency-key", "x-request-id", "x-correlation-id"];
const DEFAULT_EXPOSED_HEADERS = ["x-api-version", "x-request-id", "x-correlation-id", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"];

export interface CorsOptions {
  allowedOrigins: readonly string[];
  allowedMethods?: readonly string[];
  allowedHeaders?: readonly string[];
  exposedHeaders?: readonly string[];
  allowCredentials?: boolean;
  maxAgeSeconds?: number;
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(",").map((origin) => origin.trim()).filter(Boolean))];
}

export function getCorsHeaders(request: Request, options: CorsOptions): Headers {
  const headers = new Headers({ vary: "Origin" });
  const origin = request.headers.get("origin");
  if (!origin || !options.allowedOrigins.includes(origin)) return headers;

  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", (options.allowedMethods ?? DEFAULT_ALLOWED_METHODS).join(", "));
  headers.set("access-control-allow-headers", (options.allowedHeaders ?? DEFAULT_ALLOWED_HEADERS).join(", "));
  headers.set("access-control-expose-headers", (options.exposedHeaders ?? DEFAULT_EXPOSED_HEADERS).join(", "));
  if (options.allowCredentials ?? true) headers.set("access-control-allow-credentials", "true");
  if (options.maxAgeSeconds !== undefined) headers.set("access-control-max-age", String(options.maxAgeSeconds));
  return headers;
}

export function corsPreflightResponse(request: Request, options: CorsOptions): Response {
  const origin = request.headers.get("origin");
  const method = request.headers.get("access-control-request-method")?.toUpperCase();
  const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  const allowedMethods = (options.allowedMethods ?? DEFAULT_ALLOWED_METHODS).map((value) => value.toUpperCase());
  const allowedHeaders = (options.allowedHeaders ?? DEFAULT_ALLOWED_HEADERS).map((value) => value.toLowerCase());
  const allowed = origin !== null
    && options.allowedOrigins.includes(origin)
    && (!method || allowedMethods.includes(method))
    && requestedHeaders.every((header) => allowedHeaders.includes(header));
  return new Response(null, {
    status: allowed ? 204 : 403,
    headers: getCorsHeaders(request, options),
  });
}
