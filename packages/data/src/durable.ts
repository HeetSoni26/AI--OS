import type { PrismaClient } from "./generated/client/client";
import { Prisma } from "./generated/client/client";

export interface AuditRecordInput {
  actorSubject: string;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string;
  correlationId: string;
  changeSummary?: Record<string, unknown>;
  ipHash?: string;
}

export interface OutboxRecordInput {
  id?: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  correlationId: string;
  idempotencyKey: string;
  occurredAt: Date;
}

export interface AuditOutboxRecordsInput {
  audit: AuditRecordInput | readonly AuditRecordInput[];
  outbox: OutboxRecordInput | readonly OutboxRecordInput[];
}

function asArray<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? value : [value as T];
}

/** Appends durable records to an existing transaction without starting a nested transaction. */
export async function appendAuditOutboxRecords(
  transaction: Prisma.TransactionClient,
  input: AuditOutboxRecordsInput,
): Promise<void> {
  for (const audit of asArray(input.audit)) {
    await transaction.auditEvent.create({
      data: {
        ...audit,
        changeSummary: audit.changeSummary as Prisma.InputJsonValue | undefined,
      },
    });
  }
  for (const outbox of asArray(input.outbox)) {
    await transaction.outboxEvent.create({
      data: {
        ...outbox,
        payload: outbox.payload as Prisma.InputJsonValue,
      },
    });
  }
}

export async function runAuditedOutboxMutation<T>(
  client: PrismaClient,
  input: AuditOutboxRecordsInput,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (transaction) => {
    const result = await operation(transaction);
    await appendAuditOutboxRecords(transaction, input);
    return result;
  });
}
