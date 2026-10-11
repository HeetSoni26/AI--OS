import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@aios/data";

import type {
  ClientDeletionParticipant,
  DatabaseRecordsImpact,
  DeletionParticipantContext,
  DeletionPlanningContext,
  ProviderReferencesImpact,
  StorageObjectsImpact,
} from "./contracts";
import type { StorageObjectReference, StorageObjectRemover } from "../storage";

export interface GraphProjectionImpact {
  readonly kind: "graph_projection";
  readonly nodes: number;
  readonly edges: number;
}

interface CountRow {
  readonly table: string;
  readonly count: bigint | number | string;
}

interface StorageCountRow {
  readonly bucket: string;
  readonly count: bigint | number | string;
}

interface ProviderCountRow {
  readonly provider: string;
  readonly count: bigint | number | string;
}

interface GraphCountRow {
  readonly nodes: bigint | number | string;
  readonly edges: bigint | number | string;
}

interface ClientEventProjectionRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly industry: string | null;
  readonly mrr: string | number;
  readonly archivedAt: Date | null;
}

function count(value: bigint | number | string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error("Deletion impact count is invalid.");
  return result;
}

function requireClientContext(
  context: DeletionPlanningContext | DeletionParticipantContext,
): void {
  if (context.entityType !== "client") {
    throw new Error(`Client deletion participant refused entity type ${context.entityType}.`);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(context.entityId)) {
    throw new Error("Client deletion participant requires an entity UUID.");
  }
}

