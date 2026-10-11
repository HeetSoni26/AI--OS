import { describe, expect, it } from "vitest";
import {
  canDeleteRelationship,
  createOwnerRelationship,
  createProjectedRelationship,
  validateRelationshipCreate,
} from "./relationships";
import {
  AGENT_GRAPH_ID,
  CLIENT_GRAPH_ID,
  CLIENTS_HUB_GRAPH_ID,
  INVOICE_GRAPH_ID,
  TASK_GRAPH_ID,
  makeAgent,
  makeClient,
  makeEdge,
  makeHub,
  makeInvoice,
  makeTask,
  TEST_NOW,
} from "./test-helpers";

const MISSING_GRAPH_ID = "00000000-0000-4000-8000-000000000999";

describe("relationship validation and ownership policy", () => {
  const nodes = [makeClient(), makeAgent(), makeTask(), makeInvoice(), makeHub()];

  it("accepts valid SRS relationship endpoints by graph UUID", () => {
    expect(validateRelationshipCreate({ sourceNodeId: CLIENTS_HUB_GRAPH_ID, targetNodeId: CLIENT_GRAPH_ID, type: "ownership", label: null }, { nodes }).valid).toBe(true);
    expect(validateRelationshipCreate({ sourceNodeId: AGENT_GRAPH_ID, targetNodeId: TASK_GRAPH_ID, type: "assignment", label: null }, { nodes }).valid).toBe(true);
    expect(validateRelationshipCreate({ sourceNodeId: CLIENT_GRAPH_ID, targetNodeId: INVOICE_GRAPH_ID, type: "financial", label: null }, { nodes }).valid).toBe(true);
  });

  it("rejects stable keys, missing, self-referential, duplicate, and invalid endpoints", () => {
    expect(validateRelationshipCreate({ sourceNodeId: MISSING_GRAPH_ID, targetNodeId: CLIENT_GRAPH_ID, type: "assignment", label: null }, { nodes })).toMatchObject({ valid: false, code: "SOURCE_NOT_FOUND" });
    expect(validateRelationshipCreate({ sourceNodeId: AGENT_GRAPH_ID, targetNodeId: MISSING_GRAPH_ID, type: "assignment", label: null }, { nodes })).toMatchObject({ valid: false, code: "TARGET_NOT_FOUND" });
    expect(validateRelationshipCreate({ sourceNodeId: AGENT_GRAPH_ID, targetNodeId: AGENT_GRAPH_ID, type: "assignment", label: null }, { nodes })).toMatchObject({ valid: false, code: "SELF_REFERENCE" });
    expect(validateRelationshipCreate({ sourceNodeId: AGENT_GRAPH_ID, targetNodeId: CLIENT_GRAPH_ID, type: "assignment", label: null }, { nodes, edges: [makeEdge()] })).toMatchObject({ valid: false, code: "DUPLICATE_EDGE" });
    expect(validateRelationshipCreate({ sourceNodeId: CLIENT_GRAPH_ID, targetNodeId: AGENT_GRAPH_ID, type: "ownership", label: null }, { nodes })).toMatchObject({ valid: false, code: "INVALID_ENDPOINT_TYPES" });
    expect(validateRelationshipCreate({ sourceNodeId: makeAgent().stableKey, targetNodeId: makeClient().stableKey, type: "assignment", label: null }, { nodes })).toMatchObject({ valid: false, code: "INVALID_ENDPOINT_TYPES" });
  });

  it("creates owner edges separately from projected source truth", () => {
    const owner = createOwnerRelationship("edge:new", { sourceNodeId: AGENT_GRAPH_ID, targetNodeId: TASK_GRAPH_ID, type: "assignment", label: "Works on" }, TEST_NOW, { nodes });
    expect(owner).toMatchObject({ id: "edge:new", origin: "owner", projectionKey: null });
    expect(canDeleteRelationship(owner)).toEqual({ allowed: true });

    const { origin: _origin, projectionKey: _projectionKey, ...projectedFields } = makeEdge({ id: "edge:projected" });
    const projected = createProjectedRelationship("clients.assignments", projectedFields);
    expect(projected).toMatchObject({ origin: "projection", projectionKey: "clients.assignments" });
    expect(canDeleteRelationship(projected)).toMatchObject({ allowed: false, code: "PROJECTED_EDGE_IMMUTABLE" });
  });
});
