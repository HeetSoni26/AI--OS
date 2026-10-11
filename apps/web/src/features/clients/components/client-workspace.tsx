"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Grid2X2, List, Plus, Search, UsersRound } from "lucide-react";
import {
  CLIENT_STATUS_LABELS,
  clientStatuses,
  type ClientCreate,
  type ClientListQuery,
  type ClientSortField,
  type ClientStatus,
  type ClientSummary,
  type SortDirection,
} from "@aios/contracts";
import { useContextPanel } from "@/components/providers/context-panel-provider";
import {
  Button,
  Card,
  CardContent,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHeader,
  DataTableRow,
  DataTableSortableHeader,
  Dialog,
  Drawer,
  Empty,
  Input,
  Skeleton,
  useAnnounce,
} from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { ClientForm } from "./client-form";
import { ClientDetail } from "./client-detail";
import { ClientStatusBadge } from "./client-status-badge";
import { GmailStatusCard } from "./gmail-status";
import { clientApi } from "../lib/client-api";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const statusFilters: Array<{ value: "all" | ClientStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  ...clientStatuses.map((status) => ({ value: status, label: CLIENT_STATUS_LABELS[status] })),
];
const archiveFilters = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All records" },
] as const;

function queryFromParams(params: URLSearchParams): ClientListQuery {
  const status = params.get("status") as ClientStatus | null;
  const limit = Number(params.get("limit") ?? 25);
  return {
    limit: Number.isInteger(limit) && limit > 0 && limit <= 100 ? limit : 25,
    cursor: params.get("cursor") ?? undefined,
    search: params.get("search") || undefined,
    industry: params.get("industry") || undefined,
    status: status && clientStatuses.includes(status) ? status : undefined,
    archiveScope: params.get("archiveScope") === "archived" ? "archived" : params.get("archiveScope") === "all" ? "all" : "active",
    sort: ["name", "mrr", "startDate", "status"].includes(params.get("sort") ?? "") ? params.get("sort") as ClientSortField : "name",
    direction: params.get("direction") === "desc" ? "desc" : "asc",
    view: params.get("view") === "grid" ? "grid" : "list",
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

export function ClientWorkspace() {
  const params = useSearchParams();
  const paramsString = params.toString();
  const pathname = usePathname();
  const router = useRouter();
  const cache = useQueryClient();
  const announce = useAnnounce();
  const query = useMemo(() => queryFromParams(new URLSearchParams(paramsString)), [paramsString]);
  const [searchDraft, setSearchDraft] = useState(query.search ?? "");
  const [industryDraft, setIndustryDraft] = useState(query.industry ?? "");
  const [newOpen, setNewOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("client"));
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [createFeedback, setCreateFeedback] = useState("");

  const replaceParams = useCallback((updates: Record<string, string | null>, resetCursor = true) => {
    const next = new URLSearchParams(paramsString);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (resetCursor && !("cursor" in updates)) next.delete("cursor");
    if (resetCursor) setCursorHistory([]);
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }, [paramsString, pathname, router]);

  const selectClient = useCallback((clientId: string | null) => {
    setSelectedId(clientId);
    replaceParams({ client: clientId }, false);
  }, [replaceParams]);

  const clients = useQuery({
    queryKey: ["clients", query],
    queryFn: () => clientApi.list(query),
    retry: false,
  });
  const create = useMutation({
    mutationFn: async ({ input, logo }: { input: ClientCreate; logo?: File }) => {
      const client = await clientApi.create(input);
      let logoError: string | undefined;
      if (logo) {
        try {
          await clientApi.uploadLogo(client.id, logo);
        } catch (error) {
          logoError = errorMessage(error, "The client logo could not be uploaded.");
        }
      }
      return { client, logoError, logoUploaded: Boolean(logo && !logoError) };
    },
    onSuccess: async ({ client, logoError, logoUploaded }) => {
      setNewOpen(false);
      selectClient(client.id);
      const message = logoError
        ? `${client.name} was created, but its logo was not uploaded. ${logoError}`
        : `${client.name} was created${logoUploaded ? " and its logo was uploaded" : ""}.`;
      setCreateFeedback(message);
      announce(message);
      await cache.invalidateQueries({ queryKey: ["clients"] });
    },
  });

  useEffect(() => {
    setSelectedId(new URLSearchParams(paramsString).get("client"));
  }, [paramsString]);

  useEffect(() => {
    setSearchDraft(query.search ?? "");
  }, [query.search]);

  useEffect(() => {
    setIndustryDraft(query.industry ?? "");
  }, [query.industry]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchDraft !== (query.search ?? "")) replaceParams({ search: searchDraft || null });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query.search, replaceParams, searchDraft]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (industryDraft !== (query.industry ?? "")) replaceParams({ industry: industryDraft || null });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [industryDraft, query.industry, replaceParams]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable = target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditable) {
        event.preventDefault();
        setNewOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (clients.data && !clients.isFetching) {
      announce(`${clients.data.total} client result${clients.data.total === 1 ? "" : "s"}. ${clients.data.items.length} shown on this page.`);
    }
  }, [announce, clients.data, clients.isFetching]);

  const selectedSummary = clients.data?.items.find((client) => client.id === selectedId);
  useContextPanel(
    <div className="sticky top-0 grid gap-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-purple-300">Client operations</p>
        <h2 className="mt-1 text-sm font-semibold text-[#F3F5FF]">{selectedSummary?.name ?? "Client directory"}</h2>
        <p className="mt-2 text-xs leading-5 text-[#888]">{selectedSummary ? `${selectedSummary.projectCount} projects · ${selectedSummary.contactCount} contacts` : "Search, filter, and select a client to inspect its current operating context."}</p>
      </div>
      <div className="rounded-xl border border-[#2A2E45] p-4">
        <p className="text-[10px] uppercase tracking-[0.12em] text-[#888]">Current view</p>
        <dl className="mt-3 grid gap-2 text-xs">
          <div className="flex justify-between"><dt className="text-[#888]">Visible records</dt><dd className="text-[#C5C8DB]">{clients.data?.items.length ?? 0}</dd></div>
          <div className="flex justify-between"><dt className="text-[#888]">Total matches</dt><dd className="text-[#C5C8DB]">{clients.data?.total ?? 0}</dd></div>
          <div className="flex justify-between"><dt className="text-[#888]">Lifecycle</dt><dd className="capitalize text-[#C5C8DB]">{query.archiveScope}</dd></div>
        </dl>
      </div>
      <GmailStatusCard />
      <Button onClick={() => setNewOpen(true)}><Plus className="size-4" aria-hidden="true" />New client</Button>
      <p className="text-[10px] leading-4 text-[#666]">Keyboard: press N outside a form field to create a client.</p>
    </div>,
  );

  const sort = (field: ClientSortField) => {
    const direction: SortDirection = query.sort === field && query.direction === "asc" ? "desc" : "asc";
    replaceParams({ sort: field, direction });
  };
  const activeStatus = Array.isArray(query.status) ? query.status[0] : query.status;
  const hasFilters = Boolean(query.search || query.industry || activeStatus || query.archiveScope !== "active");
  const clearFilters = () => {
    setSearchDraft("");
    setIndustryDraft("");
    replaceParams({ search: null, industry: null, status: null, archiveScope: null });
  };
  const nextPage = () => {
    if (!clients.data?.nextCursor) return;
    setCursorHistory((history) => [...history, query.cursor ?? ""]);
    replaceParams({ cursor: clients.data.nextCursor }, false);
  };
  const previousPage = () => {
    const previousCursor = cursorHistory.at(-1);
    if (previousCursor === undefined) return;
    setCursorHistory((history) => history.slice(0, -1));
    replaceParams({ cursor: previousCursor || null }, false);
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-col justify-between gap-4 border-b border-[#2A2E45] pb-6 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-purple-300">/ client operations</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#F3F5FF] sm:text-3xl">Clients</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#888]">Operate client profiles, contacts, delivery projects, time, deliverables, and communications from verified workspace data.</p>
        </div>
        <Button onClick={() => setNewOpen(true)}><Plus className="size-4" aria-hidden="true" />New client</Button>
      </header>

      {createFeedback ? <p role="status" className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3 text-xs text-cyan-100">{createFeedback}</p> : null}

      <section aria-labelledby="client-filters-heading" className="grid gap-4">
        <h2 id="client-filters-heading" className="sr-only">Filter clients</h2>
        <fieldset className="grid gap-2">
          <legend className="text-xs font-medium text-[#C5C8DB]">Status</legend>
          <div className="surface-scrollbar flex gap-1 overflow-x-auto border-b border-[#2A2E45] pb-2" aria-label="Filter by client status">
            {statusFilters.map((status) => {
              const pressed = (activeStatus ?? "all") === status.value;
              return <Button key={status.value} variant={pressed ? "secondary" : "ghost"} size="sm" aria-pressed={pressed} onClick={() => replaceParams({ status: status.value === "all" ? null : status.value })}>{status.label}</Button>;
            })}
          </div>
        </fieldset>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,0.4fr)]">
          <div className="grid gap-1.5">
            <label htmlFor="client-search" className="text-xs font-medium text-[#C5C8DB]">Search</label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#666]" />
              <Input id="client-search" type="search" className="pl-10" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Fuzzy search client or contact name, email, industry, or notes…" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="client-industry" className="text-xs font-medium text-[#C5C8DB]">Industry</label>
            <Input id="client-industry" value={industryDraft} onChange={(event) => setIndustryDraft(event.target.value)} placeholder="Filter by exact industry" />
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <fieldset className="grid gap-2">
            <legend className="text-xs font-medium text-[#C5C8DB]">Record scope</legend>
            <div className="flex flex-wrap gap-1" aria-label="Filter by record scope">
              {archiveFilters.map((scope) => <Button key={scope.value} variant={query.archiveScope === scope.value ? "secondary" : "ghost"} size="sm" aria-pressed={query.archiveScope === scope.value} onClick={() => replaceParams({ archiveScope: scope.value === "active" ? null : scope.value })}>{scope.label}</Button>)}
            </div>
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="text-xs font-medium text-[#C5C8DB]">Desktop view</legend>
            <div className="flex gap-1" aria-label="Choose desktop client view">
              <Button variant="ghost" size="icon" aria-label="List view" aria-pressed={query.view === "list"} onClick={() => replaceParams({ view: "list" })}><List className="size-4" aria-hidden="true" /></Button>
              <Button variant="ghost" size="icon" aria-label="Grid view" aria-pressed={query.view === "grid"} onClick={() => replaceParams({ view: "grid" })}><Grid2X2 className="size-4" aria-hidden="true" /></Button>
            </div>
          </fieldset>
        </div>
      </section>

      <div className="xl:hidden"><GmailStatusCard /></div>

      <section aria-labelledby="client-results-heading" aria-busy={clients.isLoading || clients.isFetching}>
        <h2 id="client-results-heading" className="sr-only">Client results</h2>
        {clients.isLoading ? (
          <div role="status" className="grid gap-3"><span className="sr-only">Loading clients…</span><Skeleton className="h-28 md:h-14" /><Skeleton className="h-28 md:h-14" /><Skeleton className="h-28 md:h-14" /></div>
        ) : clients.isError ? (
          <Empty title="Clients could not be loaded" description={errorMessage(clients.error, "Retry the request. If the problem continues, contact support.")} action={<Button onClick={() => clients.refetch()}>Retry</Button>} />
        ) : !clients.data?.items.length ? (
          <Empty title={hasFilters ? "No clients match these filters" : "No clients yet"} description={hasFilters ? "Clear the search, industry, status, or record-scope filters to see other clients." : "Create the first real client record in your workspace."} action={<Button onClick={hasFilters ? clearFilters : () => setNewOpen(true)}>{hasFilters ? "Clear filters" : "New client"}</Button>} icon={<UsersRound className="size-5 text-purple-300" aria-hidden="true" />} />
        ) : (
          <>
            <div className="grid gap-3 md:hidden" data-testid="client-mobile-cards">
              {clients.data.items.map((client) => <ClientCard key={client.id} client={client} onSelect={() => selectClient(client.id)} />)}
            </div>
            {query.view === "grid" ? (
              <div className="hidden gap-3 md:grid md:grid-cols-2 2xl:grid-cols-3" data-testid="client-desktop-grid">
                {clients.data.items.map((client) => <ClientCard key={client.id} client={client} onSelect={() => selectClient(client.id)} />)}
              </div>
            ) : (
              <div className="hidden md:block" data-testid="client-desktop-table">
                <DataTable>
                  <caption className="sr-only">Client directory sorted by {query.sort} {query.direction}</caption>
                  <DataTableHeader><tr><DataTableSortableHeader direction={query.sort === "name" ? query.direction === "asc" ? "ascending" : "descending" : null} onSort={() => sort("name")}>Name</DataTableSortableHeader><DataTableHeadStatic>Industry</DataTableHeadStatic><DataTableSortableHeader direction={query.sort === "status" ? query.direction === "asc" ? "ascending" : "descending" : null} onSort={() => sort("status")}>Status</DataTableSortableHeader><DataTableSortableHeader direction={query.sort === "mrr" ? query.direction === "asc" ? "ascending" : "descending" : null} onSort={() => sort("mrr")}>MRR</DataTableSortableHeader><DataTableHeadStatic>Projects</DataTableHeadStatic><DataTableSortableHeader direction={query.sort === "startDate" ? query.direction === "asc" ? "ascending" : "descending" : null} onSort={() => sort("startDate")}>Start date</DataTableSortableHeader></tr></DataTableHeader>
                  <DataTableBody>{clients.data.items.map((client) => <DataTableRow key={client.id}><DataTableCell><button type="button" className="inline-flex min-h-7 items-center font-medium text-[#F3F5FF] hover:text-purple-200" onClick={() => selectClient(client.id)}>{client.name}</button>{client.primaryContactName ? <span className="mt-1 block text-[10px] text-[#666]">{client.primaryContactName}</span> : null}</DataTableCell><DataTableCell>{client.industry ?? "-"}</DataTableCell><DataTableCell><ClientStatusBadge status={client.status} /></DataTableCell><DataTableCell className="font-mono text-cyan-200">{currency.format(client.mrr)}</DataTableCell><DataTableCell>{client.projectCount}</DataTableCell><DataTableCell>{client.startDate ? date.format(new Date(`${client.startDate}T00:00:00Z`)) : "-"}</DataTableCell></DataTableRow>)}</DataTableBody>
                </DataTable>
              </div>
            )}
          </>
        )}
      </section>

      {clients.data ? <nav aria-label="Client result pages" className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"><p className="text-xs text-[#888]">Showing {clients.data.items.length} of {clients.data.total} clients</p><div className="flex gap-2"><Button variant="ghost" size="sm" disabled={cursorHistory.length === 0} onClick={previousPage}>Previous</Button><Button variant="ghost" size="sm" disabled={!clients.data.hasMore || !clients.data.nextCursor} onClick={nextPage}>Next</Button></div></nav> : null}

      <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="New client" description="Create the profile, optional primary contact, and optional logo.">
        <ClientForm pending={create.isPending} error={create.error ? errorMessage(create.error, "The client could not be saved.") : undefined} onCancel={() => setNewOpen(false)} onSubmit={async (input, logo) => { await create.mutateAsync({ input, logo }); }} />
      </Dialog>
      <Drawer open={Boolean(selectedId)} onClose={() => selectClient(null)} title="Client details" description="Client profile, delivery, communication, and lifecycle operations.">{selectedId ? <ClientDetail clientId={selectedId} onClose={() => selectClient(null)} /> : null}</Drawer>
    </div>
  );
}

function ClientCard({ client, onSelect }: { client: ClientSummary; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className="rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60">
      <Card className="h-full transition-colors hover:border-purple-300/40">
        <CardContent className="grid gap-4">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-medium text-[#F3F5FF]">{client.name}</h3><p className="mt-1 text-xs text-[#888]">{client.industry ?? "Industry not set"}</p></div><ClientStatusBadge status={client.status} /></div>
          <dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[10px] uppercase text-[#666]">MRR</dt><dd className="mt-1 font-mono text-cyan-200">{currency.format(client.mrr)}</dd></div><div><dt className="text-[10px] uppercase text-[#666]">Projects</dt><dd className="mt-1 text-[#C5C8DB]">{client.projectCount}</dd></div></dl>
        </CardContent>
      </Card>
    </button>
  );
}

function DataTableHeadStatic({ children }: { children: React.ReactNode }) {
  return <th scope="col" className="h-10 px-4 font-medium text-[#C5C8DB]">{children}</th>;
}
