import type { DeliveryBlocker } from "@aios/contracts";

export type ClientDomainErrorCode =
  | "DELIVERY_BLOCKED"
  | "INVALID_TIME_ENTRY"
  | "TIME_ENTRY_OVERLAP"
  | "INVALID_DATE_RANGE"
  | "MULTIPLE_PRIMARY_CONTACTS"
  | "INVALID_LIFECYCLE_TRANSITION"
  | "DELETION_BLOCKED"
  | "DELETION_RECOVERY_EXPIRED"
  | "DUPLICATE_DELETION_IMPACT_CONTRIBUTOR";

export class ClientDomainError<TCode extends ClientDomainErrorCode = ClientDomainErrorCode> extends Error {
  constructor(
    readonly code: TCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "ClientDomainError";
  }
}

export class DeliveryBlockedError extends ClientDomainError<"DELIVERY_BLOCKED"> {
  constructor(readonly blockers: readonly DeliveryBlocker[]) {
    super("DELIVERY_BLOCKED", "Project cannot be delivered until every required deliverable is complete.", {
      blockers,
    });
    this.name = "DeliveryBlockedError";
  }
}

export class TimeEntryValidationError extends ClientDomainError<"INVALID_TIME_ENTRY" | "TIME_ENTRY_OVERLAP"> {
  constructor(
    code: "INVALID_TIME_ENTRY" | "TIME_ENTRY_OVERLAP",
    message: string,
    readonly issues: readonly string[],
    readonly overlappingEntryIds: readonly string[] = [],
  ) {
    super(code, message, { issues, overlappingEntryIds });
    this.name = "TimeEntryValidationError";
  }
}

export class LifecyclePolicyError extends ClientDomainError<
  "INVALID_LIFECYCLE_TRANSITION" | "DELETION_BLOCKED" | "DELETION_RECOVERY_EXPIRED"
> {
  constructor(
    code: "INVALID_LIFECYCLE_TRANSITION" | "DELETION_BLOCKED" | "DELETION_RECOVERY_EXPIRED",
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(code, message, details);
    this.name = "LifecyclePolicyError";
  }
}
