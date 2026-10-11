import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EMBEDDING_DIMENSIONS, serializeEmbedding } from "./index";

const schemaPath = fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url));
const initialMigrationPath = fileURLToPath(new URL("../prisma/migrations/20260731000100_initial_data_platform/migration.sql", import.meta.url));
const clientMigrationPath = fileURLToPath(new URL("../prisma/migrations/20260731000300_part_3_client_operations/migration.sql", import.meta.url));
const graphMigrationPath = fileURLToPath(new URL("../prisma/migrations/20260801000100_part_4_graph_foundation/migration.sql", import.meta.url));
const schema = readFileSync(schemaPath, "utf8");
const initialMigration = readFileSync(initialMigrationPath, "utf8");
const clientMigration = readFileSync(clientMigrationPath, "utf8");
const graphMigration = readFileSync(graphMigrationPath, "utf8");
const migration = `${initialMigration}\n${clientMigration}\n${graphMigration}`;

describe("Part 2 schema manifest", () => {
  it("defines the complete model and enum inventory", () => {
    expect(schema.match(/^model\s+\w+/gm)).toHaveLength(69);
    expect(schema.match(/^enum\s+\w+/gm)).toHaveLength(63);
    for (const model of ["OwnerAccount", "Client", "Agent", "AgentRun", "Project", "Invoice", "KnowledgeEntry", "CrmLead", "GraphNode", "GraphEdge", "Notification", "AuditEvent", "OutboxEvent", "WebhookReceipt", "ExportJob", "DeletionRequest"]) {
      expect(schema).toContain(`model ${model} {`);
    }
  });

  it("aligns generated relational DDL with the schema inventory", () => {
    expect(migration.match(/^CREATE TABLE/gm)).toHaveLength(69);
    expect(migration.match(/^CREATE TYPE/gm)).toHaveLength(63);
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(migration.match(/USING hnsw/g)).toHaveLength(3);
  });

  it("contains required partial, full-text, lifecycle, and financial guarantees", () => {
    for (const requirement of [
      "owner_accounts_single_active_idx",
      "contacts_one_live_primary_per_client_idx",
      "deletion_requests_one_active_per_entity_idx",
      "knowledge_entries_search_idx",
      "assignments_assignee_ck",
      "clients_money_ck",
      "invoice_line_items_values_ck",
      "deletion_requests_timeline_ck",
      "protect_audit_events",
      "communications_provider_dedupe_idx",
      "deliverables_live_position_idx",
      "clients_name_trgm_idx",
      "time_entries_owner_no_overlap",
      "enforce_project_delivery",
      "sync_project_hours",
    ]) expect(migration).toContain(requirement);
  });

  it("stores only connection-scoped webhook identities and durable outbox correlation", () => {
    expect(schema).toContain("@@unique([integrationConnectionId, providerEventId])");
    expect(schema).toMatch(/model OutboxEvent[\s\S]*correlationId\s+String[\s\S]*occurredAt\s+DateTime/);
  });
});

describe("Part 4 graph schema foundation", () => {
  it("distinguishes system projections from owner-explicit relationships", () => {
    expect(schema).toMatch(/enum GraphEdgeProvenance \{[\s\S]*SYSTEM_PROJECTION\s+@map\("system_projection"\)[\s\S]*OWNER_EXPLICIT\s+@map\("owner_explicit"\)/);
    expect(schema).toMatch(/model GraphEdge \{[\s\S]*provenance\s+GraphEdgeProvenance\s+@default\(OWNER_EXPLICIT\)/);
    expect(graphMigration).toContain("WHERE metadata ? 'projectionVersion'");
    expect(graphMigration).toContain("SET provenance = 'system_projection'");
    expect(graphMigration).toContain("ALTER COLUMN provenance SET NOT NULL");
  });

  it("preserves full-lifecycle edge identity for soft-delete restore", () => {
    expect(schema).toContain("@@unique([sourceId, sourceType, targetId, targetType, edgeType])");
    expect(graphMigration).toContain("Full-lifecycle natural key");
    expect(graphMigration).not.toContain("DROP INDEX \"graph_edges_source_id_source_type_target_id_target_type_edg_key\"");
  });

  it("provisions exactly the nine deterministic structural hubs with placement hints", () => {
    const hubKeys = new Set(Array.from(graphMigration.matchAll(/'hub:([a-z-]+)'/g), (match) => match[1]));
    expect(hubKeys).toEqual(new Set(["command", "clients", "agents", "finance", "pipeline-crm", "content", "knowledge", "automations", "tools"]));
    expect(graphMigration.match(/"placementHint"/g)).toHaveLength(9);
    for (const region of ["center", "upper_left", "upper_right", "lower_right", "right", "lower_left", "left", "lower_center", "periphery"]) {
      expect(graphMigration).toContain(`"region":"${region}"`);
    }
    expect(graphMigration.match(/^INSERT INTO public\./gm)).toHaveLength(1);
    expect(graphMigration).toContain("INSERT INTO public.graph_nodes");
    expect(graphMigration).toContain("ON CONFLICT (stable_key) DO UPDATE");
  });

  it("adds live fuzzy search and graph lifecycle lookup indexes", () => {
    for (const index of [
      "graph_nodes_lifecycle_idx",
      "graph_edges_lifecycle_idx",
      "graph_edges_source_live_lookup_idx",
      "graph_edges_target_live_lookup_idx",
      "graph_nodes_live_label_trgm_idx",
    ]) expect(graphMigration).toContain(index);
    expect(graphMigration).toMatch(/graph_nodes_live_label_trgm_idx[\s\S]*USING gin \(lower\(label\) extensions\.gin_trgm_ops\)[\s\S]*WHERE archived_at IS NULL AND deleted_at IS NULL/);
  });
});

describe("embedding boundary", () => {
  it("serializes exactly 1,536 finite values", () => {
    const embedding = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => index / EMBEDDING_DIMENSIONS);
    expect(serializeEmbedding(embedding)).toMatch(/^\[0,/);
    expect(() => serializeEmbedding([0, 1])).toThrow(RangeError);
    expect(() => serializeEmbedding([...new Array<number>(EMBEDDING_DIMENSIONS - 1).fill(0), Number.NaN])).toThrow(TypeError);
  });
});
