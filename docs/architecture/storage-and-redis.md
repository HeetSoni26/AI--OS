# Storage and Redis Boundaries

## Supabase Storage buckets

| Bucket | Visibility | Content |
|---|---|---|
| `client-files` | Private, signed owner access | Client documents and attachments |
| `client-logos` | Private by default | Logos used by authenticated UI and approved report generation |
| `receipts` | Private, financial-sensitive | Expense receipts and evidence |
| `templates` | Private | Proposals, contracts, content, and workflow templates |
| `media` | Private until explicit publishing | Content media and generated assets |
| `chatbot-sources` | Private, client scoped | FAQ/product documents and parsed-source provenance |
| `exports` | Private, expiring signed download | JSON/CSV data exports |
| `reports` | Private, expiring signed download | Weekly, monthly, client, and financial report artifacts |

`supabase/migrations/20260731000200_private_storage.sql` provisions all eight private buckets with owner-only object policies. The forward `20260731000400_client_logo_policy.sql` migration narrows `client-logos` to 5 MiB PNG/JPEG/WebP objects; the other buckets retain the 100 MiB general limit. Policies call a security-definer owner check against `OwnerAccount.authSubject = auth.uid()`. The browser never receives the service-role key.

General file flows use short-lived signed upload/download URLs through `SignedStorageAdapter`. Client logos use an authenticated streaming upload route so the server can validate magic bytes, declared MIME, dimensions, size, and SHA-256 before attachment; reads redirect to a five-minute signed private Storage URL. The strict image decoder is the documented logo-only malware-scanner exemption and is stored as `SKIPPED`, never falsely as `CLEAN`. General client files remain unavailable until required malware scanning succeeds. Replaced/removed logo objects are deleted through durable `storage.object_cleanup_requested` outbox work after database state commits. PostgreSQL holds bucket/key, ownership, checksum, size, MIME type, scan state, storage version, and lifecycle metadata.

## Redis namespaces

- `aios:cache:*` - disposable API/query cache
- `aios:rate:*` - login and per-session API limits
- `aios:queue:*` - BullMQ queues and dispatch state
- `aios:lock:*` - bounded distributed locks and idempotent dispatch
- `aios:session:*` - short-lived session helpers where required

Redis may be cleared without losing clients, projects, invoices, agent runs, knowledge, audit events, webhook receipts, approvals, exports, schedules, file metadata, or deletion plans. Workers reconcile from PostgreSQL durable outbox/scheduled state after Redis recovery.
