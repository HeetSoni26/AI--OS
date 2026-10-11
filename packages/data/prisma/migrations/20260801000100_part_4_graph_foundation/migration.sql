-- AI OS Part 4: knowledge-graph provenance, lifecycle/search support, and deterministic hubs.
-- The graph remains a read model: hub records are structural only and no child business records are fabricated.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
SET search_path TO public, extensions;

-- Graph edges created by source projections must remain distinguishable from owner-authored relationships.
CREATE TYPE "GraphEdgeProvenance" AS ENUM ('system_projection', 'owner_explicit');

ALTER TABLE public.graph_edges
  ADD COLUMN provenance "GraphEdgeProvenance";

-- Part 3 marked source projections with projectionVersion metadata. Preserve those rows and their natural keys.
UPDATE public.graph_edges
SET provenance = 'system_projection'
WHERE metadata ? 'projectionVersion';

-- Existing unmarked relationships predate provenance and are treated as owner-explicit rather than system-owned.
UPDATE public.graph_edges
SET provenance = 'owner_explicit'
WHERE provenance IS NULL;

ALTER TABLE public.graph_edges
  ALTER COLUMN provenance SET DEFAULT 'owner_explicit',
  ALTER COLUMN provenance SET NOT NULL;

COMMENT ON TYPE "GraphEdgeProvenance" IS
  'Management provenance for graph relationships: source projection lifecycle or owner-explicit lifecycle.';
COMMENT ON COLUMN public.graph_edges.provenance IS
  'system_projection edges follow source entities; owner_explicit edges are managed through graph relationship actions.';
COMMENT ON INDEX public.graph_edges_source_id_source_type_target_id_target_type_edg_key IS
  'Full-lifecycle natural key. Soft deletion retains identity so restore updates the same graph edge instead of inserting a duplicate.';

-- These UUIDv5 values use the RFC 4122 URL namespace with urn:aios:graph-node:hub:<slug>.
-- Refuse to overwrite an unrelated row if a stable key or deterministic UUID was already claimed.
DO $aios$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.graph_nodes node
    JOIN (VALUES
      ('d42f787d-c6f4-5b97-87c3-5f54f3bf5129'::uuid, 'hub:command'),
      ('02ed5eda-41d1-52f4-b272-d030255b4b6f'::uuid, 'hub:clients'),
      ('d61dcc77-35ad-5393-9445-f71f5bc533d2'::uuid, 'hub:agents'),
      ('b7be8485-a557-5ca2-aabb-be1f31d62fa0'::uuid, 'hub:finance'),
      ('92c69628-2049-5d0e-91da-46ace200f057'::uuid, 'hub:pipeline-crm'),
      ('823f924c-33ba-5127-9901-e79d53bcf5d6'::uuid, 'hub:content'),
      ('0f28919d-ff6b-58f3-bf41-b2a133269ebb'::uuid, 'hub:knowledge'),
      ('89e8cde4-a2a6-5172-94e3-2e2b83f0f87e'::uuid, 'hub:automations'),
      ('090066a5-ef79-537b-932b-531c710ae4c3'::uuid, 'hub:tools')
    ) AS expected(id, stable_key)
      ON node.id = expected.id OR node.stable_key = expected.stable_key
    WHERE node.id <> expected.id
       OR node.stable_key <> expected.stable_key
       OR node.type <> 'hub'
       OR node.entity_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Part 4 hub stable key or deterministic UUID is already assigned to an unrelated graph node'
      USING ERRCODE = '23505';
  END IF;
END
$aios$;

