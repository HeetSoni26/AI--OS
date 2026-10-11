import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const webhookReceiptSchema = z.object({
  provider: z.string().min(1),
  connectionId: z.uuid(),
  providerEventId: z.string().min(1).max(255),
  eventType: z.string().min(1),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  receivedAt: z.string().datetime(),
  status: z.enum(["received", "processing", "processed", "failed", "ignored", "dead_letter"]),
  attemptCount: z.number().int().nonnegative().default(0),
});

export type WebhookReceipt = z.infer<typeof webhookReceiptSchema>;

export function webhookDedupeKey(receipt: Pick<WebhookReceipt, "provider" | "connectionId" | "providerEventId">): string {
  return `${receipt.provider}:${receipt.connectionId}:${receipt.providerEventId}`;
}

export function signWebhookBody(rawBody: string, secret: string, timestamp: number): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyWebhookSignature(options: { rawBody: string; signature: string; secret: string; timestamp: number; now?: number; toleranceSeconds?: number }): boolean {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - options.timestamp) > (options.toleranceSeconds ?? 300)) return false;
  const expected = Buffer.from(signWebhookBody(options.rawBody, options.secret, options.timestamp), "hex");
  const supplied = Buffer.from(options.signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
