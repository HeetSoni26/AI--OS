"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { Archive, BookOpen, Mail, Pencil, RotateCcw, Trash2, Upload, UsersRound, X } from "lucide-react";
import type { ClientCreate, ClientDto } from "@aios/contracts";
import { INVOICE_STATUS_LABELS, INVOICE_TYPE_LABELS } from "@aios/contracts";
import { Badge, Button, Card, CardContent, Dialog, Empty, Tab, TabPanel, Tabs, TabsList, useAnnounce } from "@/components/ui";
import { clientApi } from "../lib/client-api";
import { ClientCommunications } from "./client-communications";
import { ClientContacts } from "./client-contacts";
import { ClientDeletion } from "./client-deletion";
import { ClientForm } from "./client-form";
import { ClientProjects } from "./client-projects";
import { ClientStatusBadge } from "./client-status-badge";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const message = (error: unknown) => error instanceof Error ? error.message : "Try again.";

type ClientDetailTab = "overview" | "contacts" | "projects" | "communications" | "invoices" | "activity";

export function ClientDetail({ clientId, initial, onClose, lazyMountTabs = false }: { clientId: string; initial?: ClientDto; onClose?: () => void; lazyMountTabs?: boolean }) {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const logoInput = useRef<HTMLInputElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [tabState, setTabState] = useState(() => ({ clientId, active: "overview" as ClientDetailTab, mounted: new Set<ClientDetailTab>(["overview"]) }));
  const activeTab = tabState.clientId === clientId ? tabState.active : "overview";
  const mountedTabs = tabState.clientId === clientId ? tabState.mounted : new Set<ClientDetailTab>(["overview"]);
  const mountTab = (tab: ClientDetailTab) => !lazyMountTabs || mountedTabs.has(tab);
  const changeTab = (value: string) => {
    const tab = value as ClientDetailTab;
    setTabState((current) => ({
      clientId,
      active: tab,
      mounted: new Set<ClientDetailTab>([...(current.clientId === clientId ? current.mounted : new Set<ClientDetailTab>(["overview"])), tab]),
    }));
  };
  const client = useQuery({ queryKey: ["clients", clientId], queryFn: () => clientApi.detail(clientId), initialData: initial });
  const invoices = useQuery({ queryKey: ["clients", clientId, "invoices"], queryFn: () => clientApi.invoices(clientId), enabled: mountTab("invoices") });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["clients", clientId] }),
      cache.invalidateQueries({ queryKey: ["clients"], exact: false }),
    ]);
  };
  const edit = useMutation({
    mutationFn: (input: ClientCreate) => clientApi.update(clientId, input),
    onMutate: () => announce("Saving client changes."),
    onSuccess: async () => { setEditOpen(false); announce("Client changes saved."); await refresh(); },
    onError: (error) => announce(`Client could not be saved. ${message(error)}`),
  });
  const archive = useMutation({ mutationFn: () => clientApi.archive(clientId), onMutate: () => announce("Archiving client."), onSuccess: async () => { announce("Client archived."); await refresh(); }, onError: (error) => announce(`Client could not be archived. ${message(error)}`) });
  const recover = useMutation({ mutationFn: () => clientApi.recover(clientId), onMutate: () => announce("Recovering client."), onSuccess: async () => { announce("Client recovered."); await refresh(); }, onError: (error) => announce(`Client could not be recovered. ${message(error)}`) });
  const logo = useMutation({
    mutationFn: (file: File) => clientApi.uploadLogo(clientId, file),
    onMutate: () => announce("Uploading client logo."),
    onSuccess: async () => { if (logoInput.current) logoInput.current.value = ""; announce("Client logo uploaded."); await refresh(); },
    onError: (error) => announce(`Client logo could not be uploaded. ${message(error)}`),
  });
  const removeLogo = useMutation({ mutationFn: () => clientApi.deleteLogo(clientId), onMutate: () => announce("Removing client logo."), onSuccess: async () => { announce("Client logo removed."); await refresh(); }, onError: (error) => announce(`Client logo could not be removed. ${message(error)}`) });
  const record = client.data;

  if (client.isLoading) return <p role="status" className="p-6 text-sm text-[#888]">Loading client details…</p>;
  if (client.isError) return <Empty title="Client details could not be loaded" description={message(client.error)} action={<Button onClick={() => client.refetch()}>Retry client details</Button>} />;
  if (!record) return <Empty title="Client unavailable" description="The client record does not exist or is no longer accessible." action={onClose ? <Button onClick={onClose}>Close details</Button> : undefined} />;

  const lifecycleError = archive.error ?? recover.error;
  const logoError = logo.error ?? removeLogo.error;

  return (
    <div className="grid min-w-0 gap-5">
      <header className="flex items-start gap-3 border-b border-[#2A2E45] pb-5 sm:gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-purple-300/30 bg-purple-300/10 text-lg font-semibold text-purple-200">
          {record.logoFileId ? <Image key={`${record.logoFileId}-${record.updatedAt}`} src={`/api/v1/clients/${record.id}/logo`} alt={`${record.name} logo`} width={56} height={56} unoptimized className="size-full object-cover" /> : <span aria-label="No client logo">{record.name.slice(0, 2).toUpperCase()}</span>}
        </div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-lg font-semibold text-[#F3F5FF]">{record.name}</h2><ClientStatusBadge status={record.status} />{record.archivedAt ? <Badge variant="orange">Archived</Badge> : null}{record.deletedAt ? <Badge variant="orange">Deletion pending</Badge> : null}</div><p className="mt-1 text-xs text-[#888]">{record.industry ?? "Industry not set"}</p><p className="mt-2 font-mono text-[11px] text-cyan-200">{currency.format(record.mrr)} MRR</p></div>
        {onClose ? <Button variant="ghost" size="icon" aria-label="Close client details" onClick={onClose}><X className="size-4" aria-hidden="true" /></Button> : null}
      </header>

      <Tabs defaultValue="overview" value={activeTab} onValueChange={changeTab}>
        <TabsList aria-label="Client detail sections"><Tab value="overview">Overview</Tab><Tab value="contacts">Contacts</Tab><Tab value="projects">Projects</Tab><Tab value="communications">Communications</Tab><Tab value="invoices">Invoices</Tab><Tab value="activity">Activity</Tab></TabsList>
        <TabPanel value="overview">
          <div className="mb-4 flex justify-end"><Button size="sm" variant="ghost" aria-haspopup="dialog" aria-expanded={editOpen} onClick={() => setEditOpen(true)}><Pencil className="size-3.5" aria-hidden="true" />Edit client</Button></div>
          <dl className="grid gap-3 text-xs sm:grid-cols-2"><Detail label="Primary contact" value={record.contactName ?? "Not set"} /><Detail label="Email" value={record.contactEmail ?? "Not set"} /><Detail label="Phone" value={record.contactPhone ?? "Not set"} /><Detail label="Website" value={record.website ?? "Not set"} /><Detail label="Start date" value={record.startDate ? date.format(new Date(`${record.startDate}T00:00:00Z`)) : "Not set"} /><Detail label="Total revenue" value={currency.format(record.totalRevenue)} /><Detail label="Created" value={dateTime.format(new Date(record.createdAt))} /><Detail label="Last updated" value={dateTime.format(new Date(record.updatedAt))} /></dl>
          {record.notes ? <p className="mt-4 whitespace-pre-wrap rounded-xl border border-[#2A2E45] p-4 text-xs leading-5 text-[#C5C8DB]">{record.notes}</p> : <p className="mt-4 rounded-xl border border-dashed border-[#2A2E45] p-4 text-xs text-[#888]">No client notes.</p>}
          <section aria-labelledby="knowledge-slot-heading" className="mt-4 rounded-xl border border-[#2A2E45] p-4"><div className="flex items-start gap-3"><BookOpen className="size-4 shrink-0 text-purple-300" aria-hidden="true" /><div><h3 id="knowledge-slot-heading" className="text-xs font-medium text-[#C5C8DB]">Linked knowledge</h3><p className="mt-1 text-[11px] leading-5 text-[#888]">Knowledge-base links arrive in Part 11. No documents are claimed or simulated here.</p><Button size="sm" variant="ghost" className="mt-2" disabled title="Knowledge linking is implemented in Part 11">Link knowledge · later</Button></div></div></section>
        </TabPanel>
        <TabPanel value="contacts">{mountTab("contacts") ? <ClientContacts clientId={clientId} /> : null}</TabPanel>
        <TabPanel value="projects">{mountTab("projects") ? <ClientProjects clientId={clientId} /> : null}</TabPanel>
        <TabPanel value="communications">{mountTab("communications") ? <ClientCommunications clientId={clientId} /> : null}</TabPanel>
        <TabPanel value="invoices">{mountTab("invoices") ? <InvoiceRelation clientId={clientId} query={invoices} /> : null}</TabPanel>
        <TabPanel value="activity"><ClientActivity record={record} /></TabPanel>
      </Tabs>

      <section aria-labelledby="logo-heading" className="grid gap-3 rounded-xl border border-[#2A2E45] p-4"><div><h3 id="logo-heading" className="text-xs font-medium text-[#C5C8DB]">Client logo</h3><p className="mt-1 text-[11px] text-[#888]">Private PNG, JPEG, or WebP image. Server validation and malware policy apply.</p></div>{logoError ? <MutationError action="Logo change" error={logoError} /> : null}<div className="flex flex-wrap gap-2"><label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#2A2E45] px-3 text-xs text-[#C5C8DB] hover:bg-white/5"><Upload className="size-3.5" aria-hidden="true" />{logo.isPending ? "Uploading…" : record.logoFileId ? "Replace logo" : "Upload logo"}<input ref={logoInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={logo.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) logo.mutate(file); }} /></label>{record.logoFileId ? <Button size="sm" variant="ghost" disabled={removeLogo.isPending} onClick={() => removeLogo.mutate()}><Trash2 className="size-3.5" aria-hidden="true" />{removeLogo.isPending ? "Removing…" : "Remove logo"}</Button> : null}</div></section>

      <section aria-label="Client actions" className="grid gap-2 rounded-xl border border-[#2A2E45] p-4 sm:grid-cols-2">
        {lifecycleError ? <div className="sm:col-span-2"><MutationError action="Client lifecycle change" error={lifecycleError} /></div> : null}
        {record.archivedAt ? <Button variant="ghost" disabled={recover.isPending || Boolean(record.deletedAt)} onClick={() => recover.mutate()}><RotateCcw className="size-4" aria-hidden="true" />{recover.isPending ? "Recovering…" : "Recover client"}</Button> : <Button variant="ghost" disabled={archive.isPending} onClick={() => archive.mutate()}><Archive className="size-4" aria-hidden="true" />{archive.isPending ? "Archiving…" : "Archive client"}</Button>}
        <Button variant="ghost" disabled title="Email sending is implemented in Part 9"><Mail className="size-4" aria-hidden="true" />Send email · later</Button>
        <Button variant="ghost" disabled title="Agent execution is implemented in Part 5"><UsersRound className="size-4" aria-hidden="true" />Run agent · later</Button>
        {record.archivedAt ? <div className="sm:col-span-2"><ClientDeletion client={record} /></div> : <p className="text-[11px] leading-5 text-[#666] sm:col-span-2">Archive this client before permanent deletion can be scheduled.</p>}
      </section>

      <Dialog open={editOpen} onClose={() => { if (!edit.isPending) { edit.reset(); setEditOpen(false); } }} title="Edit client" description="Update any client profile field. Contact records remain independently managed in Contacts."><ClientForm initial={record} pending={edit.isPending} error={edit.error ? message(edit.error) : undefined} onCancel={() => setEditOpen(false)} onSubmit={async (input) => { await edit.mutateAsync(input); }} /></Dialog>
    </div>
  );
}

