# API v1 Conventions

## Resource contract

- Base prefix: `/api/v1`
- Media type: JSON; file uploads use explicit multipart/streaming routes.
- Authentication: validated Supabase bearer token or owner cookie session; production owner email allowlist required.
- Success: `{ "data": ..., "meta": { "total", "cursor", "hasMore", "requestId", "apiVersion" } }`
- Error: `{ "error": { "code", "message", "details?" }, "meta": { "requestId", "apiVersion" } }`
- Pagination: opaque base64url cursor, default 25, maximum 100.
- Rate: 100 requests/minute per authenticated session; production uses Upstash and fails closed if unavailable.
- Standard body limit: 10 MiB buffered JSON; upload limit: 100 MiB streamed to scanning/storage.
- Correlation: accept a safe `x-request-id`/`x-correlation-id` and return both.
- Cache: authenticated API responses default to `no-store`.

## Handler order

1. Establish or validate request/correlation ID.
2. Validate actual/preflight origin, requested method, and requested headers.
3. Resolve authenticated owner without redirects. Validate bearer tokens using Supabase `getUser(token)`.
4. For cookie-authenticated mutations, enforce trusted-origin/CSRF policy.
5. Enforce per-session rate limit.
6. Enforce declared and streamed body limit.
7. Parse query/body with Zod.
8. Execute application service; route handlers contain no domain policy.
9. Persist redacted audit and outbox intent in the business transaction when relevant.
10. Return normalized envelope, correlation/version headers, and rate-limit headers.

## Error taxonomy baseline

- `INVALID_JSON` (400)
- `UNAUTHORIZED` (401)
- `FORBIDDEN`, `CORS_REJECTED`, `CSRF_REJECTED` (403)
- `NOT_FOUND` (404)
- `CONFLICT` (409)
- `BODY_TOO_LARGE` (413)
- `VALIDATION_FAILED` (422)
- `RATE_LIMITED` (429)
- `INTERNAL_SERVER_ERROR` (500; never expose unknown error details)
- `RATE_LIMIT_UNAVAILABLE` (503; fail closed)

## OpenAPI

`GET /api/openapi` exposes OpenAPI 3.1. Public operations override global bearer security. Every route change must update schemas, security, parameters, headers, examples, and errors in the same change.

`npm run openapi:validate` compares filesystem route handlers, the route registry, and documented paths. Unit tests validate normalized responses. Drift fails CI.
