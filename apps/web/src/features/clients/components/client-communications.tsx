"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  COMMUNICATION_DIRECTION_LABELS,
  COMMUNICATION_TYPE_LABELS,
  communicationDirections,
  communicationTypes,
  type CommunicationCreate,
  type CommunicationDto,
  type ContactDto,
} from "@aios/contracts";
import { Badge, Button, Dialog, Empty, FormField, Input, Select, Textarea, useAnnounce } from "@/components/ui";
import { clientApi } from "../lib/client-api";

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const nullable = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;
const inputDateTime = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : "";
const message = (error: unknown) => error instanceof Error ? error.message : "Try again.";

export function ClientCommunications({ clientId }: { clientId: string }) {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [editor, setEditor] = useState<"new" | null>(null);
  const communications = useQuery({ queryKey: ["clients", clientId, "communications"], queryFn: () => clientApi.communications(clientId) });
  const contacts = useQuery({ queryKey: ["clients", clientId, "contacts"], queryFn: () => clientApi.contacts(clientId) });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["clients", clientId, "communications"] }),
      cache.invalidateQueries({ queryKey: ["clients", clientId, "contacts"] }),
      cache.invalidateQueries({ queryKey: ["clients", clientId] }),
    ]);
  };
  const save = useMutation({
    mutationFn: (input: Omit<CommunicationCreate, "clientId">) => clientApi.createCommunication(clientId, input),
    onMutate: () => announce("Logging communication."),
    onSuccess: async () => { setEditor(null); announce("Communication saved."); await refresh(); },
    onError: (error) => announce(`Communication could not be saved. ${message(error)}`),
  });

  return (
    <section aria-labelledby="communications-heading">
      <div className="mb-3 flex items-start justify-between gap-3"><div><h3 id="communications-heading" className="text-sm font-medium text-[#F3F5FF]">Communication log</h3><p className="mt-1 text-[11px] text-[#888]">Newest first. Gmail-ingested messages identify their source.</p></div><Button size="sm" variant="ghost" aria-haspopup="dialog" aria-expanded={editor === "new"} onClick={() => setEditor("new")}><Plus className="size-3.5" aria-hidden="true" />Log</Button></div>
      {communications.isLoading ? <p role="status" className="rounded-xl border border-[#2A2E45] p-4 text-xs text-[#888]">Loading communications…</p> : communications.isError ? <Empty title="Communications could not be loaded" description={message(communications.error)} action={<Button size="sm" onClick={() => communications.refetch()}>Retry communications</Button>} /> : !communications.data?.length ? <Empty title="No communications" description="Log an email, note, call summary, Slack message, social message, or chatbot interaction." action={<Button size="sm" onClick={() => setEditor("new")}>Log first communication</Button>} /> : (
        <ol className="grid gap-2">{communications.data.map((item) => <li key={item.id} className="rounded-xl border border-[#2A2E45] p-4"><div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-1"><Badge variant="green">{COMMUNICATION_TYPE_LABELS[item.type]}</Badge><Badge>{COMMUNICATION_DIRECTION_LABELS[item.direction]}</Badge>{item.source ? <Badge variant="purple">{item.source}</Badge> : null}</div><time className="shrink-0 text-[10px] text-[#888]">{dateTime.format(new Date(item.occurredAt))}</time></div><p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[#C5C8DB]">{item.summary}</p>{item.body ? <details className="mt-2"><summary className="cursor-pointer text-[11px] text-cyan-200">Message body</summary><p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-[#888]">{item.body}</p></details> : null}{item.nextAction ? <p className="mt-2 text-[11px] text-cyan-200">Next: {item.nextAction}</p> : null}<p className="mt-2 text-[10px] text-[#666]">{contactName(contacts.data, item.contactId)}</p><p className="mt-3 border-t border-[#2A2E45] pt-2 text-[10px] text-[#666]">Existing communication records are append-only in the current API.</p></li>)}</ol>
      )}
      <CommunicationDialog communication={editor} contacts={contacts.data ?? []} contactsError={contacts.isError ? message(contacts.error) : null} open={Boolean(editor)} pending={save.isPending} error={save.error} onClose={() => { if (!save.isPending) { save.reset(); setEditor(null); } }} onSubmit={(input) => save.mutate(input)} />

    </section>
  );
}

function CommunicationDialog({ communication, contacts, contactsError, open, pending, error, onClose, onSubmit }: { communication: CommunicationDto | "new" | null; contacts: readonly ContactDto[]; contactsError: string | null; open: boolean; pending: boolean; error: unknown; onClose: () => void; onSubmit: (input: Omit<CommunicationCreate, "clientId">) => void }) {
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const current = communication === "new" ? null : communication;
  return <Dialog open={open} onClose={onClose} title={current ? "Edit communication" : "Log communication"} description="A linked contact's last-contact date advances when a new communication is logged." initialFocusRef={summaryRef}><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ contactId: nullable(form.get("contactId")), type: String(form.get("type")) as CommunicationCreate["type"], direction: String(form.get("direction")) as CommunicationCreate["direction"], occurredAt: new Date(String(form.get("occurredAt"))).toISOString(), summary: String(form.get("summary") ?? "").trim(), body: nullable(form.get("body")), nextAction: nullable(form.get("nextAction")), ...(!current ? { source: "manual", providerMessageId: null } : {}) }); }}>
    {error ? <MutationError action="Communication save" error={error} /> : null}{contactsError ? <MutationError action="Contact options" error={new Error(contactsError)} /> : null}
    <div className="grid gap-4 sm:grid-cols-2"><FormField label="Type"><Select name="type" defaultValue={current?.type ?? "note"}>{communicationTypes.map((type) => <option key={type} value={type}>{COMMUNICATION_TYPE_LABELS[type]}</option>)}</Select></FormField><FormField label="Direction"><Select name="direction" defaultValue={current?.direction ?? "internal"}>{communicationDirections.map((direction) => <option key={direction} value={direction}>{COMMUNICATION_DIRECTION_LABELS[direction]}</option>)}</Select></FormField></div>
    <FormField label="Contact"><Select name="contactId" defaultValue={current?.contactId ?? ""}><option value="">No linked contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.isPrimary ? " (primary)" : ""}</option>)}</Select></FormField>
    <FormField label="Date and time" required><Input name="occurredAt" type="datetime-local" required defaultValue={inputDateTime(current?.occurredAt ?? new Date().toISOString())} /></FormField><FormField label="Summary" required><Textarea ref={summaryRef} name="summary" required rows={4} defaultValue={current?.summary ?? ""} /></FormField><FormField label="Body"><Textarea name="body" rows={6} defaultValue={current?.body ?? ""} /></FormField><FormField label="Next action"><Input name="nextAction" defaultValue={current?.nextAction ?? ""} /></FormField>
    <div className="flex justify-end gap-2 border-t border-[#2A2E45] pt-4"><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save communication"}</Button></div>
  </form></Dialog>;
}

function contactName(contacts: readonly ContactDto[] | undefined, id: string | null) { return id ? contacts?.find((contact) => contact.id === id)?.name ?? "Linked contact" : "No linked contact"; }
function MutationError({ action, error }: { action: string; error: unknown }) { return <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/[0.06] p-3 text-xs text-red-200">{action} failed. {message(error)}</p>; }
