const MAX_ERROR_LENGTH = 1_000;

export class ClaimLostError extends Error {
  constructor(kind: string, id: string) {
    super(`${kind} claim ${id} is no longer owned by this worker.`);
    this.name = "ClaimLostError";
  }
}

/** Keeps persisted worker errors bounded and avoids serializing unknown objects. */
export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Worker operation failed.";
  return message.replace(/[\r\n\t]+/gu, " ").slice(0, MAX_ERROR_LENGTH);
}
