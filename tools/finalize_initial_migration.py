from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION_DIR = ROOT / "packages" / "data" / "prisma" / "migrations" / "20260731000100_initial_data_platform"
GENERATED = MIGRATION_DIR / "migration.generated.sql"
OUTPUT = MIGRATION_DIR / "migration.sql"

HEADER = """-- AI OS Part 2 baseline: PostgreSQL 16+ and pgvector.
-- Prisma generated the relational DDL below; this reviewed prelude makes extension
-- types available on both Supabase and self-hosted pgvector installations.
CREATE SCHEMA IF NOT EXISTS \"public\";
CREATE SCHEMA IF NOT EXISTS \"extensions\";
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA \"extensions\";
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA \"extensions\";
SET search_path TO \"public\", \"extensions\";

"""

CUSTOM_SQL = r"""
-- Custom PostgreSQL guarantees that Prisma schema syntax cannot express.

-- Database-side UUIDs and update timestamps support reviewed administrative SQL,
-- seed tooling, and future workers that do not write through Prisma Client.
DO $aios$
DECLARE row_record record;
BEGIN
  FOR row_record IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'id' AND data_type = 'uuid'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN id SET DEFAULT gen_random_uuid()',
      row_record.table_schema,
      row_record.table_name
    );
  END LOOP;

  FOR row_record IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'ARRAY' AND is_nullable = 'YES'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I SET NOT NULL',
      row_record.table_schema,
      row_record.table_name,
      row_record.column_name
    );
  END LOOP;
END
$aios$;

CREATE OR REPLACE FUNCTION public.aios_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END
$function$;

DO $aios$
DECLARE row_record record;
BEGIN
  FOR row_record IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP',
      row_record.table_schema,
      row_record.table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION public.aios_set_updated_at()',
      'set_' || row_record.table_name || '_updated_at',
      row_record.table_schema,
      row_record.table_name
    );
  END LOOP;
END
$aios$;

-- Active-record uniqueness and replay safety.
CREATE UNIQUE INDEX owner_accounts_single_active_idx
  ON public.owner_accounts ((1)) WHERE active;

CREATE UNIQUE INDEX contacts_one_live_primary_per_client_idx
  ON public.contacts (client_id)
  WHERE is_primary AND archived_at IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX deletion_requests_one_active_per_entity_idx
  ON public.deletion_requests (entity_type, entity_id)
  WHERE status IN ('pending', 'executing');

CREATE UNIQUE INDEX sourced_leads_agency_provider_event_idx
  ON public.sourced_leads (source, provider_lead_id)
  WHERE scope = 'agency' AND client_id IS NULL AND provider_lead_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX sourced_leads_client_provider_event_idx
  ON public.sourced_leads (client_id, source, provider_lead_id)
  WHERE scope = 'client' AND client_id IS NOT NULL AND provider_lead_id IS NOT NULL AND deleted_at IS NULL;

-- Semantic search uses cosine distance (<=>). HNSW is suitable before cardinality
-- is known and does not require an IVFFlat training population.
CREATE INDEX agent_memories_embedding_hnsw_idx
  ON public.agent_memories USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX knowledge_entries_embedding_hnsw_idx
  ON public.knowledge_entries USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX knowledge_versions_embedding_hnsw_idx
  ON public.knowledge_versions USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL AND deleted_at IS NULL;

-- Full-text expression indexes. Queries must use the same regconfig and expression.
CREATE INDEX clients_search_idx ON public.clients USING gin (
  to_tsvector('simple'::regconfig, coalesce(name, '') || ' ' || coalesce(industry, '') || ' ' || coalesce(notes, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX communications_search_idx ON public.communications USING gin (
  to_tsvector('english'::regconfig, coalesce(summary, '') || ' ' || coalesce(body, '') || ' ' || coalesce(next_action, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX projects_search_idx ON public.projects USING gin (
  to_tsvector('english'::regconfig, coalesce(name, '') || ' ' || coalesce(description, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX tasks_search_idx ON public.tasks USING gin (
  to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(description, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX knowledge_entries_search_idx ON public.knowledge_entries USING gin (
  to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(content, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX knowledge_versions_search_idx ON public.knowledge_versions USING gin (
  to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(content, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX crm_leads_search_idx ON public.crm_leads USING gin (
  to_tsvector('simple'::regconfig, coalesce(name, '') || ' ' || coalesce(company, '') || ' ' || coalesce(interest, '') || ' ' || coalesce(notes, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX sourced_leads_search_idx ON public.sourced_leads USING gin (
  to_tsvector('simple'::regconfig, coalesce(name, '') || ' ' || coalesce(company, '') || ' ' || coalesce(title, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX sops_search_idx ON public.sops USING gin (
  to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(expected_outcome, ''))
) WHERE deleted_at IS NULL;

-- Scope, lifecycle, assignment, range, and financial integrity.
ALTER TABLE public.content_strategies ADD CONSTRAINT content_strategies_scope_client_ck CHECK (
  (scope = 'client' AND client_id IS NOT NULL) OR (scope = 'agency' AND client_id IS NULL)
);
ALTER TABLE public.brand_profiles ADD CONSTRAINT brand_profiles_scope_client_ck CHECK (
  (scope = 'client' AND client_id IS NOT NULL) OR (scope = 'agency' AND client_id IS NULL)
);
ALTER TABLE public.content_artifacts ADD CONSTRAINT content_artifacts_scope_client_ck CHECK (
  (scope = 'client' AND client_id IS NOT NULL) OR (scope = 'agency' AND client_id IS NULL)
);
ALTER TABLE public.content_calendar_entries ADD CONSTRAINT content_calendar_entries_scope_client_ck CHECK (
  (scope = 'client' AND client_id IS NOT NULL) OR (scope = 'agency' AND client_id IS NULL)
);
ALTER TABLE public.sourced_leads ADD CONSTRAINT sourced_leads_scope_client_ck CHECK (
  (scope = 'client' AND client_id IS NOT NULL) OR (scope = 'agency' AND client_id IS NULL)
);

ALTER TABLE public.assignments ADD CONSTRAINT assignments_assignee_ck CHECK (
  (assignee_type = 'agent' AND agent_id IS NOT NULL AND owner_subject IS NULL)
  OR (assignee_type = 'human' AND agent_id IS NULL AND owner_subject IS NOT NULL)
);
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_values_ck CHECK (
  minutes >= 0 AND (hourly_rate IS NULL OR hourly_rate >= 0) AND (ended_at IS NULL OR ended_at >= started_at)
);
ALTER TABLE public.agent_memories ADD CONSTRAINT agent_memories_kind_ck CHECK (
  (kind <> 'vector' OR (embedding IS NOT NULL AND embedding_model IS NOT NULL))
  AND (kind <> 'key_value' OR key IS NOT NULL)
  AND version > 0
  AND (token_count IS NULL OR token_count >= 0)
);
ALTER TABLE public.knowledge_entries ADD CONSTRAINT knowledge_entries_embedding_model_ck CHECK (
  embedding IS NULL OR embedding_model IS NOT NULL
);
ALTER TABLE public.knowledge_versions ADD CONSTRAINT knowledge_versions_embedding_model_ck CHECK (
  embedding IS NULL OR embedding_model IS NOT NULL
);
ALTER TABLE public.webhook_receipts ADD CONSTRAINT webhook_receipts_retention_ck CHECK (
  attempt >= 0 AND retention_until >= received_at AND payload_hash ~ '^[0-9a-f]{64}$'
);
ALTER TABLE public.deletion_requests ADD CONSTRAINT deletion_requests_timeline_ck CHECK (
  execute_after >= requested_at AND recovery_until >= execute_after
);
ALTER TABLE public.file_metadata ADD CONSTRAINT file_metadata_size_ck CHECK (size_bytes >= 0);
ALTER TABLE public.export_jobs ADD CONSTRAINT export_jobs_record_count_ck CHECK (record_count IS NULL OR record_count >= 0);
ALTER TABLE public.notification_deliveries ADD CONSTRAINT notification_deliveries_attempt_ck CHECK (attempt >= 0);
ALTER TABLE public.outbox_events ADD CONSTRAINT outbox_events_attempt_ck CHECK (attempt >= 0);
ALTER TABLE public.deliverables ADD CONSTRAINT deliverables_position_ck CHECK (position > 0);
ALTER TABLE public.sop_steps ADD CONSTRAINT sop_steps_position_ck CHECK (position > 0 AND sop_version > 0);
ALTER TABLE public.sop_executions ADD CONSTRAINT sop_executions_timeline_ck CHECK (
  sop_version > 0 AND (completed_at IS NULL OR completed_at >= started_at)
);

ALTER TABLE public.clients ADD CONSTRAINT clients_money_ck CHECK (mrr >= 0 AND total_revenue >= 0);
ALTER TABLE public.projects ADD CONSTRAINT projects_values_ck CHECK (
  (price IS NULL OR price >= 0) AND hours_spent >= 0 AND (due_date IS NULL OR start_date IS NULL OR due_date >= start_date)
);
ALTER TABLE public.agents ADD CONSTRAINT agents_values_ck CHECK (
  temperature BETWEEN 0 AND 2 AND max_tokens > 0 AND top_p BETWEEN 0 AND 1
  AND frequency_penalty BETWEEN -2 AND 2 AND (daily_token_budget IS NULL OR daily_token_budget >= 0)
  AND total_runs >= 0 AND total_cost_usd >= 0 AND success_rate BETWEEN 0 AND 100
);
ALTER TABLE public.agent_config_versions ADD CONSTRAINT agent_config_versions_values_ck CHECK (
  version > 0 AND temperature BETWEEN 0 AND 2 AND max_tokens > 0
  AND top_p BETWEEN 0 AND 1 AND frequency_penalty BETWEEN -2 AND 2
);
ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_values_ck CHECK (
  tokens_input >= 0 AND tokens_output >= 0 AND cost_usd >= 0
  AND (duration_ms IS NULL OR duration_ms >= 0) AND attempt > 0
  AND (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);
ALTER TABLE public.content_artifact_versions ADD CONSTRAINT content_artifact_versions_values_ck CHECK (version > 0 AND cost_usd >= 0);
ALTER TABLE public.content_metrics ADD CONSTRAINT content_metrics_value_ck CHECK (value >= 0);
ALTER TABLE public.sourced_leads ADD CONSTRAINT sourced_leads_fit_score_ck CHECK (fit_score IS NULL OR fit_score BETWEEN 0 AND 100);
ALTER TABLE public.crm_leads ADD CONSTRAINT crm_leads_values_ck CHECK (
  (value IS NULL OR value >= 0) AND (expected_close_probability IS NULL OR expected_close_probability BETWEEN 0 AND 100)
);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_amount_ck CHECK (amount >= 0);
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_values_ck CHECK (
  position > 0 AND quantity >= 0 AND rate >= 0 AND amount >= 0
);
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_ck CHECK (amount >= 0);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_ck CHECK (amount >= 0);
ALTER TABLE public.cost_ledger_entries ADD CONSTRAINT cost_ledger_entries_amount_ck CHECK (amount >= 0);
ALTER TABLE public.knowledge_entries ADD CONSTRAINT knowledge_entries_values_ck CHECK (version > 0 AND access_count >= 0);
ALTER TABLE public.knowledge_versions ADD CONSTRAINT knowledge_versions_version_ck CHECK (version > 0);
ALTER TABLE public.sops ADD CONSTRAINT sops_values_ck CHECK (current_version > 0 AND usage_count >= 0);

-- Preserve append-only evidence. Audit rows may only be updated to set archived_at.
CREATE OR REPLACE FUNCTION public.aios_protect_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit events are append-only';
  END IF;
  IF (to_jsonb(NEW) - 'archived_at') IS DISTINCT FROM (to_jsonb(OLD) - 'archived_at') THEN
    RAISE EXCEPTION 'audit events are immutable except for archived_at';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER protect_audit_events
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.aios_protect_audit_event();

-- The application uses a trusted server-only Prisma connection. Browser-facing
-- Supabase roles receive no direct table access; authorization is enforced by
-- validated owner identity before this connection is used.
DO $aios$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
  END IF;
END
$aios$;

RESET search_path;
"""


def main() -> None:
    generated = GENERATED.read_text(encoding="utf-8")
    generated = generated.replace('-- CreateSchema\nCREATE SCHEMA IF NOT EXISTS "public";\n\n', "", 1)
    if 'CREATE TABLE "owner_accounts"' not in generated:
        raise RuntimeError("Generated migration does not include owner_accounts")
    if 'CREATE TABLE "graph_nodes"' not in generated:
        raise RuntimeError("Generated migration does not include graph_nodes")
    if 'vector(1536)' not in generated:
        raise RuntimeError("Generated migration does not include vector(1536)")
    OUTPUT.write_text(HEADER + generated.rstrip() + "\n" + CUSTOM_SQL.lstrip(), encoding="utf-8", newline="\n")
    GENERATED.unlink()


if __name__ == "__main__":
    main()
