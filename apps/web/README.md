# AI OS Web Application

Next.js App Router frontend and owner-authenticated `/api/v1` backend for the single-owner AI Automation Agency OS. Never expose service-role credentials or provider secrets through this package or any `NEXT_PUBLIC_*` variable.

## Scripts

```bash
npm run dev          # local development with hot reload
npm run build        # production build (Turbopack)
npm run start        # serve the production build
npm run lint         # ESLint (strict TypeScript rules)
npm run typecheck    # tsc --noEmit
npm run test         # Vitest component/unit suite
npm run test:coverage
npm run test:e2e     # Playwright desktop/tablet/mobile projects
```

## Graph runtime modes

`/knowledge-graph` works without any Realtime provider:

| `AIOS_REALTIME_ENABLED` + browser Supabase config | Status shown | Behavior |
|---|---|---|
| not set | `Live updates unconfigured` | Graph reads/mutations work; no subscription attempted |
| configured + connected | `Live updates connected` | Private topic `owner:<sub>:graph:updates`; schema-validated payloads, event-ID dedupe, cache reconciliation |
| transient failure | `Live updates reconnecting` → `unavailable` | Safe polling invalidates authorities after reconnect |

Graph fixture exclusion is enforced server-side; `seed:*` and reserved `10000000-…` synthetic rows cannot leak into owner views.

## Quality gates

The parent repository's `npm run check` covers lint, all workspace typechecks, 133 web component/API tests, Next production build, OpenAPI route drift (37 entries), and a client-bundle secret scan over every emitted static asset. Part 4 adds three device Playwright projects with axe-guarded desktop, tablet directory, and mobile list journeys.
