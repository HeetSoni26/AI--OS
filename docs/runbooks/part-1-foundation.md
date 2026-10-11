# Part 1 Foundation Runbook

## Local setup

1. Install Node.js 20.9+ and npm 10+.
2. From the repository root, run `npm ci`.
3. Copy `apps/web/.env.example` to `apps/web/.env.local`.
4. Set Supabase URL and publishable/anon key for authentication smoke tests.
5. Set `AIOS_RATE_LIMIT_BACKEND=memory` only for local development. Production requires `upstash` plus both Upstash REST variables.
6. Set `AIOS_OWNER_EMAIL` to the single owner account.
7. Run `npm run dev` and open `http://localhost:3000`.

## Quality commands

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:coverage`
- `npm run test:e2e -- --project=chromium`
- `npm run build`
- `npm run check`

## Supabase console configuration

The SRS requires these settings to be configured in Supabase/Auth rather than inferred by application code:

- Email/password provider enabled.
- Google and GitHub OAuth providers enabled with production callback URLs.
- Password minimum length 8 plus letter, number, and special-character policy.
- Access token/JWT policy reviewed against the one-hour SRS target.
- Refresh-token policy reviewed against the 30-day SRS target.
- Session invalidation after password change enabled and smoke-tested.
- Site URL and redirect allowlist restricted to verified local/preview/production domains.

## Security notes

- Never put service-role keys in browser variables or commit `.env.local`.
- The health endpoint is intentionally minimal. Readiness output must not expose URLs, keys, database strings, or provider diagnostics publicly.
- Proxy is an optimistic refresh/redirect layer. Protected layouts, Server Actions, and route handlers must re-check the session and owner authorization.
- The in-memory login limiter is for local/test use only. Production startup must fail when the Upstash backend is selected but credentials are missing.
- OAuth credentials, token expiry, and provider settings must be configured in Supabase and hosting secret managers.

## Part 1 exit evidence

Record the exact command output for lint, type-check, tests, browser tests, accessibility checks, production build, bundle secret scan, and document-package validation. List any live Supabase/OAuth/Redis smoke checks that remain blocked by unavailable credentials; do not report them as passed.
