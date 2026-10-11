import { z } from "zod";
import { cursorSchema, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./api";
import { invoiceStatusSchema } from "./clients";

export const expenseCategories = ["api_cost", "tool_subscription", "hosting", "domain", "contractor", "other"] as const;
export const expenseCategorySchema = z.enum(expenseCategories);
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;
export const EXPENSE_CATEGORY_LABELS = {
  api_cost: "API Cost",
  tool_subscription: "Tool Subscription",
  hosting: "Hosting",
  domain: "Domain",
  contractor: "Contractor",
  other: "Other",
} as const satisfies Record<ExpenseCategory, string>;

export const invoiceLineItemInputSchema = z.strictObject({
  serviceType: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1_000).nullable().optional(),
  quantity: z.number().min(0).max(999_999),
  rate: z.number().min(0).max(999_999),
});
export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemInputSchema>;

export const invoiceCreateSchema = z.strictObject({
  clientId: z.uuid(),
  type: z.enum(["one_time", "recurring", "usage"]).default("one_time"),
  currency: z.string().trim().length(3).default("USD"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentTerms: z.string().trim().max(255).nullable().optional(),
  notes: z.string().trim().max(2_000).nullable().optional(),
  lineItems: z.array(invoiceLineItemInputSchema).min(1).max(50),
}).refine((data) => data.lineItems.every((item) => item.quantity > 0 || item.rate > 0), "Line items need a quantity or rate.");
export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;

export const invoiceStatusUpdateSchema = z.strictObject({
  status: invoiceStatusSchema,
  note: z.string().trim().max(500).nullable().optional(),
});
export type InvoiceStatusUpdateInput = z.infer<typeof invoiceStatusUpdateSchema>;

export const paymentRecordSchema = z.strictObject({
  amount: z.number().positive().max(999_999_999),
  paidAt: z.string().datetime({ offset: true }).optional(),
});
export type PaymentRecordInput = z.infer<typeof paymentRecordSchema>;

export const expenseCreateSchema = z.strictObject({
  clientId: z.uuid().nullable().optional(),
  category: expenseCategorySchema,
  vendor: z.string().trim().max(255).nullable().optional(),
  amount: z.number().positive().max(999_999_999),
  currency: z.string().trim().length(3).default("USD"),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(2_000).nullable().optional(),
});
export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;

export const invoiceListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  clientId: z.uuid().optional(),
  statuses: z.array(invoiceStatusSchema).optional(),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const financeDashboardSchema = z.strictObject({
  mrr: z.number().nonnegative(),
  totalRevenue: z.number().nonnegative(),
  expensesTotal: z.number().nonnegative(),
  profitMargin: z.number().min(-100).max(100).nullable(),
  outstanding: z.number().nonnegative(),
  overdueCount: z.number().int().nonnegative(),
  clientCount: z.number().int().nonnegative(),
  currency: z.string(),
  generatedAt: z.string().datetime({ offset: true }),
});
export type FinanceDashboard = z.infer<typeof financeDashboardSchema>;

export const clientProfitabilitySchema = z.array(z.strictObject({
  clientId: z.uuid(),
  clientName: z.string(),
  revenue: z.number(),
  expenses: z.number(),
  profit: z.number(),
}));
export type ClientProfitability = z.infer<typeof clientProfitabilitySchema>;
