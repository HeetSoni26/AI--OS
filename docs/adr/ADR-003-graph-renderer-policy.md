# ADR-003: Knowledge Graph Renderer and Interaction Policy

- **Status:** Accepted
- **Date:** 2026-08-03
- **SRS scope:** Sections 4.1-4.10 and 10.3.2; NFR-P-002, NFR-P-003, NFR-P-006, NFR-S-004

## Context

The knowledge graph must preserve exact SRS visuals and relationships while remaining responsive across desktop, tablet, and mobile. It also must support keyboard operation, reduced motion, high-contrast/forced-colors contexts, live cache reconciliation, and bounded large graphs without turning a visual canvas into the only accessible representation.

The plan required a benchmarked SVG/Canvas threshold and explicit degradation at the 500-node SRS capacity. Existing production data is currently far below those volumes, and the running application exposes no safe read-only worker/service that constructs and serializes synthetic 100/300/500-node browser datasets without fabricating production records.

## Decision

Use one framework-independent policy and simulation core, with equivalent adapters:

- `packages/graph/src/renderer.ts` selects the representation from node count and viewport.
- `apps/web/src/features/graph/lib/simulation-controller.ts` owns force simulation, hub gravity, links, collision, stable/pinned positions, D3 drag/zoom/quadtree helpers, and incremental reconciliation. It is external to React render state; ticks do not flow through React state.
- Desktop and tablet normal views render crisp SVG.
- At exactly 500 nodes, `selectGraphRenderer` selects Canvas; above 500, Canvas remains active and filtering/search/directory narrowing is recommended while only the configured first 500 nodes remain visible.
- Mobile always selects the semantic list representation. It retains search, type filtering, LENS, selection, detail drawers, context actions, grouping/status semantics, and connection counts.
- The legend contains every registered node and edge type, even when a current-domain count is zero.
- Realtime updates reconcile normalized TanStack Query data and let the controller incrementally apply node/edge changes. Reconnect invalidates and refetches authoritative data.

Exact thresholds and tests remain in `packages/graph/src/renderer.ts` and `packages/graph/src/renderer.test.ts`. The renderer switch is intentionally independent from a browser package so future renderers cannot change contracts through implementation choice.

## Renderer selection

| Input | Result | Degradation |
|---|---|---|
| Mobile viewport | `list` | No force canvas; complete accessible list path |
| < 500 desktop/tablet nodes | `svg` | None |
| Exactly 500 desktop/tablet nodes | `canvas` | None |
| > 500 desktop/tablet nodes | `canvas` | Show first 500 and direct owner to search/LENS/directory |

## Performance evidence boundary

Current real API latency is recorded in the E2E run and is healthy for the existing 13-node owner graph. The required production-like 100/300/500 browser-render benchmark is **not passed** because no safe synthetic load path exists in the running app and the project forbids fabricating production data. This is an explicit Part 4 acceptance gap, not a hidden failure.

The threshold is therefore contract/test protected and documented, while NFR-P-002, NFR-P-003, NFR-P-006, and NFR-S-004 remain accountable for final production-like performance acceptance in Part 12 or a reviewed performance harness. Do not mark those NFRs complete from this run.

## Consequences

- Visual behavior, accessibility, realtime updates, and LENS can be tested independently.
- Real records drive the ordinary graph; future domains add projections rather than seed-only UI fixtures.
- Mobile users receive an equivalent product surface, and keyboard/screen-reader operation does not depend on interpreting a canvas.
- A sufficiently instrumented, reviewed benchmark harness is still required before the render-time NFRs can be claimed.
