# Part 4 Knowledge Graph Architecture

- **Status:** Implemented and verified locally and against the configured PostgreSQL/Supabase database
- **Date:** 2026-08-03
- **Scope:** SRS Sections 4.1-4.10, 8.2.3, applicable 8.3 behavior, and 10.3.2
- **Canonical contracts:** `packages/contracts/src/graph.ts`

## Source-of-truth boundary

PostgreSQL business tables remain durable source truth. `graph_nodes` and source-managed `graph_edges` are rebuildable read projections; they are not an independent business-write authority. The graph service enriches projection identities from current source rows before returning a strict `NodeData` union. Arbitrary database JSON is never passed directly to the browser.

Redis and Supabase Realtime are disposable coordination layers. A cache miss, dropped broadcast, or reconnect cannot change committed business truth. Reconnect invalidates and refetches the authoritative graph.

Part 4 currently materializes real clients, contacts, tasks, assignments, and nine structural hubs. Contracts, registries, visuals, filters, relationship rules, and extension points cover all ten SRS node types and all seven edge types without fabricating business records owned by Parts 5-11. Deterministic Part 2 fixtures are excluded from ordinary graph reads by both `seed:*` identity and their reserved source-ID range.

## Identity model

Graph identity deliberately has three fields:

| Field | Meaning | Rule |
|---|---|---|
| `id` | Persistent graph UUID and edge endpoint | Never used as the source business ID |
| `stableKey` | Stable projection key, such as `client:<uuid>` | Unique and replayable |
| `entityId` | Nullable source-domain UUID | Required for non-hub source projections; null for hubs |

Stored edge endpoints use graph UUIDs. Virtual hub-membership edges use deterministic bounded read-model IDs and are never persisted as owner relationships.

## Node, hub, and edge catalog

Node types are `client`, `ai_agent`, `tool`, `sop`, `human_contact`, `task`, `decision`, `knowledge_memory`, `revenue_finance`, and `hub`. Their exact labels, colors, icon semantics, and radii live in `GRAPH_NODE_VISUALS`.

The deterministic hubs are Command, Clients, Agents, Finance, Pipeline / CRM, Content, Knowledge, Automations, and Tools. UUIDv5 IDs, stable keys, placement hints, contained types, and summaries live in `packages/graph/src/hubs.ts` and are provisioned by the Part 4 migration.

Edge types are Ownership, Assignment, Data Flow, Dependency, Trigger, Reference, and Financial. Exact visual and accessible semantics live in `packages/graph/src/registries.ts`; creation rules live in `packages/graph/src/relationships.ts`.

## Projection and edge lifecycle

`GraphEdge.provenance` is mandatory:

- `SYSTEM_PROJECTION` (`system_projection`) follows owning-domain lifecycle. It requires a projection key and cannot be deleted through graph CRUD.
- `OWNER_EXPLICIT` (`owner_explicit`) is created through the owner-authenticated graph API. Create, restore, and soft-delete execute transactionally with redacted audit and durable outbox evidence.

The all-lifecycle natural key remains unique. Recreating a previously soft-deleted owner edge restores that same row rather than inserting a second identity. Graph consistency checks detect missing nodes, lifecycle drift, wrong provenance, and invalid endpoints. `rebuildCurrentDomainProjections` reconciles clients, contacts, tasks, nine hubs, and current derived edges idempotently.

## Extension guide for Parts 5-11

A later domain must not modify renderer internals to add a supported node type:

1. Commit source-domain state, safe audit evidence, outbox intent, and its graph projection in one PostgreSQL transaction.
2. Use a stable projection key (`<domain>:<source-uuid>`), a persistent graph UUID, and the source UUID as `entityId`.
3. Emit only metadata accepted by that node type's strict schema in `packages/contracts/src/graph.ts`.
4. Mark derived edges `SYSTEM_PROJECTION` and include a stable `projectionKey`.
5. Add source enrichment to the graph data service and lifecycle/rebuild checks.
6. Register framework-neutral projection/detail behavior through `ProjectionRegistry` or `DetailRegistry` where runtime composition requires it. Registration output is schema-validated and projection edges must claim the registration key.
7. Add unit, database, API, Realtime, responsive, and accessibility evidence. Do not use a synthetic future node as ordinary product data.

