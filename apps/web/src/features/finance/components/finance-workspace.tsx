"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EXPENSE_CATEGORY_LABELS,
  INVOICE_STATUS_LABELS,
  expenseCategories,
  type ExpenseCategory,
  type InvoiceStatus,
} from "@aios/contracts";
import { BadgeDollarSign, Plus, Receipt } from "lucide-react";
import { Button, Card, CardContent, Dialog, Drawer, Empty, Input, Select, Skeleton, Tab, TabPanel, Tabs, TabsList, Textarea, useAnnounce } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { clientApi } from "@/features/clients/lib/client-api";
import { financeApi, type InvoiceDto } from "../lib/finance-api";

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const currencyPrecise = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-300",
  sent: "bg-cyan-300",
  paid: "bg-[#39FF14]",
  overdue: "bg-[#FF4D6D]",
  cancelled: "bg-[#666]",
};

export function FinanceWorkspace() {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const dashboard = useQuery({ queryKey: ["finance-dashboard"], queryFn: () => financeApi.dashboard() });
  const invoices = useQuery({ queryKey: ["finance-invoices"], queryFn: () => financeApi.invoices() });
  const expenses = useQuery({ queryKey: ["finance-expenses"], queryFn: () => financeApi.expenses() });
  const clients = useQuery({
    queryKey: ["finance-clients"],
    queryFn: () => clientApi.list({ limit: 100, archiveScope: "active", sort: "name", direction: "asc", view: "list" }),
    staleTime: 60_000,
  });

  const invalidate = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["finance-dashboard"] }),
      cache.invalidateQueries({ queryKey: ["finance-invoices"] }),
      cache.invalidateQueries({ queryKey: ["finance-expenses"] }),
    ]);
  };

  const createInvoice = useMutation({
    mutationFn: (input: Parameters<typeof financeApi.createInvoice>[0]) => financeApi.createInvoice(input),
    onSuccess: async (invoice) => {
      setInvoiceOpen(false);
      setFeedback(`Invoice for ${invoice.clientName} created as a draft (${currencyPrecise.format(invoice.amount)}). Send it from the invoice list.`);
      announce("Invoice created.");
      await invalidate();
    },
    onError: (caught) => setError(errorMessage(caught, "The invoice could not be created.")),
  });

  const createExpense = useMutation({
    mutationFn: (input: Parameters<typeof financeApi.createExpense>[0]) => financeApi.createExpense(input),
    onSuccess: async () => {
      setExpenseOpen(false);
      setFeedback("Expense recorded.");
      await invalidate();
    },
    onError: (caught) => setError(errorMessage(caught, "The expense could not be recorded.")),
  });

  const selected = useMemo(
    () => invoices.data?.items.find((invoice) => invoice.id === selectedId) ?? null,
    [invoices.data, selectedId],
  );

  const stats = dashboard.data?.dashboard;
  const profitability = dashboard.data?.profitability ?? [];

  return (
    <div className="grid gap-6">
      <header className="flex flex-col justify-between gap-4 border-b border-[#2A2E45] pb-6 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-purple-300">/ financial operations</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#F3F5FF] sm:text-3xl">Finance</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#888]">Invoices with server-verified totals, settled payments, expenses, and reproducible profitability - every number traces back to source records.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setExpenseOpen(true)}><Receipt className="size-4" aria-hidden="true" />Add expense</Button>
          <Button onClick={() => setInvoiceOpen(true)}><Plus className="size-4" aria-hidden="true" />New invoice</Button>
        </div>
      </header>

      {feedback ? <p role="status" className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3 text-xs text-cyan-100">{feedback}</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-4 py-3 text-xs text-red-200">{error}</p> : null}

      <section aria-label="Finance summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">MRR</p><p className="mt-1 font-mono text-xl text-[#39FF14]">{stats ? currency.format(stats.mrr) : "…"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Revenue (settled)</p><p className="mt-1 font-mono text-xl text-cyan-200">{stats ? currency.format(stats.totalRevenue) : "…"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Outstanding</p><p className="mt-1 font-mono text-xl text-amber-200">{stats ? currency.format(stats.outstanding) : "…"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Overdue</p><p className={`mt-1 font-mono text-xl ${stats && stats.overdueCount > 0 ? "text-[#FF4D6D]" : "text-[#F3F5FF]"}`}>{stats ? stats.overdueCount : "…"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Expenses</p><p className="mt-1 font-mono text-xl text-orange-300">{stats ? currency.format(stats.expensesTotal) : "…"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Margin</p><p className="mt-1 font-mono text-xl text-purple-300">{stats ? (stats.profitMargin != null ? `${stats.profitMargin}%` : "-") : "…"}</p></CardContent></Card>
      </section>

      <Tabs defaultValue="invoices">
        <TabsList className="surface-scrollbar mb-4 flex gap-1 overflow-x-auto border-b border-[#2A2E45]">
          <Tab value="invoices">Invoices ({invoices.data?.items.length ?? 0})</Tab>
          <Tab value="expenses">Expenses ({expenses.data?.items.length ?? 0})</Tab>
          <Tab value="profitability">Client profitability</Tab>
        </TabsList>

        <TabPanel value="invoices">
          {invoices.isLoading ? (
            <div role="status" className="grid gap-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
          ) : !invoices.data?.items.length ? (
            <Empty
              title="No invoices yet"
              description="Create an invoice with line items - totals are computed server-side, and payments close it automatically."
              action={<Button onClick={() => setInvoiceOpen(true)}><Plus className="size-4" aria-hidden="true" />New invoice</Button>}
              icon={<BadgeDollarSign className="size-5 text-purple-300" aria-hidden="true" />}
            />
          ) : (
            <ul className="grid gap-2" aria-label="Invoices" data-testid="invoice-list">
              {invoices.data.items.map((invoice) => {
                const overdue = invoice.status === "sent" && invoice.dueDate && new Date(invoice.dueDate) < new Date();
                return (
                  <li key={invoice.id}>
                    <button type="button" className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60" onClick={() => setSelectedId(invoice.id)} aria-label={`Open invoice for ${invoice.clientName}`}>
                      <Card className="transition-colors hover:border-purple-300/40">
                        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                          <div>
                            <p className="text-sm font-medium text-[#F3F5FF]">{invoice.clientName}</p>
                            <p className="mt-0.5 text-[10px] text-[#888]">Due {invoice.dueDate ? date.format(new Date(invoice.dueDate)) : "-"} · {invoice.items.length} item{invoice.items.length === 1 ? "" : "s"}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm text-cyan-200">{currencyPrecise.format(invoice.amount)}</span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2A2E45] bg-[#0C1020] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                              <span className={`size-1.5 rounded-full ${STATUS_COLORS[overdue ? "overdue" : invoice.status] ?? "bg-[#888]"}`} aria-hidden="true" />
                              <span className={overdue ? "text-[#FF4D6D]" : "text-[#C5C8DB]"}>{overdue ? "Overdue" : INVOICE_STATUS_LABELS[invoice.status as InvoiceStatus] ?? invoice.status}</span>
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </TabPanel>

        <TabPanel value="expenses">
          {expenses.isLoading ? (
            <div role="status" className="grid gap-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          ) : !expenses.data?.items.length ? (
            <Empty title="No expenses yet" description="Track API, tools, hosting, and contractor costs - agent run costs are already written to the ledger automatically." icon={<Receipt className="size-5 text-purple-300" aria-hidden="true" />} />
          ) : (
            <ul className="grid gap-2" aria-label="Expenses">
              {expenses.data.items.map((expense) => (
                <li key={expense.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3">
                  <div>
                    <p className="text-xs text-[#F3F5FF]">{EXPENSE_CATEGORY_LABELS[expense.category as ExpenseCategory] ?? expense.category}{expense.vendor ? ` · ${expense.vendor}` : ""}{expense.clientName ? ` · ${expense.clientName}` : ""}</p>
                    <p className="mt-0.5 text-[10px] text-[#888]">{expense.expenseDate ? date.format(new Date(expense.expenseDate)) : ""}{expense.isAutomatic ? " · automatic" : ""}</p>
                  </div>
                  <span className="font-mono text-xs text-orange-300">{currencyPrecise.format(expense.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </TabPanel>

        <TabPanel value="profitability">
          {!profitability.length ? (
            <Empty title="No clients yet" description="Client profitability appears once clients have settled payments or attributable expenses." />
          ) : (
            <ul className="grid gap-2" aria-label="Client profitability">
              {profitability.map((entry) => (
                <li key={entry.clientId} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3 text-xs">
                  <span className="truncate text-[#F3F5FF]">{entry.clientName}</span>
                  <span className="font-mono text-cyan-200">{currency.format(entry.revenue)}</span>
                  <span className="font-mono text-orange-300">{currency.format(entry.expenses)}</span>
                  <span className={`font-mono ${entry.profit >= 0 ? "text-[#39FF14]" : "text-[#FF4D6D]"}`}>{currency.format(entry.profit)}</span>
                </li>
              ))}
            </ul>
          )}
        </TabPanel>
      </Tabs>

      <Dialog open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="New invoice" description="Line-item totals are verified server-side.">
        <InvoiceForm
          clients={(clients.data?.items ?? []).map((client) => ({ id: client.id, name: client.name }))}
          pending={createInvoice.isPending}
          error={createInvoice.error ? errorMessage(createInvoice.error, "The invoice could not be saved.") : undefined}
          onCancel={() => setInvoiceOpen(false)}
          onSubmit={(input) => createInvoice.mutate(input)}
        />
      </Dialog>

      <Dialog open={expenseOpen} onClose={() => setExpenseOpen(false)} title="Add expense" description="Manual costs; agent run costs are recorded automatically.">
        <ExpenseForm
          clients={(clients.data?.items ?? []).map((client) => ({ id: client.id, name: client.name }))}
          pending={createExpense.isPending}
          onCancel={() => setExpenseOpen(false)}
          onSubmit={(input) => createExpense.mutate(input)}
        />
      </Dialog>

      <Drawer open={Boolean(selectedId)} onClose={() => setSelectedId(null)} title="Invoice" description="Line items, payments, and lifecycle actions.">
        {selected ? <InvoiceDetail invoice={selected} onFeedback={setFeedback} onError={setError} onRefresh={invalidate} /> : null}
      </Drawer>
    </div>
  );
}

function InvoiceForm({
  clients,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  clients: ReadonlyArray<{ id: string; name: string }>;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (input: Parameters<typeof financeApi.createInvoice>[0]) => void;
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().slice(0, 10);
  });
  const [type, setType] = useState("one_time");
  const [serviceType, setServiceType] = useState("Automation retainer");
  const [quantity, setQuantity] = useState("1");
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const total = (Number(quantity) || 0) * (Number(rate) || 0);

  return (
    <form className="grid gap-4" onSubmit={(event) => {
      event.preventDefault();
      if (!clientId || !(total > 0)) return;
      onSubmit({
        clientId,
        type,
        currency: "USD",
        dueDate,
        notes: notes.trim() || null,
        lineItems: [{ serviceType: serviceType.trim() || "Service", quantity: Number(quantity), rate: Number(rate) }],
      });
    }}>
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="invoice-client">Client
          <Select id="invoice-client" value={clientId} onChange={(event) => setClientId(event.target.value)} required>
            <option value="">Choose a client…</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </Select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="invoice-type">Type
          <Select id="invoice-type" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="one_time">One-time</option>
            <option value="recurring">Recurring</option>
            <option value="usage">Usage</option>
          </Select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB] sm:col-span-1" htmlFor="invoice-service">Service
          <Input id="invoice-service" value={serviceType} onChange={(event) => setServiceType(event.target.value)} maxLength={150} />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="invoice-quantity">Quantity
          <Input id="invoice-quantity" type="number" min={0} step="0.25" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="invoice-rate">Rate (USD)
          <Input id="invoice-rate" type="number" min={0} step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="invoice-due">Due date
          <Input id="invoice-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
        </label>
        <div className="flex items-end">
          <p className="text-xs text-[#888]">Total: <span className="font-mono text-cyan-200">{currencyPrecise.format(total)}</span> <span className="text-[10px] text-[#666]">(verified server-side)</span></p>
        </div>
      </div>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="invoice-notes">Notes
        <Textarea id="invoice-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
      </label>
      <div className="sticky bottom-0 -mx-6 mt-1 flex items-center justify-end gap-2 border-t border-[#2A2E45] bg-[#0C1020] px-6 pt-3 pb-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending || !clientId || !(total > 0)}>Create draft</Button>
      </div>
    </form>
  );
}

function ExpenseForm({
  clients,
  pending,
  onCancel,
  onSubmit,
}: {
  clients: ReadonlyArray<{ id: string; name: string }>;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: Parameters<typeof financeApi.createExpense>[0]) => void;
}) {
  const [category, setCategory] = useState<string>("api_cost");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [clientId, setClientId] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <form className="grid gap-4" onSubmit={(event) => {
      event.preventDefault();
      if (!(Number(amount) > 0)) return;
      onSubmit({
        category,
        vendor: vendor.trim() || null,
        amount: Number(amount),
        currency: "USD",
        expenseDate,
        clientId: clientId || null,
        notes: notes.trim() || null,
      });
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="expense-category">Category
          <Select id="expense-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {expenseCategories.map((entry) => <option key={entry} value={entry}>{EXPENSE_CATEGORY_LABELS[entry as ExpenseCategory]}</option>)}
          </Select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="expense-vendor">Vendor
          <Input id="expense-vendor" value={vendor} onChange={(event) => setVendor(event.target.value)} maxLength={255} placeholder="OpenAI, Vercel, …" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="expense-amount">Amount (USD)
          <Input id="expense-amount" type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="expense-date">Date
          <Input id="expense-date" type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="expense-client">Client <span className="text-[#666]">(optional)</span>
          <Select id="expense-client" value={clientId} onChange={(event) => setClientId(event.target.value)}>
            <option value="">Unattributed</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </Select>
        </label>
      </div>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="expense-notes">Notes
        <Textarea id="expense-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} />
      </label>
      <div className="sticky bottom-0 -mx-6 mt-1 flex items-center justify-end gap-2 border-t border-[#2A2E45] bg-[#0C1020] px-6 pt-3 pb-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending || !(Number(amount) > 0)}>Save expense</Button>
      </div>
    </form>
  );
}

function InvoiceDetail({
  invoice,
  onFeedback,
  onError,
  onRefresh,
}: {
  invoice: InvoiceDto;
  onFeedback: (message: string) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const act = async (input: Parameters<typeof financeApi.invoiceAction>[1], message: string) => {
    try {
      await financeApi.invoiceAction(invoice.id, input);
      onFeedback(message);
      await onRefresh();
    } catch (caught) {
      onError(errorMessage(caught, "The action failed."));
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#F3F5FF]">{invoice.clientName}</h2>
          <p className="mt-1 text-xs text-[#888]">{currencyPrecise.format(invoice.amount)} · due {invoice.dueDate ? date.format(new Date(invoice.dueDate)) : "-"} · {invoice.type.replaceAll("_", " ")}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {invoice.status === "draft" ? (
            <Button size="sm" onClick={() => act({ action: "status", status: "sent" }, "Invoice marked as sent.")}>Mark sent</Button>
          ) : null}
          {invoice.status === "sent" ? (
            <>
              <Button size="sm" onClick={() => act({ action: "status", status: "overdue" }, "Invoice flagged as overdue.")}>Flag overdue</Button>
              <Button size="sm" onClick={() => act({ action: "status", status: "cancelled" }, "Invoice cancelled.")} variant="ghost">Cancel</Button>
            </>
          ) : null}
          {invoice.status !== "paid" && invoice.status !== "cancelled" ? (
            <form className="flex items-center gap-1.5" onSubmit={(event) => {
              event.preventDefault();
              const value = Number(amount);
              if (!(value > 0)) return;
              setAmount("");
              void act({ action: "record_payment", amount: value }, `Payment of ${currencyPrecise.format(value)} recorded.`);
            }}>
              <Input type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Payment" aria-label="Payment amount" className="w-28" />
              <Button size="sm" type="submit">Record payment</Button>
            </form>
          ) : null}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#C5C8DB]">Line items</h3>
        <ul className="mt-2 grid gap-1.5">
          {invoice.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#2A2E45] px-3 py-2 text-xs">
              <span className="text-[#C5C8DB]">{item.serviceType}{item.description ? ` - ${item.description}` : ""}</span>
              <span className="font-mono text-[#888]">{item.quantity} × {currencyPrecise.format(item.rate)} = <span className="text-cyan-200">{currencyPrecise.format(item.amount)}</span></span>
            </li>
          ))}
        </ul>
      </div>

      {invoice.payments.length ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#C5C8DB]">Payments ({currencyPrecise.format(invoice.paidTotal)} of {currencyPrecise.format(invoice.amount)})</h3>
          <ul className="mt-2 grid gap-1.5">
            {invoice.payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#39FF14]/20 bg-[#39FF14]/[0.04] px-3 py-2 text-xs">
                <span className="text-[#39FF14]">{payment.status}</span>
                <span className="font-mono text-[#C5C8DB]">{currencyPrecise.format(payment.amount)} · {payment.paidAt ? date.format(new Date(payment.paidAt)) : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
