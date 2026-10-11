import type { DeliveryBlocker } from "./types";

export type ClientOperationsErrorCode =
  | "INVALID_IDENTITY"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "DELIVERY_BLOCKED"
  | "DELETION_BLOCKED";

export class ClientOperationsError extends Error {
  constructor(
    public readonly code: ClientOperationsErrorCode,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "ClientOperationsError";
  }
}

export class DeliveryBlockedError extends ClientOperationsError {
  constructor(public readonly blockers: readonly DeliveryBlocker[]) {
    super("DELIVERY_BLOCKED", "Required deliverables must be completed before delivery.", { blockers });
    this.name = "DeliveryBlockedError";
  }
}
