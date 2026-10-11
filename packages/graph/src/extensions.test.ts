import { describe, expect, it } from "vitest";
import { DetailRegistry, ProjectionRegistry } from "./extensions";
import { makeClient, makeEdge, TEST_NOW } from "./test-helpers";

describe("projection registry extension API", () => {
  it("registers, validates, resolves, and unregisters domain projections", () => {
    const registry = new ProjectionRegistry();
    const dispose = registry.register<{ name: string }>({
      key: "clients.core",
      project: (source) => ({
        nodes: [makeClient({ label: source.name, metadata: { name: source.name, industry: null, mrr: 0, status: "active", startDate: null, projectsCount: 0 } })],
        edges: [],
      }),
    });
    expect(registry.keys()).toEqual(["clients.core"]);
    expect(registry.project("clients.core", { name: "Projected Client" }, { generatedAt: TEST_NOW }).nodes[0]?.label).toBe("Projected Client");
    dispose();
    expect(registry.has("clients.core")).toBe(false);
  });

  it("rejects duplicate keys and edges that impersonate another owner", () => {
    const registry = new ProjectionRegistry();
    registry.register({ key: "clients.core", project: () => ({ nodes: [], edges: [] }) });
    expect(() => registry.register({ key: "clients.core", project: () => ({ nodes: [], edges: [] }) })).toThrow(/already registered/);

    const bad = new ProjectionRegistry();
    bad.register({
      key: "clients.core",
      project: () => ({ nodes: [makeClient()], edges: [makeEdge()] }),
    });
    expect(() => bad.project("clients.core", {}, { generatedAt: TEST_NOW })).toThrow(/projection ownership/);
  });
});

describe("detail registry extension API", () => {
  it("resolves typed detail slots without a renderer switch", () => {
    const registry = new DetailRegistry();
    const dispose = registry.register({
      key: "clients.drawer",
      nodeType: "client",
      resolve: (detail) => ({ heading: detail.node.label, connectionCount: detail.connections.length }),
    });
    const detail = { node: makeClient(), connections: [] };
    expect(registry.resolve(detail, { getNodeDetail: () => detail })).toEqual({ heading: "Acme Dental", connectionCount: 0 });
    dispose();
    expect(registry.resolve(detail, { getNodeDetail: () => detail })).toBeUndefined();
  });

  it("rejects duplicate detail slots for a node type", () => {
    const registry = new DetailRegistry();
    registry.register({ key: "clients.drawer", nodeType: "client", resolve: () => null });
    expect(() => registry.register({ key: "clients.other", nodeType: "client", resolve: () => null })).toThrow(/already registered/);
  });
});