-- Placement uses normalized coordinates as force-layout hints, not persisted child entities.
WITH hubs(id, stable_key, label, metadata) AS (
  VALUES
    (
      'd42f787d-c6f4-5b97-87c3-5f54f3bf5129'::uuid,
      'hub:command',
      'Command',
      '{"hubSlug":"command","icon":"crown_or_star","contains":["dashboard","key_metrics","owner_profile","quick_actions"],"placementHint":{"mode":"fixed","region":"center","x":0,"y":0},"summaryContract":{"entityCount":"derived","summaryStat":"derived"},"projectionVersion":1}'::jsonb
    ),
    (
      '02ed5eda-41d1-52f4-b272-d030255b4b6f'::uuid,
      'hub:clients',
      'Clients',
      '{"hubSlug":"clients","icon":"building","contains":["client","human_contact","project"],"placementHint":{"mode":"quadrant","region":"upper_left","x":-0.68,"y":-0.55},"summaryContract":{"entityCount":"derived","summaryStat":"derived"},"projectionVersion":1}'::jsonb
    ),
    (
      'd61dcc77-35ad-5393-9445-f71f5bc533d2'::uuid,
      'hub:agents',
      'Agents',
      '{"hubSlug":"agents","icon":"robot","contains":["agent"],"placementHint":{"mode":"quadrant","region":"upper_right","x":0.68,"y":-0.55},"summaryContract":{"entityCount":"derived","summaryStat":"derived"},"projectionVersion":1}'::jsonb
    ),
    (
      'b7be8485-a557-5ca2-aabb-be1f31d62fa0'::uuid,
      'hub:finance',
      'Finance',
      '{"hubSlug":"finance","icon":"dollar_sign","contains":["revenue","invoice","expense","stripe_data"],"placementHint":{"mode":"quadrant","region":"lower_right","x":0.68,"y":0.58},"summaryContract":{"entityCount":"derived","summaryStat":"derived"},"projectionVersion":1}'::jsonb
    ),
    (
      '92c69628-2049-5d0e-91da-46ace200f057'::uuid,
      'hub:pipeline-crm',
      'Pipeline / CRM',
      '{"hubSlug":"pipeline-crm","icon":"funnel","contains":["lead","deal","proposal","follow_up"],"placementHint":{"mode":"quadrant","region":"right","x":0.86,"y":0},"summaryContract":{"entityCount":"derived","summaryStat":"derived"},"projectionVersion":1}'::jsonb
    ),
    (
      '823f924c-33ba-5127-9901-e79d53bcf5d6'::uuid,
      'hub:content',
      'Content',
      '{"hubSlug":"content","icon":"pen_or_megaphone","contains":["content_calendar","published_post","draft","template"],"placementHint":{"mode":"quadrant","region":"lower_left","x":-0.62,"y":0.58},"summaryContract":{"entityCount":"derived","summaryStat":"derived"},"projectionVersion":1}'::jsonb
    ),
    (
      '0f28919d-ff6b-58f3-bf41-b2a133269ebb'::uuid,
      'hub:knowledge',
      'Knowledge',
      '{"hubSlug":"knowledge","icon":"brain","contains":["sop","template","brand_voice","lesson","memory"],"placementHint":{"mode":"quadrant","region":"left","x":-0.86,"y":0},"summaryContract":{"entityCount":"derived","summaryStat":"derived"},"projectionVersion":1}'::jsonb
    ),
    (
      '89e8cde4-a2a6-5172-94e3-2e2b83f0f87e'::uuid,
      'hub:automations',
      'Automations',
      '{"hubSlug":"automations","icon":"gear","contains":["n8n_workflow","make_scenario","webhook_trigger"],"placementHint":{"mode":"quadrant","region":"lower_center","x":0,"y":0.78},"summaryContract":{"entityCount":"derived","summaryStat":"derived"},"projectionVersion":1}'::jsonb
    ),
    (
      '090066a5-ef79-537b-932b-531c710ae4c3'::uuid,
      'hub:tools',
      'Tools',
      '{"hubSlug":"tools","icon":"wrench","contains":["connected_integration"],"placementHint":{"mode":"periphery","region":"periphery"},"summaryContract":{"entityCount":"derived","summaryStat":"derived"},"projectionVersion":1}'::jsonb
    )
)
INSERT INTO public.graph_nodes AS existing (id, type, entity_id, stable_key, label, metadata, archived_at, deleted_at)
SELECT id, 'hub', NULL, stable_key, label, metadata, NULL, NULL
FROM hubs
ON CONFLICT (stable_key) DO UPDATE
SET label = EXCLUDED.label,
    metadata = COALESCE(existing.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    archived_at = NULL,
    deleted_at = NULL,
    updated_at = CURRENT_TIMESTAMP;

-- Lifecycle indexes support active lists, restore flows, provenance maintenance, and endpoint lookups.
CREATE INDEX graph_nodes_lifecycle_idx
  ON public.graph_nodes (deleted_at, archived_at, type, updated_at DESC);
CREATE INDEX graph_edges_lifecycle_idx
  ON public.graph_edges (provenance, deleted_at, archived_at, updated_at DESC);
CREATE INDEX graph_edges_source_live_lookup_idx
  ON public.graph_edges (source_id, deleted_at, archived_at);
CREATE INDEX graph_edges_target_live_lookup_idx
  ON public.graph_edges (target_id, deleted_at, archived_at);

-- Fuzzy graph search only indexes records visible to normal live graph reads.
CREATE INDEX graph_nodes_live_label_trgm_idx
  ON public.graph_nodes USING gin (lower(label) extensions.gin_trgm_ops)
  WHERE archived_at IS NULL AND deleted_at IS NULL;

RESET search_path;
