import "server-only";

import { FinanceOperationsError, PrismaFinanceService, type PrismaClient } from "@aios/data";
import { ApiRequestError } from "./errors";
import { apiEnum, apiIso, apiNumber } from "./domain-service";

export function mapFinanceError(error: unknown): unknown {
  if (error instanceof FinanceOperationsError) {
    const statusByCode: Record<string, number> = {
      INVALID_IDENTITY: 403,
      NOT_FOUND: 404,
      INVALID_INPUT: 422,
      CONFLICT: 409,
      STATE_INVALID: 409,
    };
    return new ApiRequestError(error.code, error.message, { status: statusByCode[error.code] ?? 400, cause: error });
  }
  return error;
}

export function financeServiceFactory(database: PrismaClient) {
  return new PrismaFinanceService(database);
}

type EntityRecord = Record<string, unknown>;

export function mapInvoice(row: EntityRecord) {
  const items = (Array.isArray(row.items) ? row.items : []) as EntityRecord[];
  const payments = (Array.isArray(row.payments) ? row.payments : []) as EntityRecord[];
  return {
    id: row.id as string,
    clientId: row.clientId as string,
    clientName: (row.client as EntityRecord).name as string,
    stripeInvoiceId: row.stripeInvoiceId as string | null,
    type: apiEnum(row.type),
    status: apiEnum(row.status),
    amount: apiNumber(row.amount as never),
    currency: row.currency as string,
    dueDate: apiIso(row.dueDate as Date | null)?.slice(0, 10) ?? null,
    paymentTerms: row.paymentTerms as string | null,
    notes: row.notes as string | null,
    paidAt: apiIso(row.paidAt as Date | null),
    sentAt: apiIso(row.sentAt as Date | null),
    items: items.map((item) => ({
      id: item.id as string,
      position: item.position as number,
      serviceType: item.serviceType as string,
      description: item.description as string | null,
      quantity: apiNumber(item.quantity as never),
      rate: apiNumber(item.rate as never),
      amount: apiNumber(item.amount as never),
    })),
    payments: payments.map((payment) => ({
      id: payment.id as string,
      status: apiEnum(payment.status),
      amount: apiNumber(payment.amount as never),
      paidAt: apiIso(payment.paidAt as Date | null),
    })),
    paidTotal: payments
      .filter((payment) => payment.status === "SUCCEEDED")
      .reduce((sum, payment) => sum + apiNumber(payment.amount as never), 0),
    createdAt: apiIso(row.createdAt as Date | null),
  };
}

export function mapExpense(row: EntityRecord) {
  return {
    id: row.id as string,
    clientId: row.clientId as string | null,
    clientName: row.client ? (row.client as EntityRecord).name as string : null,
    category: apiEnum(row.category),
    vendor: row.vendor as string | null,
    amount: apiNumber(row.amount as never),
    currency: row.currency as string,
    expenseDate: apiIso(row.expenseDate as Date | null)?.slice(0, 10) ?? null,
    notes: row.notes as string | null,
    isAutomatic: row.isAutomatic === true,
    createdAt: apiIso(row.createdAt as Date | null),
  };
}
