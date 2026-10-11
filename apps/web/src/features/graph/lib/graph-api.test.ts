import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-client";
import { graphApi } from "./graph-api";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

const response = { data: { ok: true }, meta: { requestId: "req-graph-test", apiVersion: "v1" as const, total: 1, cursor: null, hasMore: false } };

beforeEach(() => {
  vi.mocked(apiFetch).mockReset().mockResolvedValue(response);
});

describe("graphApi browser adapter", () => {
  it("targets the required graph read endpoints with repeated typed filters", async () => {
    await graphApi.graph();
    expect(apiFetch).toHaveBeenLastCalledWith("/api/v1/graph", undefined);

    await graphApi.nodes({ limit: 100, types: ["client", "task"], hubs: ["clients"], actions: ["active_running"], status: "active" });
    expect(apiFetch).toHaveBeenLastCalledWith("/api/v1/graph/nodes?limit=100&status=active&types=client&types=task&hubs=clients&actions=active_running", undefined);

    await graphApi.edges({ limit: 25, types: ["ownership", "assignment"], nodeId: "00000000-0000-4000-8000-000000000001" });
    expect(apiFetch).toHaveBeenLastCalledWith("/api/v1/graph/edges?limit=25&nodeId=00000000-0000-4000-8000-000000000001&types=ownership&types=assignment", undefined);

    await graphApi.detail("00000000-0000-4000-8000-000000000001");
    expect(apiFetch).toHaveBeenLastCalledWith("/api/v1/graph/nodes/00000000-0000-4000-8000-000000000001", undefined);

    await graphApi.search({ query: "atlas automation", types: ["client"], limit: 20 });
    expect(apiFetch).toHaveBeenLastCalledWith("/api/v1/graph/search?query=atlas+automation&limit=20&types=client", undefined);

    await graphApi.directory({ query: "atlas", groups: ["clients"] });
    expect(apiFetch).toHaveBeenLastCalledWith("/api/v1/graph/directory?query=atlas&groups=clients", undefined);
  });

  it("targets relationship create and delete endpoints without changing API primitives", async () => {
    const input = { sourceNodeId: "00000000-0000-4000-8000-000000000001", targetNodeId: "00000000-0000-4000-8000-000000000002", type: "ownership", label: null } as const;
    await graphApi.createEdge(input, "graph_edge_create_001");
    expect(apiFetch).toHaveBeenLastCalledWith("/api/v1/graph/edges", expect.objectContaining({ method: "POST", body: JSON.stringify(input), headers: expect.objectContaining({ "Idempotency-Key": "graph_edge_create_001" }) }));

    await graphApi.deleteEdge("edge:owner/one", "graph_edge_delete_001");
    expect(apiFetch).toHaveBeenLastCalledWith("/api/v1/graph/edges/edge%3Aowner%2Fone", expect.objectContaining({ method: "DELETE", headers: expect.objectContaining({ "Idempotency-Key": "graph_edge_delete_001" }) }));
  });
});
