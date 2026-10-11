import { describe, expect, it } from "vitest";
import { openApiDocument } from "./openapi";

const operationMethods = (path: string) => Object.keys(openApiDocument.paths[path] ?? {})
  .filter((key) => ["get", "post", "put", "patch", "delete", "options"].includes(key))
  .sort();

describe("graph OpenAPI 3.1 contract", () => {
  it("documents every required graph route with exact methods", () => {
    expect(operationMethods("/api/v1/graph")).toEqual(["get", "options"]);
    expect(operationMethods("/api/v1/graph/directory")).toEqual(["get", "options"]);
    expect(operationMethods("/api/v1/graph/nodes")).toEqual(["get", "options"]);
    expect(operationMethods("/api/v1/graph/nodes/{nodeId}")).toEqual(["get", "options"]);
    expect(operationMethods("/api/v1/graph/edges")).toEqual(["get", "options", "post"]);
    expect(operationMethods("/api/v1/graph/edges/{edgeId}")).toEqual(["delete", "options"]);
    expect(operationMethods("/api/v1/graph/search")).toEqual(["get", "options"]);
  });

  it("publishes owner security, typed graph schemas, examples, and standard errors", () => {
    const operation = openApiDocument.paths["/api/v1/graph/edges"].post as Record<string, unknown>;
    expect(operation).toMatchObject({
      operationId: "createGraphEdge",
      security: [{ BearerAuth: [] }, { CookieSession: [] }],
      requestBody: { required: true },
      responses: {
        "201": { description: expect.any(String) },
        "401": { "x-status-code": 401 },
        "409": { "x-status-code": 409 },
        "422": { "x-status-code": 422 },
        "429": { "x-status-code": 429 },
      },
    });
    const response = (operation.responses as Record<string, Record<string, unknown>>)["201"];
    expect(response.headers).toHaveProperty("idempotency-replayed");
    expect(response.content).toHaveProperty("application/json.example.data.id", "7d31b783-df4b-4f82-b9c9-7f29d236299f");
    expect(openApiDocument.components.schemas).toMatchObject({
      Graph: expect.any(Object),
      GraphDirectory: expect.any(Object),
      GraphNode: expect.any(Object),
      GraphNodeList: expect.any(Object),
      GraphNodeDetail: expect.any(Object),
      GraphEdge: expect.any(Object),
      GraphEdgeCreate: expect.any(Object),
      GraphEdgeList: expect.any(Object),
      GraphSearch: expect.any(Object),
    });
  });

  it("documents the secured directory query, response example, and standard errors", () => {
    const operation = openApiDocument.paths["/api/v1/graph/directory"].get as {
      operationId: string;
      security: unknown;
      parameters: Array<Record<string, unknown>>;
      responses: Record<string, Record<string, unknown>>;
    };
    expect(operation).toMatchObject({
      operationId: "getGraphDirectory",
      security: [{ BearerAuth: [] }, { CookieSession: [] }],
      responses: {
        "200": { description: expect.any(String) },
        "401": { "x-status-code": 401 },
        "403": { "x-status-code": 403 },
        "422": { "x-status-code": 422 },
        "429": { "x-status-code": 429 },
        "500": { "x-status-code": 500 },
      },
    });
    expect(operation.parameters).toEqual([
      expect.objectContaining({ name: "query", in: "query", required: false, schema: { type: "string", maxLength: 200 } }),
      expect.objectContaining({
        name: "groups",
        in: "query",
        style: "form",
        explode: true,
        schema: expect.objectContaining({ type: "array", items: expect.objectContaining({ enum: ["ai_agents", "clients", "tools", "recent_tasks", "knowledge"] }) }),
      }),
    ]);
    expect(operation.responses["200"]?.content).toHaveProperty("application/json.example.data.groups.0.key", "clients");
  });

  it("documents repeated array filters and validated graph identifiers", () => {
    const nodeList = openApiDocument.paths["/api/v1/graph/nodes"].get as { parameters: Array<Record<string, unknown>> };
    const types = nodeList.parameters.find((parameter) => parameter.name === "types") as Record<string, unknown>;
    const hubs = nodeList.parameters.find((parameter) => parameter.name === "hubs") as Record<string, unknown>;
    const actions = nodeList.parameters.find((parameter) => parameter.name === "actions") as Record<string, unknown>;
    for (const parameter of [types, hubs, actions]) {
      expect(parameter).toMatchObject({ in: "query", style: "form", explode: true, schema: { type: "array" } });
    }
    expect(openApiDocument.paths["/api/v1/graph/nodes/{nodeId}"].parameters).toEqual([
      expect.objectContaining({ name: "nodeId", in: "path", required: true, schema: expect.objectContaining({ format: "uuid" }) }),
    ]);
  });

  it("keeps preflight public while graph data operations remain secured", () => {
    const paths = [
      "/api/v1/graph",
      "/api/v1/graph/directory",
      "/api/v1/graph/nodes",
      "/api/v1/graph/nodes/{nodeId}",
      "/api/v1/graph/edges",
      "/api/v1/graph/edges/{edgeId}",
      "/api/v1/graph/search",
    ];
    for (const path of paths) {
      expect(openApiDocument.paths[path].options).toMatchObject({ security: [], responses: { "204": expect.any(Object), "403": expect.any(Object) } });
      for (const method of operationMethods(path).filter((method) => method !== "options")) {
        expect(openApiDocument.paths[path][method]).toMatchObject({ security: [{ BearerAuth: [] }, { CookieSession: [] }] });
      }
    }
  });
});
