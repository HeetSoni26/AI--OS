import { createHash } from "node:crypto";
import { z } from "zod";

export const idempotencyKeySchema = z.string().min(8).max(255).regex(/^[a-zA-Z0-9:_-]+$/);

export function idempotencyFingerprint(key: string, operation: string, payload: unknown): string {
  const validKey = idempotencyKeySchema.parse(key);
  return createHash("sha256").update(validKey).update("\0").update(operation).update("\0").update(JSON.stringify(payload)).digest("hex");
}

export type IdempotencyResult<T> = { state: "created" | "replayed"; value: T; fingerprint: string };
