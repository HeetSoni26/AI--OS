"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import type { ContactCreate, ContactDto, ContactUpdate } from "@aios/contracts";
import { Badge, Button, Card, CardContent, Checkbox, Dialog, Empty, FormField, Input, Textarea, useAnnounce } from "@/components/ui";
import { clientApi } from "../lib/client-api";

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const nullable = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;
const localDateTime = (value: string | null) => value ? new Date(value).toISOString() : null;
const inputDateTime = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : "";

export function ClientContacts({ clientId }: { clientId: string }) {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [editor, setEditor] = useState<ContactDto | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactDto | null>(null);
  const contacts = useQuery({ queryKey: ["clients", clientId, "contacts"], queryFn: () => clientApi.contacts(clientId) });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["clients", clientId, "contacts"] }),
      cache.invalidateQueries({ queryKey: ["clients", clientId] }),
      cache.invalidateQueries({ queryKey: ["clients"], exact: false }),
    ]);
  };
  const save = useMutation({
    mutationFn: async (input: Omit<ContactCreate, "clientId">) => editor === "new"
      ? clientApi.createContact(clientId, input)
      : clientApi.updateContact(clientId, editor!.id, input satisfies ContactUpdate),
    onMutate: () => announce(editor === "new" ? "Saving contact." : "Saving contact changes."),
    onSuccess: async (contact) => {
      setEditor(null);
      announce(`${contact.name} ${editor === "new" ? "added" : "updated"}.`);
      await refresh();
    },
    onError: (error) => announce(`Contact could not be saved. ${message(error)}`),
  });
  const promote = useMutation({
    mutationFn: (contact: ContactDto) => clientApi.promoteContact(clientId, contact.id),
    onMutate: (contact) => announce(`Making ${contact.name} the primary contact.`),
    onSuccess: async (contact) => { announce(`${contact.name} is now the primary contact.`); await refresh(); },
    onError: (error) => announce(`Primary contact could not be changed. ${message(error)}`),
  });
  const remove = useMutation({
    mutationFn: (contact: ContactDto) => clientApi.deleteContact(clientId, contact.id),
    onMutate: (contact) => announce(`Deleting ${contact.name}.`),
    onSuccess: async (contact) => { setDeleteTarget(null); announce(`${contact.name} deleted.`); await refresh(); },
    onError: (error) => announce(`Contact could not be deleted. ${message(error)}`),
  });

  return (
    <section aria-labelledby="contacts-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h3 id="contacts-heading" className="text-sm font-medium text-[#F3F5FF]">Contacts</h3><p className="mt-1 text-[11px] text-[#888]">Maintain contact details and one primary relationship.</p></div>
        <Button size="sm" variant="ghost" aria-haspopup="dialog" aria-expanded={editor === "new"} onClick={() => setEditor("new")}><Plus className="size-3.5" aria-hidden="true" />Add contact</Button>
      </div>

      {contacts.isLoading ? <Loading label="Loading contacts…" /> : contacts.isError ? <Empty title="Contacts could not be loaded" description={message(contacts.error)} action={<Button size="sm" onClick={() => contacts.refetch()}>Retry contacts</Button>} /> : !contacts.data?.length ? <Empty title="No contacts" description="Add the people connected to this client." action={<Button size="sm" onClick={() => setEditor("new")}>Add first contact</Button>} /> : (
        <div className="grid gap-2">
          {contacts.data.map((contact) => (
            <Card key={contact.id}>
              <CardContent className="grid gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="break-words text-xs font-medium text-[#F3F5FF]">{contact.name}</p><p className="mt-1 break-words text-[11px] text-[#888]">{contact.role ?? "Contact"}</p></div>
                  {contact.isPrimary ? <Badge variant="cyan"><Star className="size-3" aria-hidden="true" />Primary</Badge> : null}
                </div>
                <dl className="grid gap-2 text-[11px] sm:grid-cols-2">
                  <Item label="Email" value={contact.email ?? "Not set"} /><Item label="Phone" value={contact.phone ?? "Not set"} />
                  <Item label="Last contact" value={contact.lastContactAt ? dateTime.format(new Date(contact.lastContactAt)) : "No communication logged"} />
                </dl>
                {contact.notes ? <p className="whitespace-pre-wrap border-t border-[#2A2E45] pt-3 text-[11px] leading-5 text-[#C5C8DB]">{contact.notes}</p> : null}
                <div className="flex flex-wrap justify-end gap-1 border-t border-[#2A2E45] pt-2">
                  {!contact.isPrimary ? <Button size="sm" variant="ghost" disabled={promote.isPending} onClick={() => promote.mutate(contact)}><Star className="size-3.5" aria-hidden="true" />Make primary</Button> : null}
                  <Button size="sm" variant="ghost" onClick={() => setEditor(contact)}><Pencil className="size-3.5" aria-hidden="true" />Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(contact)}><Trash2 className="size-3.5" aria-hidden="true" />Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {promote.isError ? <MutationError action="Primary contact change" error={promote.error} /> : null}

      <ContactDialog
        contact={editor}
        open={Boolean(editor)}
        pending={save.isPending}
        error={save.error}
        onClose={() => { if (!save.isPending) { save.reset(); setEditor(null); } }}
        onSubmit={(input) => save.mutate(input)}
      />
      <Dialog open={Boolean(deleteTarget)} onClose={() => { if (!remove.isPending) { remove.reset(); setDeleteTarget(null); } }} title="Delete contact" description="This removes the contact from active client relationships and cannot be undone here." initialFocusRef={undefined}>
        <p className="text-sm text-[#C5C8DB]">Delete <strong className="text-[#F3F5FF]">{deleteTarget?.name}</strong>{deleteTarget?.isPrimary ? " and clear the primary contact summary" : ""}?</p>
        {remove.isError ? <MutationError action="Contact deletion" error={remove.error} /> : null}
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={remove.isPending}>Cancel</Button><Button variant="danger" onClick={() => deleteTarget && remove.mutate(deleteTarget)} disabled={remove.isPending}>{remove.isPending ? "Deleting…" : "Delete contact"}</Button></div>
      </Dialog>
    </section>
  );
}

function ContactDialog({ contact, open, pending, error, onClose, onSubmit }: { contact: ContactDto | "new" | null; open: boolean; pending: boolean; error: unknown; onClose: () => void; onSubmit: (input: Omit<ContactCreate, "clientId">) => void }) {
  const nameRef = useRef<HTMLInputElement>(null);
  const current = contact === "new" ? null : contact;
  return (
    <Dialog open={open} onClose={onClose} title={current ? "Edit contact" : "Add contact"} description="Phone, notes, and primary status are stored on the client contact record." initialFocusRef={nameRef}>
      <form className="grid gap-4" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSubmit({
          name: String(form.get("name") ?? "").trim(), role: nullable(form.get("role")), email: nullable(form.get("email")), phone: nullable(form.get("phone")), notes: nullable(form.get("notes")), isPrimary: form.get("isPrimary") === "on", lastContactAt: localDateTime(nullable(form.get("lastContactAt"))),
        });
      }}>
        {error ? <MutationError action="Contact save" error={error} /> : null}
        <FormField label="Name" required><Input ref={nameRef} name="name" required defaultValue={current?.name} autoComplete="name" /></FormField>
        <div className="grid gap-4 sm:grid-cols-2"><FormField label="Role"><Input name="role" defaultValue={current?.role ?? ""} /></FormField><FormField label="Email"><Input name="email" type="email" defaultValue={current?.email ?? ""} autoComplete="email" /></FormField></div>
        <FormField label="Phone"><Input name="phone" type="tel" defaultValue={current?.phone ?? ""} autoComplete="tel" /></FormField>
        <FormField label="Last contact" hint="Normally advanced by a logged communication."><Input name="lastContactAt" type="datetime-local" defaultValue={inputDateTime(current?.lastContactAt ?? null)} /></FormField>
        <FormField label="Notes"><Textarea name="notes" rows={4} defaultValue={current?.notes ?? ""} /></FormField>
        <Checkbox name="isPrimary" label="Use as the primary client contact" defaultChecked={current?.isPrimary ?? false} />
        <div className="flex justify-end gap-2 border-t border-[#2A2E45] pt-4"><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save contact"}</Button></div>
      </form>
    </Dialog>
  );
}

function Loading({ label }: { label: string }) { return <p role="status" className="rounded-xl border border-[#2A2E45] p-4 text-xs text-[#888]">{label}</p>; }
function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] uppercase tracking-[0.1em] text-[#666]">{label}</dt><dd className="mt-1 break-words text-[#C5C8DB]">{value}</dd></div>; }
function MutationError({ action, error }: { action: string; error: unknown }) { return <p role="alert" className="mt-3 rounded-lg border border-red-400/30 bg-red-400/[0.06] p-3 text-xs text-red-200">{action} failed. {message(error)}</p>; }
function message(error: unknown) { return error instanceof Error ? error.message : "Try again."; }