Part 5 may activate real `ai_agent` enrichment and `agent:status` producers, but it must not weaken these boundaries.

## LENS and graph read behavior

Entity, Function, and Action filters combine through `packages/graph/src/filters.ts`. Excluded nodes remain present at exactly `0.1` opacity so relationship context is preserved. LENS values serialize as `entity`, `function`, and `action` URL parameters. Clear All removes only those keys and preserves unrelated URL state.

Complete graph reads are bounded to 500 nodes and 5,000 stored/virtual edges. Collection APIs use stable cursor fingerprints tied to active filters. Search returns bounded, schema-validated matches. The directory exposes AI Agents, Clients ordered by MRR, Tools, Recent Tasks, and Knowledge with honest empty groups.

## API catalog

All routes are owner-authenticated `/api/v1` endpoints with CORS/CSRF/rate/body/request-ID policy, no-store responses, Zod validation, normalized envelopes, and safe errors.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/graph` | Bounded complete authoritative graph |
| GET | `/api/v1/graph/nodes` | Filtered cursor-paginated nodes |
| GET | `/api/v1/graph/nodes/{nodeId}` | Enriched node detail and connections |
| GET | `/api/v1/graph/edges` | Filtered cursor-paginated edges |
| POST | `/api/v1/graph/edges` | Idempotent owner-edge create/restore |
| DELETE | `/api/v1/graph/edges/{edgeId}` | Idempotent owner-edge soft delete |
| GET | `/api/v1/graph/search` | Bounded fuzzy graph search |
| GET | `/api/v1/graph/directory` | Grouped directory read model |

Mutation requests require `Idempotency-Key`. The OpenAPI 3.1 implementation is in `apps/web/src/lib/api/openapi.ts`; the drift-checked registry is `apps/web/src/lib/api/registry.json`.

## Realtime contract

The active graph topic is private and owner-scoped:

```text
owner:<supabase-auth-subject>:graph:updates
```

Version 1 graph events are `node_created`, `node_updated`, `node_deleted`, `edge_created`, and `edge_deleted`. Contract-ready future channels are `agent:status`, `finance:updates`, and `notifications:new`; Part 4 does not invent their later-domain producers.

Durable outbox events are mapped from authoritative rows instead of forwarding raw source payloads. Contact Realtime payloads omit email and other contact PII. Server delivery validates payloads, uses private Broadcast, bounds timeouts, deduplicates dispatch keys, and keeps a failed configured dispatch retryable. Browser delivery validates again, deduplicates event IDs in a bounded set, reconciles TanStack Query caches, and refetches after reconnect.

Realtime is disabled by default with `AIOS_REALTIME_ENABLED=false`. The UI reports connected, reconnecting, unavailable, or unconfigured; it never claims a live connection when provider policy is absent.

## UI and accessibility architecture

`/knowledge-graph` is a full-bleed protected route. Desktop/tablet use one D3 simulation controller with SVG or DPR-aware Canvas adapters. Mobile uses an equivalent searchable/filterable semantic list rather than a tiny force canvas. The shell delegates Cmd/Ctrl+K to route-owned graph search and restores the default command on unmount.

Keyboard support includes directional node traversal, Enter to open, Space/Shift+Space selection, Shift+F10 context menu, zoom buttons, focus restoration, and Escape precedence. Reduced motion removes animated flow effects while preserving textual semantics. Drawers/dialogs can portal into the fullscreen host and retain focus trapping.

See `docs/adr/ADR-003-graph-renderer-policy.md`, `docs/runbooks/part-4-realtime.md`, and `docs/evidence/part-4-handoff-2026-08-03.md` for operational and acceptance boundaries.
