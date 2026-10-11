export class AgentOperationsError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "INVALID_IDENTITY"
      | "NOT_FOUND"
      | "CONFLICT"
      | "BUDGET_EXCEEDED"
      | "CONFIG_INVALID"
      | "CHAIN_CYCLE"
      | "APPROVAL_STALE"
      | "RUN_STATE_INVALID"
      | "QUOTA_EXCEEDED",
    message: string,
  ) {
    super(message);
    this.name = "AgentOperationsError";
  }
}
