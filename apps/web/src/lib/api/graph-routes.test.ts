import { graphNodeListQuerySchema } from "@aios/contracts";
import { describe, expect, it, vi } from "vitest";

const dataMocks = vi.hoisted(() => {
  class GraphOperationsError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
      this.name = "GraphOperationsError";
    }
  }
  return { GraphOperationsError };
});
vi.mock("@aios/data", () => ({
  GraphOperationsError: dataMocks.GraphOperationsError,
  IdempotencyStatus: { PROCESSING: "PROCESSING", COMPLETED: "COMPLETED", FAILED: "FAILED" },
  createGraphService: vi.fn(),
  getDatabaseClient: vi.fn(),
}));

import { GraphOperationsError } from "@aios/data";
import { mapGraphOperationsError, parseGraphEdgeId, parseGraphQuery } from "./graph-routes";

describe("graph route adapters", () => {
  it("normalizes repeated and comma-delimited graph array query parameters", () => {
    expect(parseGraphQuery(
      graphNodeListQuerySchema,
      "types=client,task&types=human_contact&hubs=clients&actions=blocked&actions=pending",
      ["types", "hubs", "actions"],
    )).toEqual({
      types: ["client", "task", "human_contact"],
      hubs: ["clients"],
      actions: ["blocked", "pending"],
      limit: 25,
    });
  });

  it("accepts bounded edge identifiers and rejects unsafe path values", () => {
    expect(parseGraphEdgeId("projection:hub:abc123")).toBe("projection:hub:abc123");
    expect(() => parseGraphEdgeId("../../private")).toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED", status: 422 }));
  });

  it("maps known domain failures to canonical public messages without exposing service details", () => {
    expect(mapGraphOperationsError(new GraphOperationsError("INVALID_CURSOR", "private cursor fingerprint"))).toMatchObject({
      code: "INVALID_CURSOR",
      status: 422,
      message: "The graph cursor is invalid or does not match the active filters.",
    });
    expect(mapGraphOperationsError(new GraphOperationsError("DUPLICATE_EDGE", "private natural key"))).toMatchObject({
      code: "DUPLICATE_EDGE",
      status: 409,
      message: "That graph relationship already exists.",
    });
  });
});