/** Read-only, complete inventory of direct client-owned relational roots. */
export class ClientRelationalDeletionParticipant
implements ClientDeletionParticipant<DatabaseRecordsImpact> {
  readonly name = "client-relational-records";
  readonly order = 40;
  readonly kind = "database_records" as const;

  constructor(private readonly database: PrismaClient) {}

  async plan(context: DeletionPlanningContext): Promise<DatabaseRecordsImpact> {
    requireClientContext(context);
    const rows = await this.database.$queryRawUnsafe<CountRow[]>(
      `SELECT table_name AS table, record_count AS count
       FROM (
         SELECT 'clients'::text AS table_name, COUNT(*)::bigint AS record_count FROM public.clients WHERE id = $1
         UNION ALL SELECT 'contacts', COUNT(*) FROM public.contacts WHERE client_id = $1
         UNION ALL SELECT 'communications', COUNT(*) FROM public.communications WHERE client_id = $1
         UNION ALL SELECT 'projects', COUNT(*) FROM public.projects WHERE client_id = $1
         UNION ALL SELECT 'agent_runs', COUNT(*) FROM public.agent_runs WHERE client_id = $1
         UNION ALL SELECT 'agent_memories', COUNT(*) FROM public.agent_memories WHERE client_id = $1
         UNION ALL SELECT 'chatbots', COUNT(*) FROM public.chatbots WHERE client_id = $1
         UNION ALL SELECT 'workflows', COUNT(*) FROM public.workflows WHERE client_id = $1
         UNION ALL SELECT 'content_artifacts', COUNT(*) FROM public.content_artifacts WHERE client_id = $1
         UNION ALL SELECT 'sourced_leads', COUNT(*) FROM public.sourced_leads WHERE client_id = $1
         UNION ALL SELECT 'invoices', COUNT(*) FROM public.invoices WHERE client_id = $1
         UNION ALL SELECT 'payments', COUNT(*) FROM public.payments WHERE client_id = $1
         UNION ALL SELECT 'expenses', COUNT(*) FROM public.expenses WHERE client_id = $1
         UNION ALL SELECT 'cost_ledger_entries', COUNT(*) FROM public.cost_ledger_entries WHERE client_id = $1
         UNION ALL SELECT 'knowledge_entries', COUNT(*) FROM public.knowledge_entries WHERE client_id = $1
         UNION ALL SELECT 'sops', COUNT(*) FROM public.sops WHERE client_id = $1
         UNION ALL SELECT 'file_metadata', COUNT(*) FROM public.file_metadata WHERE client_id = $1
         UNION ALL SELECT 'report_artifacts', COUNT(*) FROM public.report_artifacts WHERE client_id = $1
       ) AS impact
       WHERE record_count > 0
       ORDER BY table_name`,
      context.entityId,
    );
    return {
      kind: this.kind,
      records: rows.map((row) => ({ table: row.table, count: count(row.count) })),
    };
  }

  async execute(
    context: DeletionParticipantContext,
    _impact: DatabaseRecordsImpact,
    _idempotencyKey: string,
  ): Promise<void> {
    requireClientContext(context);
    const eventId = randomUUID();
    const occurredAt = new Date();
    await this.database.$transaction(async (transaction) => {
      const clients = await transaction.$queryRawUnsafe<ClientEventProjectionRow[]>(
        `SELECT id, name, status::text AS status, industry, mrr::text AS mrr,
                archived_at AS "archivedAt"
         FROM public.clients
         WHERE id = $1
         FOR UPDATE`,
        context.entityId,
      );
      const client = clients[0];
      // A committed prior replay already removed the client and emitted the event.
      if (!client) return;

      const owners = await transaction.ownerAccount.findMany({
        where: { active: true },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true },
      });
      const owner = owners[0];
      if (!owner) throw new Error("Client deletion requires an active owner account for the domain event.");

      // Restrict/SetNull relations are handled explicitly; the remaining client
      // graph is removed through reviewed FK cascades.
      await transaction.$executeRawUnsafe(
        `DELETE FROM public.scheduled_jobs
         WHERE (entity_type = 'client' AND entity_id = $1)
            OR entity_id IN (SELECT id FROM public.integration_connections WHERE client_id = $1)`,
        context.entityId,
      );
      await transaction.$executeRawUnsafe(
        `DELETE FROM public.notifications WHERE entity_type = 'client' AND entity_id = $1`,
        context.entityId,
      );
      await transaction.$executeRawUnsafe(
        `UPDATE public.crm_leads SET converted_client_id = NULL WHERE converted_client_id = $1`,
        context.entityId,
      );
      await transaction.$executeRawUnsafe(
        `DELETE FROM public.cost_ledger_entries WHERE client_id = $1`,
        context.entityId,
      );
      await transaction.$executeRawUnsafe(
        `DELETE FROM public.payments WHERE client_id = $1`,
        context.entityId,
      );
      await transaction.$executeRawUnsafe(
        `DELETE FROM public.invoices WHERE client_id = $1`,
        context.entityId,
      );
      await transaction.$executeRawUnsafe(
        `DELETE FROM public.expenses WHERE client_id = $1`,
        context.entityId,
      );
      await transaction.$executeRawUnsafe(
        `DELETE FROM public.agent_runs WHERE client_id = $1`,
        context.entityId,
      );
      const deleted = await transaction.$executeRawUnsafe(
        `DELETE FROM public.clients WHERE id = $1`,
        context.entityId,
      );
      if (deleted !== 1) throw new Error("Client deletion lost its locked relational root.");

      const correlationId = `deletion:${context.requestId}`;
      const safeClient = {
        clientId: client.id,
        name: client.name,
        status: client.status,
        industry: client.industry,
        mrr: Number(client.mrr),
        archivedAt: client.archivedAt?.toISOString() ?? null,
      };
      const eventPayload = {
        eventId,
        schemaVersion: 1,
        ownerId: owner.id,
        correlationId,
        occurredAt: occurredAt.toISOString(),
        eventType: "client.deleted",
        entityType: "client",
        aggregateId: client.id,
        payload: safeClient,
      };
      await transaction.$executeRawUnsafe(
        `INSERT INTO public.audit_events
           (actor_subject, actor_type, action, entity_type, entity_id, correlation_id, change_summary)
         VALUES ('system:jobs', 'worker', 'delete', 'client', $1, $2, $3::jsonb)`,
        client.id,
        correlationId,
        JSON.stringify({
          schemaVersion: 1,
          changedFields: ["deletedAt"],
          deletionRequestId: context.requestId,
          eventType: "client.deleted",
        }),
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO public.outbox_events
           (id, aggregate_type, aggregate_id, event_type, payload, correlation_id,
            occurred_at, idempotency_key, available_at)
         VALUES ($1, 'client', $2, 'client.deleted', $3::jsonb, $4, $5, $6, $5)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        eventId,
        client.id,
        JSON.stringify(eventPayload),
        correlationId,
        occurredAt,
        `deletion:${context.requestId}:client.deleted`,
      );
    }, { isolationLevel: "Serializable" });
  }
}

export class ClientStorageDeletionParticipant
implements ClientDeletionParticipant<StorageObjectsImpact> {
  readonly name = "client-private-storage";
  readonly order = 20;
  readonly kind = "storage_objects" as const;

  constructor(
    private readonly database: PrismaClient,
    private readonly storage: StorageObjectRemover,
  ) {}

  async plan(context: DeletionPlanningContext): Promise<StorageObjectsImpact> {
    requireClientContext(context);
    const rows = await this.database.$queryRawUnsafe<StorageCountRow[]>(
      `SELECT bucket, COUNT(*)::bigint AS count
       FROM public.file_metadata
       WHERE client_id = $1
       GROUP BY bucket
       ORDER BY bucket`,
      context.entityId,
    );
    return {
      kind: this.kind,
      objects: rows.map((row) => ({ bucket: row.bucket, count: count(row.count) })),
    };
  }

  async execute(
    context: DeletionParticipantContext,
    _impact: StorageObjectsImpact,
    _idempotencyKey: string,
  ): Promise<void> {
    requireClientContext(context);
    const objects = await this.database.$queryRawUnsafe<StorageObjectReference[]>(
      `SELECT bucket, object_path AS "objectPath"
       FROM public.file_metadata
       WHERE client_id = $1
       ORDER BY bucket, object_path`,
      context.entityId,
    );
    await this.storage.remove(objects, context.signal);
  }
}

