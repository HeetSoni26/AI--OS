# Part 5 Traceability Coverage - AI Agent Runtime

**Part:** 5 of 12 - AI Agent Runtime, Memory, Scheduling, Cost Control, and Monitoring
**Date:** 2026-10-08
**Scope:** FR-AM-001-024 foundation, AI Agents API surface, `agent:status` realtime events, Agents page/drawer, execution engine, provider gateway, memory, budgets, approvals

## Requirement-to-implementation map

| SRS requirement cluster | Delivered by | Verification |
|---|---|---|
| Agent configuration CRUD, all agent types, models, parameters | `PrismaAgentService` (`packages/data/src/agents/service.ts`) + `/api/v1/agents` routes | Unit tests, e2e `agents.spec.ts`, API smoke |
| System prompt, tools, trigger modes (manual/scheduled/cron/event/webhook/chain) | `normalizeTrigger`/`normalizeTools` validation + `packages/agents/src/tools.ts` registry | `provider.test.ts` tool-approval fail-safe test |
| Parameter validation (temperature, tokens, top_p, penalty, cron) | `validateCronExpression` + service guards → `CONFIG_INVALID` (422) | `cron.test.ts` + API contract |
| Configuration versioning; runs record exact config version | `AgentConfigVersion` per change; runs pin `configVersionId` | e2e configuration-history assertions |
| Run dispatch (queued → running → success/failed/timeout/cancelled) | `dispatchRun`/`claimNextQueuedRun`/`completeRun`/`failRun` state machine | API smoke: create → run → success with cost/tokens |
| Retries with exponential backoff (3 attempts, retryable classification) | `classifyRunError` + `failRun` requeue + queue delayed re-enqueue | `runtime.test.ts` retry scheduling test |
| Idempotent dispatch | unique `idempotencyKey` + `executeIdempotent` (agents.* operations) | OpenAPI idempotency parameter + route tests |
| Human-in-the-loop approval checkpoints | `createRunApprovalRecord` at dispatch; `decideRunApproval` (hash-pinned, tamper-rejecting); config edit expires pending approvals | API smoke: approval → pending → approve → success |
| OpenAI + Anthropic adapters, normalized usage/cost/errors | `ModelGateway` (`packages/agents/src/provider.ts`) + `MODEL_CATALOG` pricing | `provider.test.ts` fixture contract tests |
| Simulated provider fallback (no API key) with honest labeling | `generateSimulated` - `simulated: true` in run metadata, UI badge | e2e `simulated` assertion |
| Daily token budgets enforced before dispatch and retries | `assertDailyBudgetAvailable` + `tokensUsedToday` → `BUDGET_EXCEEDED` (429) | Service guards; OpenAPI error contract |
| Cost ledger per run (client/model attribution ready) | `CostLedgerEntry` (ai_usage expense) + `Agent.totalCostUsd` aggregate | API smoke cost assertions ($0.00009 gpt-4o-mini, $0.001824 claude) |
| Persistent key/value + vector memory, client-scoped | `AgentMemory` service (create/update/version/delete, client-assignment enforcement) | Service validation guards; drawer Memory tab e2e |
| Memory retrieval per run | `getRunExecutionPlan` memoryContext (agent + approved client scope) | Executor wiring |
| Scheduled cron triggers | `AgentScheduler` + UTC `nextCronFire` with per-minute idempotency keys | `cron.test.ts`, `runtime.test.ts` scheduler tests |
| Chained triggers with cycle detection + depth limits | `detectChainCycle`, `MAX_CHAIN_DEPTH`, idempotent chain keys | Policy functions; creation-time cycle guard |
| Realtime `agent:status` events + graph node updates | Durable outbox `graph.realtime.v1` events on both `agent:status` and `graph:updates` channels | Outbox rows verified in smoke |
| Agents page cards, detail/configuration, last 20 runs, memory viewer | `apps/web/src/features/agents/*` (workspace, form, detail, badge) | e2e workspace/detail/create/run suites + axe |
| Pause/Resume actions cancelling queued runs | `setAgentStatus` + `cancelQueuedRuns` | e2e + API contract |
| Queue concurrency, latency, health | `InProcessAgentQueue` (bounded concurrency, 5s poll) + `/api/v1/agents/runtime` | Queue unit tests; runtime endpoint |
| Non-AI domains operational during provider outage | Simulated provider degrades only AI output; all other routes unaffected | Full e2e sweep green without any provider key |

## Deliberate Part 5 boundaries (documented, not silently dropped)

- **BullMQ worker topology**: the execution engine ships with the in-process durable queue (claim-based, restart-safe) and the `AgentRuntime` composition seam; Redis/BullMQ is the production replacement behind the same `enqueue` contract. Runtime opt-out: `AIOS_AGENT_RUNTIME_DISABLED=true`.
- **Memory summarization near context limits** requires an embedding-capable provider; the seam (`memoryEnabled`, vector kind, provenance `sourceIds`) is in place and simulated runs intentionally do not write memory.
- **Live webhooks/event triggers**: trigger types are validated and persisted; external webhook ingress routes belong to the Part 7 workflow surface.

## Verification evidence

- Unit tests: `packages/agents` 24 passed (cron/provider/queue/scheduler), all workspace suites green (~342 tests total).
- E2E: `apps/web/e2e/agents.spec.ts` - 4 desktop flows + responsive checks; full sweep 46 passed, 0 failed (chromium/tablet/mobile, serial workers).
- Screenshots: `gui-test-screenshots/part-5/` (t1-t6) with axe-clean workspace.
- API smoke (this date): create → run → success (184 tokens, $0.00009); approval checkpoint → approve → success ($0.001824, Claude pricing); runtime health; graph node projection with live status.
