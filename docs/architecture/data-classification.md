# Data Classification and Retention Baseline

| Class | Examples | Storage and logging rule | Default lifecycle |
|---|---|---|---|
| Public | Generated widget assets explicitly approved for public delivery | Public access only through explicit publish records; never assume a file is public | Until unpublished or deleted |
| Internal | System status, template metadata, non-sensitive configuration | Owner authenticated; safe identifiers may appear in structured logs | Product lifecycle |
| Confidential client | Contacts, communications, files, chatbot transcripts, project notes, memory | Private storage, owner-only queries, redacted logs, client-scoped exports/deletion | Relationship plus approved retention |
| Financial sensitive | Invoices, payments, expenses, pricing, profitability | Decimal values, application encryption for sensitive fields, no public endpoints | Accounting/legal policy |
| Credential | API keys, OAuth refresh tokens, webhook secrets | Supabase Vault or hosting secret manager; tables store only references | Rotate/revoke; never export raw value |
| Security/audit | Audit changes, webhook receipt hashes, idempotency keys, deletion plans | Append-oriented, correlation identifiers, payload redaction | Minimum needed for investigation/compliance |

## Mandatory controls

- Logs must remove authorization, cookies, secrets, tokens, API keys, raw financial secrets, and sensitive payload fields.
- Agent memory and embeddings inherit the classification and deletion scope of their source.
- Export manifests identify included classes without exposing credential values.
- Deletion plans enumerate dependent records and files before execution.
- Provider webhook raw bodies are retained only when justified; use hashes and normalized event fields by default.
