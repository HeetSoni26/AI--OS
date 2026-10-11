# Integration Adapter and Credential Rules

## Provider identifiers

The canonical identifiers are shared by Prisma and `@aios/platform`: `openai`, `anthropic`, `n8n`, `make`, `stripe`, `gmail`, `google`, `slack`, `linkedin`, `x`, `wordpress`, `mailchimp`, `sendgrid`, `resend`, `smtp`, `twilio`, `instagram`, `calendly`, `cal_com`, `notion`, `github`, `apollo`, `crunchbase`, `google_maps`, `storage`, `malware_scan`, and `other`.

## Required adapter behavior

Every adapter implements the typed `IntegrationAdapter<TRequest,TResponse>` boundary and must:

1. Accept a correlation ID, optional idempotency key, and abort signal.
2. Use explicit request timeouts; never wait forever on a provider.
3. Return a normalized health state without credentials, tokens, host internals, or raw provider errors.
4. Normalize errors into authentication, authorization, validation, rate-limit, timeout, unavailable, conflict, or unknown classes.
5. Mark retryability explicitly. Authentication, authorization, and validation failures are not retried automatically.
6. Preserve provider request/event identifiers as safe metadata for reconciliation and deduplication.
7. Require owner approval before SRS-designated high-impact external effects.
8. Write durable intent to PostgreSQL/outbox before queueing; Redis/BullMQ loss must not lose committed work.
9. Verify webhook signatures against the exact raw bytes before parsing. Deduplicate by integration connection plus provider event ID.
10. Redact authorization, cookies, passwords, secrets, tokens, API keys, webhook bodies, and sensitive provider payloads from logs.

## Credentials

- Preferred storage: Supabase Vault or deployment secret manager.
- Application tables store only `CredentialReference.vaultReference`, provider, label, key version, and rotation dates.
- The AES-256-GCM helper in `@aios/platform` is a documented application-level fallback where Vault cannot hold a specific encrypted value. Its envelope contains IV, authentication tag, ciphertext, and key version-never plaintext.
- `APPLICATION_ENCRYPTION_KEY` must be server-only, at least 32 random characters, versioned outside the database, and rotated through a reviewed re-encryption process.
- Raw credentials and refresh tokens are excluded from exports.

## Idempotency and replay

- Every mutating external effect uses a stable operation idempotency key.
- The same key with different operation/payload fingerprints is a conflict.
- Outbox events remain durable through pending, processing, published, failed, and dead-letter states.
- Webhook raw payloads are nullable so retention cleanup can remove the body while preserving hash, normalized fields, event ID, status, and audit evidence.
- Replay creates auditable attempts and never bypasses signature or owner-approval policy.

## Provider-specific implementation timing

Part 2 establishes contracts and persistence. Parts 3-10 implement provider-specific calls only when their owning vertical slice is built. No provider is reported connected until a credentialed `testConnection` call passes in the target environment.
