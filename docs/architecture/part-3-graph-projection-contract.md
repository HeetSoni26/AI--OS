# Part 3 Client Graph Projection Contract

PostgreSQL client/contact records are durable source truth. `graph_nodes` and `graph_edges` are rebuildable relational projections for Part 4; they are not a second write authority.

## Stable projection keys

| Source | Graph node type | Stable key | Projection metadata |
|---|---|---|---|
| Client | `client` | `client:<clientId>` | `projectionVersion: 1` |
| Contact | `human` | `contact:<contactId>` | `projectionVersion: 1`, `clientId` |

Each live contact has one directed ownership edge:

```text
client node ──ownership / "has contact"──> contact human node
```

Source UUIDs are stored as `entityId`; internal graph UUIDs are never used as business identifiers. Lifecycle timestamps are projected to nodes/edges. Archive, recovery, deletion scheduling/cancellation, primary promotion, and safe label changes therefore remain replayable.

## Transaction and event rules

- A client/contact mutation, safe audit record, outbox record, and graph projection update commit in the same PostgreSQL transaction.
- An outbox event is never the only copy of a mutation.
- Projection writes are idempotent upserts by stable key or unique typed entity identity.
- Event payloads use schema version 1 and omit notes, communication contents, names for contact events, email addresses, phone numbers, OAuth data, and credentials.
- Event names are unversioned semantic names (`client.created`, `client.updated`, etc.); the payload carries `schemaVersion`.
- Realtime/external publication is downstream of the durable outbox. Failure to publish leaves the outbox retryable and does not roll back an already committed source mutation.

## Rebuild and consistency check

A projection can be rebuilt by upserting every client and contact, then every client-to-contact ownership edge, using the same stable keys. Consistency verification compares:

1. source and projected entity UUIDs;
2. client/contact live/archive/deleted lifecycle timestamps;
3. safe labels and projection version;
4. one ownership edge per projected contact;
5. no ownership edge whose source client or target contact is absent.

Permanent deletion marks or removes the projection during the deletion participant plan before the deletion request is acknowledged complete. Worker replay uses the deletion request ID and participant name as its idempotency key.
