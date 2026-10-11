import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/client/client";
import {
  ExpenseCategory,
  InvoiceStatus,
  InvoiceType,
  NotificationPriority,
  NotificationType,
  PaymentStatus,
} from "../generated/client/enums";
import { appendMutationRecords, requireActiveOwnerInTransaction } from "../clients/internal";
import { recordNotification } from "../knowledge/service";
import type { OwnerIdentity } from "../clients/types";
import {
  type ExpenseCreateInput,
  type InvoiceCreateInput,
  type InvoiceListQuery,
  type InvoiceStatusUpdateInput,
  type PaymentRecordInput,
} from "@aios/contracts";

export type { ExpenseCreateInput, InvoiceCreateInput, InvoiceListQuery, InvoiceStatusUpdateInput, PaymentRecordInput };

export type FinanceOperationsErrorCode =
  | "INVALID_IDENTITY" | "NOT_FOUND" | "INVALID_INPUT" | "CONFLICT" | "STATE_INVALID";

export class FinanceOperationsError extends Error {
  constructor(public readonly code: FinanceOperationsErrorCode, message: string) {
    super(message);
    this.name = "FinanceOperationsError";
  }
}

/**
 * Deterministic, decimal-safe line-item totals. The server recomputes every
 * amount from quantity × rate so clients can never set arbitrary totals.
 */
export function computeInvoiceTotals(lineItems: ReadonlyArray<{ quantity: number; rate: number }>): number {
  return Math.round(lineItems.reduce((sum, item) => sum + item.quantity * item.rate, 0) * 100) / 100;
}

type Database = import("../generated/client/client").PrismaClient;

export class PrismaFinanceService {
  constructor(private readonly database: Database) {}

