export interface BackoffPolicy {
  delayMs(attempt: number): number;
}

export interface ExponentialBackoffOptions {
  readonly baseDelayMs?: number;
  readonly maximumDelayMs?: number;
  readonly multiplier?: number;
}

/** Deterministic exponential backoff. Jitter belongs at the deployment boundary. */
export function exponentialBackoff(options: ExponentialBackoffOptions = {}): BackoffPolicy {
  const baseDelayMs = options.baseDelayMs ?? 1_000;
  const maximumDelayMs = options.maximumDelayMs ?? 15 * 60_000;
  const multiplier = options.multiplier ?? 2;
  if (baseDelayMs < 0 || maximumDelayMs < baseDelayMs || multiplier < 1) {
    throw new Error("Invalid exponential backoff options.");
  }
  return {
    delayMs(attempt: number): number {
      const safeAttempt = Math.max(1, Math.floor(attempt));
      return Math.min(maximumDelayMs, baseDelayMs * multiplier ** (safeAttempt - 1));
    },
  };
}

export function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + Math.max(0, milliseconds));
}
