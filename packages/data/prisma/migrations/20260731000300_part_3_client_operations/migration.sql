-- AI OS Part 3: client operations, graph projection, Gmail ingestion state, and lifecycle hardening.
-- Generated relational DDL is followed by reviewed PostgreSQL backfills and constraints.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
SET search_path TO public, extensions;

-- CreateEnum
CREATE TYPE "IntegrationSyncStatus" AS ENUM ('idle', 'running', 'rate_limited', 'error', 'revoked');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('processing', 'completed', 'failed');

-- DropForeignKey
ALTER TABLE "assignments" DROP CONSTRAINT "assignments_task_id_fkey";

-- DropForeignKey
ALTER TABLE "time_entries" DROP CONSTRAINT "time_entries_task_id_fkey";

-- DropIndex
DROP INDEX "clients_name_idx";

-- DropIndex
DROP INDEX "communications_source_provider_message_id_key";

-- DropIndex
DROP INDEX "deliverables_project_id_position_key";

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "logo_file_id" UUID;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "normalized_email" VARCHAR(320);

-- AlterTable
ALTER TABLE "communications" ADD COLUMN     "ingested_at" TIMESTAMPTZ(6),
ADD COLUMN     "integration_connection_id" UUID,
ADD COLUMN     "provider_thread_id" VARCHAR(255);

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "owner_account_id" UUID;

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "assignment_id" UUID,
ADD COLUMN     "owner_account_id" UUID;

-- AlterTable
ALTER TABLE "deletion_requests" ADD COLUMN     "confirmed_at" TIMESTAMPTZ(6),
ADD COLUMN     "impact_registry_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "legal_hold" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "communication_contacts" (
    "communication_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_contacts_pkey" PRIMARY KEY ("communication_id","contact_id")
);

-- CreateTable
CREATE TABLE "project_status_history" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "from_status" "ProjectStatus",
    "to_status" "ProjectStatus" NOT NULL,
    "reason" TEXT,
    "changed_by" VARCHAR(255) NOT NULL,
    "correlation_id" VARCHAR(128) NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_sync_states" (
    "id" UUID NOT NULL,
    "integration_connection_id" UUID NOT NULL,
    "checkpoint_type" VARCHAR(100) NOT NULL,
    "checkpoint_value" VARCHAR(1000),
    "status" "IntegrationSyncStatus" NOT NULL DEFAULT 'idle',
    "last_synced_at" TIMESTAMPTZ(6),
    "next_retry_at" TIMESTAMPTZ(6),
    "last_error_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integration_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "owner_subject" VARCHAR(255) NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "operation" VARCHAR(150) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'processing',
    "resource_type" VARCHAR(100),
    "resource_id" UUID,
    "response_status" INTEGER,
    "response_body" JSONB,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "communication_contacts_contact_id_idx" ON "communication_contacts"("contact_id");