function InvoiceRelation({ query }: { clientId: string; query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof clientApi.invoices>>, Error>> }) {
  if (query.isLoading) return <p role="status" className="rounded-xl border border-[#2A2E45] p-4 text-xs text-[#888]">Loading invoices…</p>;
  if (query.isError) return <Empty title="Invoices could not be loaded" description={message(query.error)} action={<Button size="sm" onClick={() => query.refetch()}>Retry invoices</Button>} />;
  if (!query.data?.items.length) return <Empty title="No invoices" description="This is the real empty invoice relation. Invoice creation arrives in Part 10." />;
  return <div className="grid gap-2">{query.data.items.map((invoice) => <Card key={invoice.id}><CardContent className="grid gap-2"><div className="flex items-center justify-between gap-3"><span className="text-xs text-[#C5C8DB]">{INVOICE_TYPE_LABELS[invoice.type]}</span><span className="font-mono text-xs text-cyan-200">{currency.format(invoice.amount)}</span></div><div className="flex justify-between text-[10px] text-[#888]"><span>{INVOICE_STATUS_LABELS[invoice.status]}</span><span>Due {date.format(new Date(`${invoice.dueDate}T00:00:00Z`))}</span></div></CardContent></Card>)}</div>;
}

function ClientActivity({ record }: { record: Awaited<ReturnType<typeof clientApi.detail>> }) {
  const audits = record.auditSummaries;
  if (!audits) return <Empty title="Activity is not available in this response" description="The client detail DTO may include safe audit summaries. No synthetic activity is shown when the API omits them." />;
  if (!audits.length) return <Empty title="No client activity" description="Safe audit events will appear here after owner mutations." />;
  return <ol className="grid gap-2">{audits.map((item) => <li key={item.id} className="rounded-xl border border-[#2A2E45] p-4"><div className="flex items-start justify-between gap-3"><p className="text-xs text-[#C5C8DB]"><span className="capitalize text-[#F3F5FF]">{item.entityType.replaceAll("_", " ")}</span> · {item.action.replaceAll("_", " ")}</p><time className="shrink-0 text-[10px] text-[#888]">{dateTime.format(new Date(item.createdAt))}</time></div><p className="mt-2 break-all font-mono text-[10px] text-[#666]">Correlation {item.correlationId} · Actor {item.actorType}</p></li>)}</ol>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] uppercase tracking-[0.12em] text-[#888]">{label}</dt><dd className="mt-1 break-words text-xs text-[#C5C8DB]">{value}</dd></div>; }
function MutationError({ action, error }: { action: string; error: unknown }) { return <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/[0.06] p-3 text-xs text-red-200">{action} failed. {message(error)}</p>; }
