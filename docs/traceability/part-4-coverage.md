# Part 4 SRS Coverage Record

## Scope implemented

Part 4 covers SRS Sections 4.1-4.10 Node Data, Edge Relationships, Edge Semantics, Hub categories, LENS filtering, directory, node detail, Realtime updates, performance strategy, and responsive alternatives; Section 8.2.3 Knowledge Graph API endpoints; applicable Realtime requirements from Section 8.3; the Knowledge Graph page in Section 10.3.2; and the applicable accessibility/non-functional controls. It does not implement AI-agent business logic (Part 5) or later domain producers.

| Requirement area | Implementation evidence | Test evidence |
|---|---|---|
| Exact node types, colors, icons, radii, and status semantics | `packages/contracts/src/graph.ts`; `packages/graph/src/registries.ts` | `packages/graph/src/registries-hubs.test.ts`; component/E2E legend checks |
| Edge visual and business semantics | `packages/graph/src/registries.ts`; `packages/graph/src/relationships.ts` | `relationships.test.ts`; route lifecycle tests |
| Nine deterministic hubs and memberships | `packages/graph/src/hubs.ts`; migration `20260801000100_part_4_graph_foundation` | Database integration, API E2E, GUI legend counts |
| Safe identity separation (`id`/`stableKey`/`entityId`) | `nodeDataSchema`; graph service mappers | `packages/data/src/graph/identity.test.ts`; live integration tests |
| `SYSTEM_PROJECTION` / `OWNER_EXPLICIT` edge lifecycle | Prisma schema, migration, service transactions, audit/outbox records | Integration edge lifecycle and provenance tests |
| LENS entity/function/action filters and 10% opacity | `packages/graph/src/filters.ts`; workspace toolbar and URL state | Filter unit tests, component tests, desktop Playwright URL/opacity assertions |
| Bounded graph API and cursor search/directory | `packages/data/src/graph/service.ts`; routes under `apps/web/src/app/api/v1/graph` | Route unit tests, live Playwright API tests, OpenAPI drift check |
| Owner-authenticated OpenAPI route set | `apps/web/src/lib/api/openapi.ts`; `registry.json` | `npm run openapi:validate` passed for 37 routes |
| Realtime private cache coordination | `packages/jobs/src/realtime/*`; `apps/web/src/features/graph/lib/graph-realtime.ts` | Mapper/sink/browser tests; reconnect refetch tests |
| Desktop force graph / tablet drawer / mobile semantic list | `graph-workspace.tsx`, `graph-surface.tsx`, `graph-directory.tsx` | Desktop/tablet/mobile Playwright and axe checks |
| Keyboard and accessible operation | Graph surface DOM model, dialogs/drawers, focus traps/restoration | Component keyboard tests and three device axe runs with zero violations |
| No fake future-domain product data | Current-domain projection service plus explicit fixture exclusion | Live browser/API regression assertion excludes `seed:*` and reserved source fixture IDs |

## Performance and external-gap boundary

The authoritative graph currently has 13 nodes in the running evidence environment. Real API latency for `/api/v1/graph`, nodes, edges, search, and directory was recorded on every Playwright project run and remained well below interactive thresholds for this real dataset.

The synthetic browser-render benches for exactly 100, 300, and 500 nodes are **not marked passed**. The running application intentionally has no production-safe worker route that fabricates those datasets, and the project forbids fake production evidence. The SVG/Canvas threshold is still implemented and unit-tested at the 500-node boundary, while final NFR-P-002, NFR-P-003, and NFR-S-004 acceptance remains blocked on a reviewed dedicated benchmark harness or Part 12 production-like evidence.

Supabase Realtime code, camera-ready private topics, and failure-safe degraded mode are implemented. The live private-broadcast/browser subscription smoke remains externally blocked on Supabase dashboard private-channel authorization policy and a rotated service-role credential. Local degraded behavior was tested instead; NFR-P-006 is not marked production-proven.

## Accessibility evidence

Automated axe checks ran against desktop graph detail/filter/search flows, tablet directory flows, and the mobile semantic list; all completed without violations after the recorded low-contrast, landmark, and heading-order fixes. Keyboard paths were exercised in Playwright and component tests. A formal manual screen-reader audit (for example NVDA/VoiceOver scripted narration output) remains external future evidence and is not claimed here.

## Completed local and live evidence commands

- `npm ci` - restored clean locked install; 0 vulnerabilities.
- `npm run check` - passed: Prisma validation, OpenAPI drift (37 routes), ESLint, all workspace typechecks, 330 unit/component tests, Next production build, and 77-asset client-bundle secret scan.
- `npm run test:integration` - passed: 19 PostgreSQL integration tests including graph service, projections, edge lifecycle, and drift rebuild.
- `npm run db:status` - configured Supabase database reports all three migrations up to date.
- `npm audit --audit-level=high` - 0 vulnerabilities.
- `npm run test:coverage` - passed: web 133 tests and platform 9 tests with generated V8 reports.
- `npx playwright test e2e/graph.spec.ts --workers=1` - consolidated run passed 18 applicable tests across Chromium desktop/tablet/mobile; 9 device-scope skips and 3 benchmark skips were explicit.

## Known risks for Part 5 handoff

1. Production-volume rendering remains unbenchmarked; do not generalize the current 13-node API timings to 500 nodes.
2. Live private Realtime requires Supabase private topics/RLS policy validation and secret rotation before activation.
3. `ai_agent`, future tool/SOP/knowledge/finance records still belong to Parts 5-11 and must use the Part 4 projection/extension contracts rather than UI fixtures.
4. Gmail remains unconfigured by design; communication sync is honest and does not power the graph until credentials and Vault storage are supplied.
