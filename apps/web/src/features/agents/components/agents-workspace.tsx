"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AGENT_STATUS_LABELS,
  AGENT_TYPE_LABELS,
  agentStatuses,
  type AgentStatus,
} from "@aios/contracts";
import { Bot, Play, Plus, Search } from "lucide-react";
import { useContextPanel } from "@/components/providers/context-panel-provider";
import { Button, Card, CardContent, Dialog, Drawer, Empty, Input, Skeleton, useAnnounce } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { clientApi } from "@/features/clients/lib/client-api";
import { AgentStatusBadge } from "./agent-status-badge";
import { AgentDetail } from "./agent-detail";
import { AgentForm } from "./agent-form";
import { agentApi, type AgentDetailDto, type AgentUpsertInput } from "../lib/agent-api";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const microCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });

/** Shows extra decimals for tiny per-run costs instead of a misleading "$0.00". */
function costLabel(value: number): string {
  return value > 0 && value < 0.01 ? microCurrency.format(value) : currency.format(value);
}
const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const deltaMs = new Date(iso).getTime() - Date.now();
  const minutes = Math.round(deltaMs / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

export function AgentsWorkspace() {
  const params = useSearchParams();
  const paramsString = params.toString();
  const pathname = usePathname();
  const router = useRouter();
  const cache = useQueryClient();
  const announce = useAnnounce();

  const [searchDraft, setSearchDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(params.get("agent"));
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  const search = params.get("search") ?? "";
  const activeStatus = (params.get("status") as AgentStatus | null) ?? "all";

  useEffect(() => {
    setSelectedId(new URLSearchParams(paramsString).get("agent"));
  }, [paramsString]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchDraft !== search) {
        const next = new URLSearchParams(paramsString);
        if (searchDraft) next.set("search", searchDraft);
        else next.delete("search");
        router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [paramsString, pathname, router, search, searchDraft]);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  const replaceParam = useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(paramsString);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
  }, [paramsString, pathname, router]);

  const agents = useQuery({
    queryKey: ["agents", { search, status: activeStatus }],
    queryFn: () => agentApi.list({ search: search || undefined, statuses: activeStatus !== "all" ? [activeStatus] : undefined, limit: 100 }),
  });
  const anyRunning = agents.data?.items.some((agent) => agent.status === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const timer = window.setInterval(() => {
      void cache.invalidateQueries({ queryKey: ["agents"] });
      void cache.invalidateQueries({ queryKey: ["agent"] });
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [anyRunning, cache]);

  const runtime = useQuery({
    queryKey: ["agent-runtime"],
    queryFn: () => agentApi.runtime(),
    refetchInterval: 15_000,
  });
  const clients = useQuery({
    queryKey: ["agents-clients"],
    queryFn: () => clientApi.list({ limit: 100, archiveScope: "active", sort: "name", direction: "asc", view: "list" }),
    staleTime: 60_000,
  });

  const invalidateAll = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["agents"] }),
      cache.invalidateQueries({ queryKey: ["agent"] }),
      cache.invalidateQueries({ queryKey: ["agent-runtime"] }),
    ]);
  };

  const create = useMutation({
    mutationFn: (input: AgentUpsertInput) => agentApi.create(input),
    onSuccess: async (agent) => {
      setCreateOpen(false);
      setSelectedId(agent.id);
      replaceParam("agent", agent.id);
      setFeedback(`${agent.name} was created. Click Run to dispatch its first execution.`);
      announce(`${agent.name} was created.`);
      await invalidateAll();
    },
  });
  const update = useMutation({
    mutationFn: ({ agentId, input }: { agentId: string; input: AgentUpsertInput }) => agentApi.update(agentId, input),
    onSuccess: async (agent) => {
      setEditId(null);
      setFeedback(`${agent.name} was updated. A new configuration version was recorded.`);
      announce(`${agent.name} was updated.`);
      await invalidateAll();
    },
  });

  const quickRun = useMutation({
    mutationFn: (agentId: string) => agentApi.run(agentId),
    onSuccess: async () => {
      announce("Run dispatched.");
      await invalidateAll();
    },
  });

  const selectAgent = useCallback((agentId: string | null) => {
    setSelectedId(agentId);
    replaceParam("agent", agentId);
  }, [replaceParam]);

  const stats = useMemo(() => {
    const items = agents.data?.items ?? [];
    const totalCost = items.reduce((sum, agent) => sum + agent.totalCostUsd, 0);
    const running = items.filter((agent) => agent.status === "running").length;
    const errored = items.filter((agent) => agent.status === "error").length;
    return { count: items.length, running, errored, totalCost };
  }, [agents.data]);

  const clientOptions = useMemo(
    () => (clients.data?.items ?? []).map((client) => ({ id: client.id, name: client.name })),
    [clients.data],
  );
  const agentOptions = useMemo(
    () => (agents.data?.items ?? []).map((agent) => ({ id: agent.id, name: agent.name })),
    [agents.data],
  );

  const editAgent = useQuery({
    queryKey: ["agent", editId],
    queryFn: () => agentApi.detail(editId!),
    enabled: Boolean(editId),
  });

  useContextPanel(
    <div className="sticky top-0 grid gap-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-purple-300">AI agent runtime</p>
        <h2 className="mt-1 text-sm font-semibold text-[#F3F5FF]">Agent operations</h2>
        <p className="mt-2 text-xs leading-5 text-[#888]">Create agents, dispatch runs, approve consequential actions, and inspect memory - all from one runtime.</p>
      </div>
      <div className="rounded-xl border border-[#2A2E45] p-4">
        <p className="text-[10px] uppercase tracking-[0.12em] text-[#888]">Runtime</p>
        {runtime.data ? (
          <dl className="mt-3 grid gap-2 text-xs">
            <div className="flex justify-between"><dt className="text-[#888]">Queue</dt><dd className="text-[#C5C8DB]">{runtime.data.queue.queued} queued · {runtime.data.queue.running} active</dd></div>
            <div className="flex justify-between"><dt className="text-[#888]">Scheduler</dt><dd className={runtime.data.schedulerRunning ? "text-[#39FF14]" : "text-[#888]"}>{runtime.data.schedulerRunning ? "Running" : "Stopped"}</dd></div>
            <div className="flex justify-between"><dt className="text-[#888]">Provider</dt><dd className={runtime.data.liveProviderEnabled ? "text-cyan-200" : "text-purple-300"}>{runtime.data.liveProviderEnabled ? "Live API" : "Simulated"}</dd></div>
          </dl>
        ) : (
          <p className="mt-3 text-xs text-[#666]">Loading runtime status…</p>
        )}
        {!runtime.data?.liveProviderEnabled && runtime.data ? (
          <p className="mt-3 text-[10px] leading-4 text-[#666]">No provider API key configured - runs complete deterministically and are labeled “simulated”. Set AIOS_OPENAI_API_KEY or AIOS_ANTHROPIC_API_KEY for live models.</p>
        ) : null}
      </div>
      <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" aria-hidden="true" />New agent</Button>
      <p className="text-[10px] leading-4 text-[#666]">Agents appear as green nodes in the Knowledge Graph and broadcast live status changes.</p>
    </div>,
  );

  return (
    <div className="grid gap-6">
      <header className="flex flex-col justify-between gap-4 border-b border-[#2A2E45] pb-6 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-purple-300">/ ai operations</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#F3F5FF] sm:text-3xl">Agents</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#888]">One reusable runtime for every AI agent in the agency - configure, run, approve, and inspect executions with full cost and memory control.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" aria-hidden="true" />New agent</Button>
      </header>

      {feedback ? <p role="status" className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3 text-xs text-cyan-100">{feedback}</p> : null}
      {create.error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-4 py-3 text-xs text-red-200">{errorMessage(create.error, "The agent could not be created.")}</p> : null}
      {update.error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-4 py-3 text-xs text-red-200">{errorMessage(update.error, "The agent could not be updated.")}</p> : null}

      <section aria-label="Agent summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Agents</p><p className="mt-1 font-mono text-xl text-[#F3F5FF]">{stats.count}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Running now</p><p className="mt-1 font-mono text-xl text-[#39FF14]">{stats.running}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">In error</p><p className="mt-1 font-mono text-xl text-[#FF4D6D]">{stats.errored}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Total spend</p><p className="mt-1 font-mono text-xl text-cyan-200">{costLabel(stats.totalCost)}</p></CardContent></Card>
      </section>

      <section aria-labelledby="agent-filters-heading" className="grid gap-3">
        <h2 id="agent-filters-heading" className="sr-only">Filter agents</h2>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#666]" />
            <Input
              type="search"
              className="pl-10"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search agents by name or description…"
              aria-label="Search agents"
            />
          </div>
          <div className="surface-scrollbar flex gap-1 overflow-x-auto" aria-label="Filter by agent status">
            <Button variant={activeStatus === "all" ? "secondary" : "ghost"} size="sm" aria-pressed={activeStatus === "all"} onClick={() => replaceParam("status", null)}>All</Button>
            {agentStatuses.map((status) => (
              <Button key={status} variant={activeStatus === status ? "secondary" : "ghost"} size="sm" aria-pressed={activeStatus === status} onClick={() => replaceParam("status", status)}>
                {AGENT_STATUS_LABELS[status]}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="agent-results-heading" aria-busy={agents.isLoading || agents.isFetching}>
        <h2 id="agent-results-heading" className="sr-only">Agent results</h2>
        {agents.isLoading ? (
          <div role="status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><span className="sr-only">Loading agents…</span><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
        ) : agents.isError ? (
          <Empty title="Agents could not be loaded" description={errorMessage(agents.error, "Retry the request.")} action={<Button onClick={() => agents.refetch()}>Retry</Button>} />
        ) : !agents.data?.items.length ? (
          <Empty
            title={search || activeStatus !== "all" ? "No agents match" : "No agents yet"}
            description={search || activeStatus !== "all" ? "Clear the search or status filter to see other agents." : "Create your first agent - pick a type, write its prompt, and run it in a few clicks."}
            action={<Button onClick={() => { setSearchDraft(""); replaceParam("status", null); replaceParam("search", null); if (!search && activeStatus === "all") setCreateOpen(true); }}><Plus className="size-4" aria-hidden="true" />New agent</Button>}
            icon={<Bot className="size-5 text-purple-300" aria-hidden="true" />}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="agent-cards">
            {agents.data.items.map((agent) => (
              <Card key={agent.id} className="h-full transition-colors hover:border-purple-300/40">
                <CardContent className="grid h-full gap-3">
                  <button type="button" className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60" onClick={() => selectAgent(agent.id)} aria-label={`Open ${agent.name}`}>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-medium text-[#F3F5FF]">{agent.name}</h3>
                      <AgentStatusBadge status={agent.status} />
                    </div>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-purple-300">{AGENT_TYPE_LABELS[agent.type]}</p>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div><dt className="text-[10px] uppercase text-[#888]">Runs</dt><dd className="mt-0.5 font-mono text-[#C5C8DB]">{agent.totalRuns}</dd></div>
                      <div><dt className="text-[10px] uppercase text-[#888]">Success</dt><dd className="mt-0.5 font-mono text-[#39FF14]">{agent.totalRuns > 0 ? `${agent.successRate.toFixed(0)}%` : "-"}</dd></div>
                      <div><dt className="text-[10px] uppercase text-[#888]">Cost</dt><dd className="mt-0.5 font-mono text-cyan-200">{costLabel(agent.totalCostUsd)}</dd></div>
                    </dl>
                    <p className="mt-2 text-[10px] text-[#888]">Last run {relativeTime(agent.lastRunAt)}</p>
                  </button>
                  <div className="mt-auto flex items-center gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => quickRun.mutate(agent.id)}
                      disabled={quickRun.isPending || agent.status === "paused"}
                      aria-label={`Run ${agent.name} now`}
                    >
                      <Play className="size-3.5" aria-hidden="true" />Run
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => selectAgent(agent.id)}>Open</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New agent" description="Pick a type, write its instructions, and it is ready to run.">
        <AgentForm
          mode="create"
          clients={clientOptions}
          agents={agentOptions}
          pending={create.isPending}
          error={create.error ? errorMessage(create.error, "The agent could not be saved.") : undefined}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(input) => create.mutate(input)}
        />
      </Dialog>

      <Dialog open={Boolean(editId)} onClose={() => setEditId(null)} title="Edit agent" description="Changes record a new configuration version and expire pending approvals.">
        {editId && editAgent.data ? (
          <AgentForm
            mode="edit"
            initial={editAgent.data}
            clients={clientOptions}
            agents={agentOptions}
            pending={update.isPending}
            error={update.error ? errorMessage(update.error, "The agent could not be saved.") : undefined}
            onCancel={() => setEditId(null)}
            onSubmit={(input) => update.mutate({ agentId: editId, input })}
          />
        ) : (
          <div role="status" className="grid gap-2"><span className="sr-only">Loading agent…</span><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        )}
      </Dialog>

      <Drawer open={Boolean(selectedId)} onClose={() => selectAgent(null)} title="Agent details" description="Runs, memory, approvals, and configuration.">
        {selectedId ? (
          <AgentDetail
            agentId={selectedId}
            onEdit={(agent: AgentDetailDto) => { setEditId(agent.id); }}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
