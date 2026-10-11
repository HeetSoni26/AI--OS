import type { RelationshipErrorCode } from "@aios/graph";

export type GraphOperationsErrorCode =
  | "INVALID_IDENTITY"
  | "INVALID_INPUT"
  | "INVALID_CURSOR"
  | "NOT_FOUND"
  | "CONFLICT"
  | RelationshipErrorCode;

export class GraphOperationsError extends Error {
  constructor(
    public readonly code: GraphOperationsErrorCode,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "GraphOperationsError";
  }
}
