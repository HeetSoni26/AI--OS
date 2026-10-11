# Part 4 Realtime Runbook - Degraded Mode and Recovery

## Architecture position

Realtime is a **cache-coordination layer only**. Source truth is PostgreSQL. A graph mutation is durable when and only when the source mutation, audit record, outbox record, and graph projection commit in one transaction. A dropped or delayed broadcast never loses business data; the browser revalidates against the API.

## Configuration

| Variable | Where | Behavior |
|---|---|---|
| `AIOS_REALTIME_ENABLED` | jobs environment | `true` activates the Supabase Broadcast publisher. **Absent/false = disabled, safe.** |
| `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | jobs environment | Required only when the flag is true. Must be HTTPS off localhost. |
| `SUPABASE_SERVICE_ROLE_KEY` | jobs environment (server-only) | Required only when the flag is true. Never bundled client-side; never logged. |
| `AIOS_SUPABASE_REALTIME_TIMEOUT_MS` | jobs environment | 100-30000 ms; default 5000. |

The jobs composition (`packages/jobs/src/composition.ts`) throws a startup error if Realtime is enabled but partially configured - a loud failure rather than silent fake behavior.

Browser subscription keys off the browser Supabase client. When Supabase browser config is absent, the page shows **“Live updates unconfigured”**; when a subscription fails it reports **reconnecting** then **unavailable**; reads and mutations still work.

## Private topic layout

```text
owner:<supabase-auth-subject>:graph:updates
```

Browser clients subscribe with `private: true`. Supabase **private-channel RLS/authorization policies must be enabled in the Supabase project** (Realtime → Settings/Authorization). Without that dashboard configuration, subscriptions and broadcasts fail closed - this is the externally blocked live smoke check for Part 4.

## Failure states and operator responses

| Symptom | Detection | Response |
|---|---|---|
| Graph updates lag but reads work | UI shows `unavailable`; jobs log shows broadcast HTTP/timeout errors | 1. Confirm `AIOS_REALTIME_ENABLED`. 2. Verify service-role key is present and not rotated away. 3. Check Supabase Realtime authorization/policy. 4. Leave polling active - outbox rows remain retryable. 5. After fix, run `npm run job:outbox` once and observe success. |
| UI flickers reconnecting | Browser `useGraphRealtime` status events | Confirm network and Supabase availability. On every successful resubscribe the client invalidates and refetches the authoritative graph, so no action is needed for correctness. |
| Outbox lag grows | Query `outbox_events` pending count / worker logs | External dispatch failures (HTTP or Realtime) never roll back source commits. Fix the failing sink; the worker reclaims pending events with its existing retry/dead-letter policy. |
| Wrong project credentials | `Supabase Realtime broadcast failed with HTTP 401/403` | Rotate to the correct project service-role credential in the jobs environment only. Never place a service credential in `NEXT_PUBLIC_*`. |
| Browser reports unconfigured | Indicator says `Live updates unconfigured` | Expected in local/dev without Supabase browser config. Not a product failure. |

## Recovery verification

1. `npm run db:status` - migrations current.
2. Run one mutating E2E flow (e.g. `npx playwright test e2e/graph.spec.ts --grep "owner edge lifecycle"`); confirm the graph API reflects the mutation immediately regardless of Realtime state.
3. With Realtime enabled and private authorization configured, create a client/contact through the UI and confirm a `node_created`/`edge_created` arrives on the owner topic under 2 s (NFR-P-006 measurement point - not yet claimed).
4. Delete/disable the network path once and confirm the UI auto-reconnects and refetches; the graph must match the API result.

## Safety invariants (do not bypass)

- Storage cleanup (`storage.object.deleted`) is internal-only and is **never** broadcast.
- Contact Realtime payloads never carry email/phone/notes.
- Raw outbox source payloads are never forwarded; events are rebuilt from authoritative rows through `DurableGraphRealtimeMapper` and schema-validated on both ends.
- The service-role credential that previously appeared in chat **must be rotated** before this pipeline is activated in any shared environment.
