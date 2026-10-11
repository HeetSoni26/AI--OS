# Part 5 Handoff Report - AI Agent Runtime

**Date:** 2026-10-08
**Part:** 5 of 12 - AI Agent Runtime, Memory, Scheduling, Cost Control, and Monitoring
**Status:** Implemented and verified end to end.

## 1. Runtime architecture

One reusable runtime serves every agent; service agents (Parts 6-10) dispatch through it instead of owning engines.

- **`@aios/agents` (new package)** - framework-neutral runtime:
  - `provider.ts` - `ModelGateway` with OpenAI and Anthropic adapters (normalized messages, usage, timeout via `AbortSignal`, error status codes) plus a deterministic **simulated provider** used when `AIOS_OPENAI_API_KEY` / `AIOS_ANTHROPIC_API_KEY` are absent. Simulated output is clearly labeled and recorded as `simulated: true` in run metadata.
  - `executor.ts` - run execution: approval checkpoints, provider call, retry classification (`classifyRunError`), cost via `computeRunCostUsd`, memory context, chain fan-out.
  - `queue.ts` - `InProcessAgentQueue`: bounded concurrency (default 30), durable claim from the database, delayed retry re-enqueue, crash-safe restart. The BullMQ backend for multi-process deployments implements the same `enqueue` contract.
  - `scheduler.ts` + `cron.ts` - UTC 5-field cron engine with next-fire computation and per-minute idempotent scheduled dispatch.
  - `tools.ts` - least-privilege registry (web_search, file_read, file_write, code_execute, api_call, email_send); consequential tools require approval; unknown tools fail safe to approval-required.
- **`packages/data/src/agents/`** - `PrismaAgentService`: CRUD with configuration versioning, run state machine, budgets, cost ledger (`ai_usage` expense entries), memory CRUD with client-scope enforcement, approvals (hash-pinned), agent aggregates (totalRuns, successRate, totalCostUsd), graph projection maintenance, and durable realtime events.
- **Web composition** - `apps/web/src/lib/agents/runtime-singleton.ts` starts the runtime lazily per server process (`AIOS_AGENT_RUNTIME_DISABLED=true` opts out).

## 2. API surface (all under `/api/v1`, bearer/cookie auth, idempotency, OpenAPI-registered)

`GET|POST /agents`, `GET|PATCH|DELETE /agents/{agentId}`, `POST /agents/{agentId}/run|pause|resume`, `GET /agents/{agentId}/runs|memory|config-versions|budget`, `GET|POST /agents/{agentId}/memory`, `PATCH|DELETE /agents/{agentId}/memory/{memoryId}`, `GET /agents/runs`, `GET /agents/approvals`, `POST /agents/approvals/{approvalId}`, `GET /agents/runtime`. Registry and OpenAPI drift checks pass (`openapi.test.ts`).

## 3. Realtime and graph

Every agent status change emits durable `graph.realtime.v1` outbox events on both the `agent:status` channel (status_changed / run_completed / run_failed) and `graph:updates` (node_updated with live metadata), so the Knowledge Graph reflects agent state without a reload when Realtime is enabled. Graph nodes carry live status, last run, and run counts.

## 4. UI

`/agents` workspace: stats strip, search + status filters, agent cards (status dot, success, cost, last run), one-click Run from cards, create/edit dialog with starter prompts and cron presets, detail drawer with Runs / Memory / Configuration tabs, approvals card with Approve/Reject, budget progress bar, honest "Simulated" labels and `AIOS_*_API_KEY` guidance in the runtime panel.

## 5. Verification (actual command results, 2026-10-08)

- `npm run typecheck` - 0 errors (fixed pre-existing zod-4.4.3 contract breakage in `packages/contracts`).
- `npm run lint` - clean (also fixed pre-existing `e2e/auth-helpers.ts` TS error).
- `npm run test` - all workspace suites green (~342 tests; `@aios/agents` adds 24).
- `npm run test:e2e` - full sweep (chromium + tablet + mobile, serial workers): **46 passed, 0 failed**; adds `e2e/agents.spec.ts` (create → run → complete → inspect, axe-clean, responsive, self-cleaning).
- `npm run build` - production build compiles clean.
- API smoke: create agent → run → `success` (184 tokens, $0.00009); approval-gated agent → pending checkpoint → approve → `success` (140 tokens, $0.001824); runtime endpoint live; graph projection live.

## 6. Environment changes (important)

- **The configured Supabase project no longer resolves (NXDOMAIN)** - the cloud database from Parts 2-4 is gone. A local Postgres 16 + pgvector container (`docker run --name aios-postgres -p 54329:5432 pgvector/pgvector:pg16`) is provisioned; migrations, seed, and owner bootstrap were applied. `.env` and `apps/web/.env.local` now point at `postgresql://postgres:aios-local-dev@localhost:54329/postgres` with the dead URLs kept as comments. **Action for the owner:** recreate/restore Supabase (or another Postgres) and update the two env files when a cloud database is available again; `docker start aios-postgres` restores local development.
- `AIOS_RATE_LIMIT_REQUESTS` (optional env) can raise the per-owner API budget for test harnesses; production default remains 100/min.
- No provider API keys are configured - runs execute on the clearly-labeled simulated provider. Set `AIOS_OPENAI_API_KEY` or `AIOS_ANTHROPIC_API_KEY` for live models.

## 7. Known limitations / next-step seams

- BullMQ/Redis worker topology replaces the in-process queue for multi-process production (same enqueue contract).
- Memory summarization and embeddings activate with a live provider.
- Webhook/event trigger ingress completes with the Part 7 workflow surface; chain and scheduled triggers are already live.
- The Part 4 graph LENS GUI test can be time-flaky under full-suite load (passes in isolation and in most full sweeps).

## 8. Safe starting point for Part 6

Everything above is verified; Parts 1-4 remain green. Part 6 (Chatbot Builder, FR-CB-001-017) should reuse `PrismaAgentService.dispatchRun`, `ModelGateway`, `AgentMemory`, and the approval checkpoint contract, adding the chatbot strategy on top of the runtime rather than a separate engine.
