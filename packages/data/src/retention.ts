import type { PrismaClient } from "./generated/client/client";

/** Removes expired webhook bodies while preserving normalized receipt and hash evidence. */
export async function scrubExpiredWebhookPayloads(client: PrismaClient, now = new Date()): Promise<number> {
  return client.$executeRaw`
    UPDATE public.webhook_receipts
    SET raw_payload = NULL, headers = NULL
    WHERE retention_until <= ${now}
      AND (raw_payload IS NOT NULL OR headers IS NOT NULL)
  `;
}
