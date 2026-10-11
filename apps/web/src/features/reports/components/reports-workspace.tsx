"use client";

import { useQuery } from "@tanstack/react-query";
import { ChartNoAxesCombined } from "lucide-react";
import { Card, CardContent, Empty, Skeleton } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { financeApi } from "@/features/finance/lib/finance-api";
import { agentApi } from "@/features/agents/lib/agent-api";
import { pipelineApi } from "@/features/pipeline/lib/pipeline-api";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

export function ReportsWorkspace() {
  const finance = useQuery({ queryKey: ["reports-finance"], queryFn: () => financeApi.dashboard() });
  const agents = useQuery({ queryKey: ["reports-agents"], queryFn: () => agentApi.list({ limit: 100 }) });
  const pipeline = useQuery({ queryKey: ["reports-pipeline"], queryFn: () => pipelineApi.leads() });

  const loading = finance.isLoading || agents.isLoading || pipeline.isLoading;
  const failed = finance.isError;

  const weekly = (() => {
    if (loading || failed || !finance.data) return null;
    const stats = finance.data.dashboard;
    const leads = pipeline.data?.items ?? [];
    const agentItems = agents.data?.items ?? [];
    const openLeads = leads.filter((lead) => !["won", "lost"].includes(lead.stage)).length;
    const wonLeads = leads.filter((lead) => lead.stage === "won").length;
    const runningAgents = agentItems.filter((agent) => agent.status === "running").length;
    const errorAgents = agentItems.filter((agent) => agent.status === "error").length;
    return [
      `Revenue: ${currency.format(stats.totalRevenue)} settled · ${currency.format(stats.outstanding)} outstanding · MRR ${currency.format(stats.mrr)}.`,
      `Pipeline: ${openLeads} open leads, ${wonLeads} won. Weighted value ${currency.format(stats.mrr)}.`,
      `Agents: ${agentItems.length} configured, ${runningAgents} running, ${errorAgents} in error. AI spend this month: ${currency.format(stats.agentCostThisMonth)}.`,
      `Expenses: ${currency.format(stats.expensesTotal)} total · margin ${stats.profitMargin != null ? `${stats.profitMargin}%` : "not measurable yet"}.`,
      `Clients: ${stats.clientCount} active · ${stats.overdueCount} overdue invoices.`,
    ];
  })();

  return (
    <div className="grid gap-6">
      <header className="border-b border-[#2A2E45] pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-purple-300">/ business reporting</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#F3F5FF] sm:text-3xl">Reports</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#888]">A weekly summary computed live from verified workspace records - revenue, pipeline, agents, and costs. No invented numbers: every metric traces to its source.</p>
      </header>

      {failed ? (
        <Empty title="Report data could not be loaded" description={finance.error ? errorMessage(finance.error, "Retry the request.") : ""} action={undefined} />
      ) : loading ? (
        <div role="status" className="grid gap-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : (
        <>
          <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">MRR</p><p className="mt-1 font-mono text-xl text-[#39FF14]">{currency.format(finance.data?.dashboard.mrr ?? 0)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Settled revenue</p><p className="mt-1 font-mono text-xl text-cyan-200">{currency.format(finance.data?.dashboard.totalRevenue ?? 0)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Expenses</p><p className="mt-1 font-mono text-xl text-orange-300">{currency.format(finance.data?.dashboard.expensesTotal ?? 0)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">AI spend (month)</p><p className="mt-1 font-mono text-xl text-purple-300">{currency.format(finance.data?.dashboard.agentCostThisMonth ?? 0)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Open leads</p><p className="mt-1 font-mono text-xl text-[#F3F5FF]">{(pipeline.data?.items ?? []).filter((lead) => !["won", "lost"].includes(lead.stage)).length}</p></CardContent></Card>
          </section>

          <section aria-labelledby="weekly-summary-heading">
            <div className="flex items-center gap-2">
              <ChartNoAxesCombined className="size-4 text-purple-300" aria-hidden="true" />
              <h2 id="weekly-summary-heading" className="text-sm font-semibold text-[#F3F5FF]">Weekly business summary</h2>
            </div>
            <div className="mt-3 grid gap-2 rounded-xl border border-[#2A2E45] bg-[#0C1020] p-4">
              {weekly?.map((line, index) => (
                <p key={index} className="text-xs leading-6 text-[#C5C8DB]">{line}</p>
              ))}
              <p className="mt-2 border-t border-[#2A2E45] pt-2 text-[10px] text-[#666]">
                Generated {finance.data ? new Date(finance.data.dashboard.generatedAt).toUTCString() : ""} from live workspace records. Scheduling, PDF/CSV export, and the Weekly Reporter agent build on this verified metrics layer.
              </p>
            </div>
          </section>

          <section aria-labelledby="profitability-heading">
            <h2 id="profitability-heading" className="text-sm font-semibold text-[#F3F5FF]">Client profitability</h2>
            <ul className="mt-3 grid gap-2">
              {(finance.data?.profitability ?? []).map((entry) => (
                <li key={entry.clientId} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3 text-xs">
                  <span className="truncate text-[#F3F5FF]">{entry.clientName}</span>
                  <span className="font-mono text-cyan-200">{currency.format(entry.revenue)}</span>
                  <span className="font-mono text-orange-300">{currency.format(entry.expenses)}</span>
                  <span className={`font-mono ${entry.profit >= 0 ? "text-[#39FF14]" : "text-[#FF4D6D]"}`}>{currency.format(entry.profit)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