export class ClientGraphDeletionParticipant
implements ClientDeletionParticipant<GraphProjectionImpact> {
  readonly name = "client-graph-projection";
  readonly order = 30;
  readonly kind = "graph_projection" as const;

  constructor(private readonly database: PrismaClient) {}

  async plan(context: DeletionPlanningContext): Promise<GraphProjectionImpact> {
    requireClientContext(context);
    const rows = await this.database.$queryRawUnsafe<GraphCountRow[]>(
      `WITH projected_nodes AS (
         SELECT id FROM public.graph_nodes
         WHERE (type = 'client' AND entity_id = $1)
            OR metadata->>'clientId' = $1::text
            OR (type = 'human' AND entity_id IN (
              SELECT id FROM public.contacts WHERE client_id = $1
            ))
       )
       SELECT
         (SELECT COUNT(*)::bigint FROM projected_nodes) AS nodes,
         (SELECT COUNT(*)::bigint FROM public.graph_edges
          WHERE source_id IN (SELECT id FROM projected_nodes)
             OR target_id IN (SELECT id FROM projected_nodes)) AS edges`,
      context.entityId,
    );
    const row = rows[0] ?? { nodes: 0, edges: 0 };
    return { kind: this.kind, nodes: count(row.nodes), edges: count(row.edges) };
  }

  async execute(
    context: DeletionParticipantContext,
    _impact: GraphProjectionImpact,
    _idempotencyKey: string,
  ): Promise<void> {
    requireClientContext(context);
    await this.database.$executeRawUnsafe(
      `DELETE FROM public.graph_nodes
       WHERE (type = 'client' AND entity_id = $1)
          OR metadata->>'clientId' = $1::text
          OR (type = 'human' AND entity_id IN (
            SELECT id FROM public.contacts WHERE client_id = $1
          ))`,
      context.entityId,
    );
  }
}

export class ClientProviderReferencesDeletionParticipant
implements ClientDeletionParticipant<ProviderReferencesImpact> {
  readonly name = "client-provider-references";
  readonly order = 10;
  readonly kind = "provider_references" as const;

  constructor(private readonly database: PrismaClient) {}

  async plan(context: DeletionPlanningContext): Promise<ProviderReferencesImpact> {
    requireClientContext(context);
    const rows = await this.database.$queryRawUnsafe<ProviderCountRow[]>(
      `SELECT provider::text AS provider, COUNT(*)::bigint AS count
       FROM public.integration_connections
       WHERE client_id = $1
       GROUP BY provider
       ORDER BY provider`,
      context.entityId,
    );
    return {
      kind: this.kind,
      references: rows.map((row) => ({ provider: row.provider, count: count(row.count) })),
    };
  }

  async execute(
    context: DeletionParticipantContext,
    _impact: ProviderReferencesImpact,
    _idempotencyKey: string,
  ): Promise<void> {
    requireClientContext(context);
    await this.database.$transaction(async (transaction) => {
      const credentialRows = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT DISTINCT credential_reference_id AS id
         FROM public.integration_connections
         WHERE client_id = $1 AND credential_reference_id IS NOT NULL`,
        context.entityId,
      );
      await transaction.$executeRawUnsafe(
        `DELETE FROM public.scheduled_jobs
         WHERE entity_id IN (SELECT id FROM public.integration_connections WHERE client_id = $1)`,
        context.entityId,
      );
      await transaction.$executeRawUnsafe(
        `DELETE FROM public.webhook_receipts
         WHERE integration_connection_id IN (
           SELECT id FROM public.integration_connections WHERE client_id = $1
         )`,
        context.entityId,
      );
      await transaction.$executeRawUnsafe(
        `DELETE FROM public.workflow_credential_bindings
         WHERE integration_connection_id IN (
           SELECT id FROM public.integration_connections WHERE client_id = $1
         )`,
        context.entityId,
      );
      await transaction.$executeRawUnsafe(
        `DELETE FROM public.integration_connections WHERE client_id = $1`,
        context.entityId,
      );
      for (const credential of credentialRows) {
        await transaction.credentialReference.deleteMany({
          where: { id: credential.id, connections: { none: {} } },
        });
      }
    }, { isolationLevel: "Serializable" });
  }
}

export function createClientDeletionParticipants(
  database: PrismaClient,
  storage: StorageObjectRemover,
): readonly ClientDeletionParticipant[] {
  return [
    new ClientProviderReferencesDeletionParticipant(database),
    new ClientStorageDeletionParticipant(database, storage),
    new ClientGraphDeletionParticipant(database),
    new ClientRelationalDeletionParticipant(database),
  ];
}