-- CreateIndex
CREATE INDEX "project_status_history_project_id_changed_at_idx" ON "project_status_history"("project_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "integration_sync_states_status_next_retry_at_idx" ON "integration_sync_states"("status", "next_retry_at");

-- CreateIndex
CREATE UNIQUE INDEX "integration_sync_states_integration_connection_id_checkpoin_key" ON "integration_sync_states"("integration_connection_id", "checkpoint_type");

-- CreateIndex
CREATE INDEX "idempotency_records_status_expires_at_idx" ON "idempotency_records"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_owner_subject_idempotency_key_operation_key" ON "idempotency_records"("owner_subject", "idempotency_key", "operation");

-- CreateIndex
CREATE UNIQUE INDEX "clients_logo_file_id_key" ON "clients"("logo_file_id");

-- CreateIndex
CREATE INDEX "clients_name_id_idx" ON "clients"("name", "id");

-- CreateIndex
CREATE INDEX "clients_mrr_id_idx" ON "clients"("mrr", "id");

-- CreateIndex
CREATE INDEX "clients_start_date_id_idx" ON "clients"("start_date", "id");

-- CreateIndex
CREATE INDEX "clients_status_id_idx" ON "clients"("status", "id");

-- CreateIndex
CREATE INDEX "contacts_normalized_email_idx" ON "contacts"("normalized_email");

-- CreateIndex
CREATE INDEX "contacts_client_id_normalized_email_idx" ON "contacts"("client_id", "normalized_email");

-- CreateIndex
CREATE INDEX "communications_integration_connection_id_provider_message_i_idx" ON "communications"("integration_connection_id", "provider_message_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_id_project_id_key" ON "tasks"("id", "project_id");

-- CreateIndex
CREATE INDEX "assignments_owner_account_id_idx" ON "assignments"("owner_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_id_project_id_key" ON "assignments"("id", "project_id");

-- CreateIndex
CREATE INDEX "deliverables_project_id_position_idx" ON "deliverables"("project_id", "position");

-- CreateIndex
CREATE INDEX "time_entries_owner_account_id_started_at_idx" ON "time_entries"("owner_account_id", "started_at");

-- CreateIndex
CREATE INDEX "time_entries_assignment_id_idx" ON "time_entries"("assignment_id");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "file_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_integration_connection_id_fkey" FOREIGN KEY ("integration_connection_id") REFERENCES "integration_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_contacts" ADD CONSTRAINT "communication_contacts_communication_id_fkey" FOREIGN KEY ("communication_id") REFERENCES "communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_contacts" ADD CONSTRAINT "communication_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_status_history" ADD CONSTRAINT "project_status_history_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_task_id_project_id_fkey" FOREIGN KEY ("task_id", "project_id") REFERENCES "tasks"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_owner_account_id_fkey" FOREIGN KEY ("owner_account_id") REFERENCES "owner_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_project_id_fkey" FOREIGN KEY ("task_id", "project_id") REFERENCES "tasks"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_owner_account_id_fkey" FOREIGN KEY ("owner_account_id") REFERENCES "owner_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_assignment_id_project_id_fkey" FOREIGN KEY ("assignment_id", "project_id") REFERENCES "assignments"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_states" ADD CONSTRAINT "integration_sync_states_integration_connection_id_fkey" FOREIGN KEY ("integration_connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New tables support direct administrative/worker writes as well as Prisma Client.
ALTER TABLE public.project_status_history ALTER COLUMN id SET DEFAULT extensions.gen_random_uuid();
ALTER TABLE public.integration_sync_states ALTER COLUMN id SET DEFAULT extensions.gen_random_uuid();
ALTER TABLE public.integration_sync_states ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.idempotency_records ALTER COLUMN id SET DEFAULT extensions.gen_random_uuid();
ALTER TABLE public.idempotency_records ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

CREATE TRIGGER set_integration_sync_states_updated_at
  BEFORE UPDATE ON public.integration_sync_states
  FOR EACH ROW EXECUTE FUNCTION public.aios_set_updated_at();
CREATE TRIGGER set_idempotency_records_updated_at
  BEFORE UPDATE ON public.idempotency_records
  FOR EACH ROW EXECUTE FUNCTION public.aios_set_updated_at();

-- Expand/backfill from the Part 2 compatibility fields.
UPDATE public.contacts
SET normalized_email = lower(btrim(email))
WHERE email IS NOT NULL AND normalized_email IS NULL;

INSERT INTO public.communication_contacts (communication_id, contact_id)
SELECT id, contact_id
FROM public.communications
WHERE contact_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.project_status_history
  (project_id, from_status, to_status, reason, changed_by, correlation_id, changed_at)
SELECT id, NULL, status, 'Part 3 baseline backfill', 'system:migration', 'migration_part3', created_at
FROM public.projects p
WHERE NOT EXISTS (
  SELECT 1 FROM public.project_status_history h WHERE h.project_id = p.id
);

UPDATE public.assignments a
SET owner_account_id = o.id
FROM public.owner_accounts o
WHERE a.assignee_type = 'human' AND a.owner_account_id IS NULL AND o.active;

UPDATE public.time_entries t
SET owner_account_id = o.id
FROM public.owner_accounts o
WHERE t.source = 'manual' AND t.owner_account_id IS NULL AND o.active;

-- Existing source records receive graph registry projections. Polymorphic source records remain truth.
INSERT INTO public.graph_nodes (type, entity_id, stable_key, label, metadata)
SELECT 'client', c.id, 'client:' || c.id::text, c.name, jsonb_build_object('projectionVersion', 1)
FROM public.clients c
ON CONFLICT DO NOTHING;

INSERT INTO public.graph_nodes (type, entity_id, stable_key, label, metadata)
SELECT 'human', c.id, 'contact:' || c.id::text, c.name, jsonb_build_object('projectionVersion', 1, 'clientId', c.client_id)
FROM public.contacts c
ON CONFLICT DO NOTHING;

INSERT INTO public.graph_edges (source_id, source_type, target_id, target_type, edge_type, label, metadata)
SELECT client_node.id, 'client', contact_node.id, 'human', 'ownership', 'has contact', jsonb_build_object('projectionVersion', 1)
FROM public.contacts c
JOIN public.graph_nodes client_node ON client_node.type = 'client' AND client_node.entity_id = c.client_id
JOIN public.graph_nodes contact_node ON contact_node.type = 'human' AND contact_node.entity_id = c.id
ON CONFLICT DO NOTHING;

-- Keep normalized email correct for Prisma and direct writers.
CREATE OR REPLACE FUNCTION public.aios_normalize_contact_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.normalized_email = CASE WHEN NEW.email IS NULL THEN NULL ELSE lower(btrim(NEW.email)) END;
  RETURN NEW;
END
$function$;
CREATE TRIGGER normalize_contact_email
  BEFORE INSERT OR UPDATE OF email ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.aios_normalize_contact_email();

-- Re-creatable business keys are unique only while records are live.
CREATE UNIQUE INDEX communications_provider_dedupe_idx
  ON public.communications (integration_connection_id, provider_message_id, client_id)
  WHERE integration_connection_id IS NOT NULL
    AND provider_message_id IS NOT NULL
    AND deleted_at IS NULL;

CREATE UNIQUE INDEX deliverables_live_position_idx
  ON public.deliverables (project_id, position)
  WHERE archived_at IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX assignments_live_agent_idx
  ON public.assignments (project_id, task_id, agent_id) NULLS NOT DISTINCT
  WHERE assignee_type = 'agent' AND archived_at IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX assignments_live_owner_idx
  ON public.assignments (project_id, task_id, owner_account_id) NULLS NOT DISTINCT
  WHERE assignee_type = 'human' AND archived_at IS NULL AND deleted_at IS NULL;

-- Typo-tolerant owner search, in addition to the existing full-text indexes.
CREATE INDEX clients_name_trgm_idx
  ON public.clients USING gin (lower(name) extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;
CREATE INDEX contacts_name_trgm_idx
  ON public.contacts USING gin (lower(name) extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;
CREATE INDEX contacts_email_trgm_idx
  ON public.contacts USING gin (normalized_email extensions.gin_trgm_ops)
  WHERE normalized_email IS NOT NULL AND deleted_at IS NULL;

-- Tighten identity, time, logo, deletion, and idempotency invariants.
ALTER TABLE public.assignments DROP CONSTRAINT assignments_assignee_ck;
ALTER TABLE public.assignments ADD CONSTRAINT assignments_assignee_ck CHECK (
  (assignee_type = 'agent' AND agent_id IS NOT NULL AND owner_account_id IS NULL AND owner_subject IS NULL)
  OR (assignee_type = 'human' AND agent_id IS NULL AND owner_account_id IS NOT NULL AND task_id IS NOT NULL)
);

ALTER TABLE public.time_entries DROP CONSTRAINT time_entries_values_ck;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_values_ck CHECK (
  minutes > 0
  AND (hourly_rate IS NULL OR hourly_rate >= 0)
  AND (ended_at IS NULL OR ended_at > started_at)
  AND (
    (source = 'manual' AND owner_account_id IS NOT NULL AND agent_run_id IS NULL AND ended_at IS NOT NULL)
    OR (source = 'agent_run' AND owner_account_id IS NULL AND agent_run_id IS NOT NULL)
  )
);

ALTER TABLE public.deletion_requests ADD CONSTRAINT deletion_requests_registry_ck CHECK (
  impact_registry_version > 0 AND (NOT legal_hold OR status <> 'completed')
);
ALTER TABLE public.idempotency_records ADD CONSTRAINT idempotency_records_fingerprint_ck CHECK (
  request_fingerprint ~ '^[0-9a-f]{64}$'
  AND (response_status IS NULL OR response_status BETWEEN 100 AND 599)
);
ALTER TABLE public.clients ADD CONSTRAINT clients_logo_url_ck CHECK (
  logo_url IS NULL OR logo_url LIKE '/api/v1/clients/%/logo'
);

-- Manual entries for the owner cannot overlap. Agent runs may execute concurrently.
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_owner_no_overlap
EXCLUDE USING gist (
  owner_account_id WITH =,
  tstzrange(started_at, ended_at, '[)') WITH &&
)
WHERE (
  source = 'manual' AND owner_account_id IS NOT NULL
  AND archived_at IS NULL AND deleted_at IS NULL
);

-- Project hours are derived from live time entries.
CREATE OR REPLACE FUNCTION public.aios_recalculate_project_hours(target_project_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = public, pg_temp
AS $function$
  UPDATE public.projects
  SET hours_spent = COALESCE((
    SELECT round(sum(minutes)::numeric / 60, 2)
    FROM public.time_entries
    WHERE project_id = target_project_id AND archived_at IS NULL AND deleted_at IS NULL
  ), 0)
  WHERE id = target_project_id;
$function$;

CREATE OR REPLACE FUNCTION public.aios_sync_project_hours()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.aios_recalculate_project_hours(OLD.project_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.aios_recalculate_project_hours(NEW.project_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$function$;
CREATE TRIGGER sync_project_hours
  AFTER INSERT OR UPDATE OR DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.aios_sync_project_hours();

DO $aios$
DECLARE project_record record;
BEGIN
  FOR project_record IN SELECT id FROM public.projects LOOP
    PERFORM public.aios_recalculate_project_hours(project_record.id);
  END LOOP;
END
$aios$;

-- A project cannot enter Delivered with incomplete required deliverables.
CREATE OR REPLACE FUNCTION public.aios_enforce_project_delivery()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.status = 'delivered' AND EXISTS (
    SELECT 1 FROM public.deliverables
    WHERE project_id = NEW.id AND is_required
      AND completed_at IS NULL AND archived_at IS NULL AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'required deliverables are incomplete' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER enforce_project_delivery
  BEFORE INSERT OR UPDATE OF status ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.aios_enforce_project_delivery();

CREATE OR REPLACE FUNCTION public.aios_protect_delivered_project_requirements()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE target_project_id uuid;
DECLARE delivered boolean;
DECLARE removes_completed_requirement boolean;
BEGIN
  target_project_id := COALESCE(NEW.project_id, OLD.project_id);
  SELECT status = 'delivered' INTO delivered FROM public.projects WHERE id = target_project_id;
  IF NOT delivered THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' THEN
    removes_completed_requirement := OLD.is_required AND OLD.archived_at IS NULL AND OLD.deleted_at IS NULL;
  ELSE
    removes_completed_requirement := NEW.is_required
      AND NEW.archived_at IS NULL AND NEW.deleted_at IS NULL AND NEW.completed_at IS NULL;
    IF TG_OP = 'UPDATE' AND OLD.is_required AND OLD.archived_at IS NULL AND OLD.deleted_at IS NULL
       AND (NEW.archived_at IS NOT NULL OR NEW.deleted_at IS NOT NULL) THEN
      removes_completed_requirement := true;
    END IF;
  END IF;

  IF removes_completed_requirement THEN
    RAISE EXCEPTION 'delivered projects cannot have incomplete or removed required deliverables' USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$function$;
CREATE TRIGGER protect_delivered_project_requirements
  BEFORE INSERT OR UPDATE OR DELETE ON public.deliverables
  FOR EACH ROW EXECUTE FUNCTION public.aios_protect_delivered_project_requirements();

-- Explicit defense in depth for new application tables on Supabase.
DO $aios$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.communication_contacts, public.project_status_history,
      public.integration_sync_states, public.idempotency_records FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.communication_contacts, public.project_status_history,
      public.integration_sync_states, public.idempotency_records FROM authenticated;
  END IF;
END
$aios$;

RESET search_path;
