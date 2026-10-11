import { z } from "zod";

export const outboxEventSchema = z.object({
  id: z.uuid(),
  aggregateType: z.string().min(1),
  aggregateId: z.uuid(),
  eventType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  correlationId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  idempotencyKey: z.string().min(8).max(255),
  occurredAt: z.string().datetime(),
});

export type OutboxEvent = z.infer<typeof outboxEventSchema>;

export interface TransactionContext {
  insertBusinessMutation<T>(operation: () => Promise<T>): Promise<T>;
  insertOutbox(event: OutboxEvent): Promise<void>;
}

export async function mutateWithOutbox<T>(transaction: TransactionContext, operation: () => Promise<T>, event: OutboxEvent): Promise<T> {
  const result = await transaction.insertBusinessMutation(operation);
  await transaction.insertOutbox(outboxEventSchema.parse(event));
  return result;
}

export type OutboxDeliveryState = "pending" | "processing" | "published" | "failed" | "dead_letter";