  async listInvoices(identity: OwnerIdentity, input: Partial<InvoiceListQuery> = {}) {
    await this.requireActiveOwner(identity);
    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    const where: Prisma.InvoiceWhereInput = { deletedAt: null };
    if (input.clientId) where.clientId = input.clientId;
    const statuses = (input.statuses ?? []).map((status) => status.toUpperCase());
    if (statuses.length) where.status = { in: statuses as InvoiceStatus[] };
    const total = await this.database.invoice.count({ where });
    const rows = await this.database.invoice.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: limit + 1,
      include: {
        client: { select: { name: true } },
        items: { where: { deletedAt: null }, orderBy: { position: "asc" } },
        payments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      },
    });
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    return { items: visible, total, hasMore, nextCursor: hasMore && visible.at(-1) ? visible.at(-1)!.id : null };
  }

  async createInvoice(identity: OwnerIdentity, input: InvoiceCreateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const client = await transaction.client.findFirst({ where: { id: input.clientId, deletedAt: null }, select: { id: true } });
      if (!client) throw new FinanceOperationsError("INVALID_INPUT", "The invoice client does not exist.");
      const amount = computeInvoiceTotals(input.lineItems);
      if (amount <= 0) throw new FinanceOperationsError("INVALID_INPUT", "Invoice total must be greater than zero.");
      const invoice = await transaction.invoice.create({
        data: {
          id: randomUUID(),
          clientId: input.clientId,
          type: input.type.toUpperCase() as InvoiceType,
          status: InvoiceStatus.DRAFT,
          amount,
          currency: input.currency.toUpperCase(),
          dueDate: new Date(`${input.dueDate}T00:00:00.000Z`),
          paymentTerms: input.paymentTerms ?? null,
          notes: input.notes ?? null,
          lineItems: input.lineItems as unknown as Prisma.InputJsonValue,
        },
      });
      let position = 0;
      for (const item of input.lineItems) {
        await transaction.invoiceLineItem.create({
          data: {
            invoiceId: invoice.id,
            position: position += 1,
            serviceType: item.serviceType,
            description: item.description ?? null,
            quantity: item.quantity,
            rate: item.rate,
            amount: Math.round(item.quantity * item.rate * 100) / 100,
          },
        });
      }
      await appendMutationRecords(transaction, identity, [{
        entityType: "invoice",
        entityId: invoice.id,
        action: "create",
        eventType: "finance.invoice_created",
        payload: { clientId: input.clientId, amount, currency: invoice.currency },
        changedFields: ["amount", "lineItems"],
      }]);
      return invoice;
    });
  }

  async updateInvoiceStatus(identity: OwnerIdentity, invoiceId: string, input: InvoiceStatusUpdateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const invoice = await transaction.invoice.findFirst({ where: { id: invoiceId, deletedAt: null } });
      if (!invoice) throw new FinanceOperationsError("NOT_FOUND", "Invoice not found.");
      const status = input.status.toUpperCase() as InvoiceStatus;
      const data: Prisma.InvoiceUpdateInput = { status };
      if (status === InvoiceStatus.SENT) data.sentAt = new Date();
      if (status === InvoiceStatus.PAID) data.paidAt = new Date();
      if (status === InvoiceStatus.DRAFT) {
        data.sentAt = null;
        data.paidAt = null;
      }
      const updated = await transaction.invoice.update({ where: { id: invoiceId }, data });
      await appendMutationRecords(transaction, identity, [{
        entityType: "invoice",
        entityId: invoiceId,
        action: "status",
        eventType: "finance.invoice_status",
        payload: { from: invoice.status, to: status, note: input.note ?? null },
      }]);
      if (status === InvoiceStatus.OVERDUE) {
        await recordNotification(transaction, {
          type: NotificationType.INVOICE_OVERDUE,
          priority: NotificationPriority.HIGH,
          title: `Invoice overdue: ${invoice.amount} ${invoice.currency} (client ${invoice.clientId.slice(0, 8)})`,
          body: input.note ?? null,
          entityType: "invoice",
          entityId: invoiceId,
          dedupeKey: `invoice_overdue:${invoiceId}`,
        });
      }
      return updated;
    });
  }

  /** Records a settled payment against an invoice and closes it when fully paid. */
  async recordPayment(identity: OwnerIdentity, invoiceId: string, input: PaymentRecordInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const invoice = await transaction.invoice.findFirst({ where: { id: invoiceId, deletedAt: null } });
      if (!invoice) throw new FinanceOperationsError("NOT_FOUND", "Invoice not found.");
      if (invoice.status === InvoiceStatus.PAID) throw new FinanceOperationsError("STATE_INVALID", "The invoice is already fully paid.");
      if (invoice.status === InvoiceStatus.CANCELLED) throw new FinanceOperationsError("STATE_INVALID", "Cancelled invoices cannot receive payments.");
      const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
      const payment = await transaction.payment.create({
        data: {
          id: randomUUID(),
          invoiceId,
          clientId: invoice.clientId,
          status: PaymentStatus.SUCCEEDED,
          amount: input.amount,
          currency: invoice.currency,
          paidAt,
        },
      });
      const paidSoFar = await transaction.payment.aggregate({
        where: { invoiceId, status: PaymentStatus.SUCCEEDED, deletedAt: null },
        _sum: { amount: true },
      });
      const paidTotal = Number(paidSoFar._sum.amount ?? 0);
      if (paidTotal >= Number(invoice.amount)) {
        await transaction.invoice.update({ where: { id: invoiceId }, data: { status: InvoiceStatus.PAID, paidAt } });
      }
      await appendMutationRecords(transaction, identity, [{
        entityType: "payment",
        entityId: payment.id,
        action: "record",
        eventType: "finance.payment_recorded",
        payload: { invoiceId, amount: input.amount },
      }]);
      return payment;
    });
  }

  async listExpenses(identity: OwnerIdentity) {
    await this.requireActiveOwner(identity);
    return this.database.expense.findMany({
      where: { deletedAt: null },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { client: { select: { name: true } } },
    });
  }

  async createExpense(identity: OwnerIdentity, input: ExpenseCreateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const expense = await transaction.expense.create({
        data: {
          id: randomUUID(),
          clientId: input.clientId ?? null,
          category: input.category.toUpperCase() as ExpenseCategory,
          vendor: input.vendor ?? null,
          amount: input.amount,
          currency: input.currency.toUpperCase(),
          expenseDate: new Date(`${input.expenseDate}T00:00:00.000Z`),
          notes: input.notes ?? null,
        },
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "expense",
        entityId: expense.id,
        action: "create",
        eventType: "finance.expense_created",
        payload: { category: expense.category, amount: expense.amount, currency: expense.currency },
        changedFields: ["amount", "category"],
      }]);
      return expense;
    });
  }

  /** Deterministic dashboard metrics reproducible from source records. */
  async getDashboard(identity: OwnerIdentity) {
    await this.requireActiveOwner(identity);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [paidSum, recurringClients, sentInvoices, expensesSum, overdueCount, clientCount, agentCosts] = await Promise.all([
      this.database.payment.aggregate({
        where: { status: PaymentStatus.SUCCEEDED, deletedAt: null },
        _sum: { amount: true },
      }),
      this.database.client.findMany({
        where: { deletedAt: null, status: "ACTIVE" },
        select: { mrr: true },
      }),
      this.database.invoice.aggregate({
        where: { status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] }, deletedAt: null },
        _sum: { amount: true },
      }),
      this.database.expense.aggregate({
        where: { deletedAt: null },
        _sum: { amount: true },
      }),
      this.database.invoice.count({
        where: { status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] }, dueDate: { lt: now }, deletedAt: null },
      }),
      this.database.client.count({ where: { deletedAt: null } }),
      this.database.costLedgerEntry.aggregate({
        where: { entryType: "EXPENSE", category: "ai_usage", deletedAt: null, occurredAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);

    const totalRevenue = Number(paidSum._sum.amount ?? 0);
    const mrr = recurringClients.reduce((sum, client) => sum + Number(client.mrr), 0);
    const expensesTotal = Number(expensesSum._sum.amount ?? 0);
    const profitMargin = totalRevenue > 0
      ? Math.round(((totalRevenue - expensesTotal) / totalRevenue) * 10_000) / 100
      : null;
    return {
      mrr,
      totalRevenue,
      expensesTotal,
      profitMargin,
      outstanding: Number(sentInvoices._sum.amount ?? 0),
      overdueCount,
      clientCount,
      agentCostThisMonth: Number(agentCosts._sum.amount ?? 0),
      currency: "USD",
      generatedAt: now.toISOString(),
    };
  }

  /** Client profitability: settled revenue minus attributable expenses per client. */
  async getClientProfitability(identity: OwnerIdentity) {
    await this.requireActiveOwner(identity);
    const clients = await this.database.client.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        payments: { where: { status: PaymentStatus.SUCCEEDED, deletedAt: null }, select: { amount: true } },
        expenses: { where: { deletedAt: null }, select: { amount: true } },
      },
      orderBy: { name: "asc" },
    });
    return clients.map((client) => {
      const revenue = client.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const expenses = client.expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
      return {
        clientId: client.id,
        clientName: client.name,
        revenue,
        expenses,
        profit: Math.round((revenue - expenses) * 100) / 100,
      };
    });
  }

  private async requireActiveOwner(identity: OwnerIdentity): Promise<void> {
    const owner = await this.database.ownerAccount.findFirst({ where: { authSubject: identity.ownerSubject, active: true }, select: { id: true } });
    if (!owner) throw new FinanceOperationsError("INVALID_IDENTITY", "The authenticated owner is not active.");
  }
}
