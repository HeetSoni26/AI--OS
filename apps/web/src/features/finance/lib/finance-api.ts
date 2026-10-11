import { apiFetch } from "@/lib/api-client";

export type InvoiceItemDto = {
  id: string;
  position: number;
  serviceType: string;
  description: string | null;
  quantity: number;
  rate: number;
  amount: number;
};

export type InvoiceDto = {
  id: string;
  clientId: string;
  clientName: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  dueDate: string | null;
  paymentTerms: string | null;
  notes: string | null;
  paidAt: string | null;
  sentAt: string | null;
  items: InvoiceItemDto[];
  payments: Array<{ id: string; status: string; amount: number; paidAt: string | null }>;
  paidTotal: number;
  createdAt: string | null;
};

export type ExpenseDto = {
  id: string;
  clientId: string | null;
  clientName: string | null;
  category: string;
  vendor: string | null;
  amount: number;
  currency: string;
  expenseDate: string | null;
  notes: string | null;
  isAutomatic: boolean;
  createdAt: string | null;
};

export type DashboardDto = {
  mrr: number;
  totalRevenue: number;
  expensesTotal: number;
  profitMargin: number | null;
  outstanding: number;
  overdueCount: number;
  clientCount: number;
  agentCostThisMonth: number;
  currency: string;
  generatedAt: string;
};

export type ProfitabilityDto = Array<{ clientId: string; clientName: string; revenue: number; expenses: number; profit: number }>;

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});

const data = <T>(path: string, init?: RequestInit) => apiFetch<T>(path, init).then((response) => response.data);

export const financeApi = {
  dashboard: () => data<{ dashboard: DashboardDto; profitability: ProfitabilityDto }>("/api/v1/finance/dashboard"),
  invoices: (query: { clientId?: string; statuses?: string[] } = {}) => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (query.clientId) params.set("clientId", query.clientId);
    for (const status of query.statuses ?? []) params.append("statuses", status);
    return data<{ items: InvoiceDto[]; total: number }>(`/api/v1/finance/invoices?${params.toString()}`);
  },
  createInvoice: (input: {
    clientId: string;
    type: string;
    currency: string;
    dueDate: string;
    paymentTerms?: string | null;
    notes?: string | null;
    lineItems: Array<{ serviceType: string; description?: string | null; quantity: number; rate: number }>;
  }) => data<InvoiceDto>("/api/v1/finance/invoices", json("POST", input)),
  invoiceAction: (invoiceId: string, action: { action: "status"; status: string } | { action: "record_payment"; amount: number }) =>
    data<InvoiceDto>(`/api/v1/finance/invoices/${invoiceId}`, json("POST", action)),
  expenses: () => data<{ items: ExpenseDto[] }>("/api/v1/finance/expenses"),
  createExpense: (input: {
    clientId?: string | null;
    category: string;
    vendor?: string | null;
    amount: number;
    currency: string;
    expenseDate: string;
    notes?: string | null;
  }) => data<ExpenseDto>("/api/v1/finance/expenses", json("POST", input)),
};
