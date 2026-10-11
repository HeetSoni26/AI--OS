# Data Export, Archive, Recovery, and Deletion

## Export

Exports are durable jobs with a manifest identifying requested scope, format, record counts, checksums, classifications, generation time, and artifact references. JSON preserves nested portable structure; CSV uses one documented table per entity. Credentials and secret values are never exported.

## Archive and recovery

Archival hides a record from active views but preserves relations and audit history. Recovery clears the archive state while the record remains inside its seven-day recovery window. APIs must distinguish archive from permanent deletion.

## Permanent deletion

1. Owner confirms the exact entity and acknowledges affected relationships.
2. System creates a deletion plan with a `notBefore` time seven days later.
3. Owner can cancel before execution.
4. Worker rechecks identity, dependencies, legal holds, and plan version.
5. Business data, scoped memory/embeddings, files, cache entries, and provider references are deleted or anonymized in dependency order.
6. The deletion request records a safe completion summary without retaining the deleted content.

Client deletion must eventually include every client-scoped module introduced in Parts 3-11. The dependency registry is extended whenever a new domain stores client data.
