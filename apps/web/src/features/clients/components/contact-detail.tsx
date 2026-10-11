"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Star } from "lucide-react";
import type { ContactDto } from "@aios/contracts";
import { Badge, Button, Empty } from "@/components/ui";
import { clientApi } from "../lib/client-api";

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const message = (error: unknown) => error instanceof Error ? error.message : "Try again.";

export function ContactDetail({
  clientId,
  contactId,
  sourceClientName,
  onOpenClient,
}: {
  clientId: string;
  contactId: string;
  sourceClientName: string;
  onOpenClient?: (clientId: string) => void;
}) {
  const contact = useQuery({
    queryKey: ["clients", clientId, "contacts", contactId],
    queryFn: () => clientApi.contact(clientId, contactId),
    retry: false,
  });

  if (contact.isLoading) return <p role="status" className="rounded-xl border border-[#2A2E45] p-4 text-xs text-[#888]">Loading contact details…</p>;
  if (contact.isError) return <Empty title="Contact details could not be loaded" description={message(contact.error)} action={<Button size="sm" onClick={() => contact.refetch()}>Retry contact details</Button>} />;
  if (!contact.data) return <Empty title="Contact unavailable" description="The contact record does not exist or is no longer accessible." />;

  const record: ContactDto = contact.data;
  const status = record.archivedAt ? "Archived" : "Active";
  return (
    <section aria-labelledby="contact-record-heading" className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="contact-record-heading" className="mr-auto text-sm font-semibold text-[#F3F5FF]">{record.name}</h3>
        <Badge>{status}</Badge>
        {record.isPrimary ? <Badge variant="cyan"><Star aria-hidden="true" className="size-3" />Primary</Badge> : null}
      </div>
      <dl className="grid gap-3 text-xs sm:grid-cols-2">
        <Detail label="Role" value={record.role ?? "Not set"} />
        <Detail label="Source client" value={sourceClientName} />
        <Detail label="Email" value={record.email ?? "Not set"} />
        <Detail label="Phone" value={record.phone ?? "Not set"} />
        <Detail label="Last contact" value={record.lastContactAt ? dateTime.format(new Date(record.lastContactAt)) : "No communication logged"} />
        <Detail label="Record updated" value={dateTime.format(new Date(record.updatedAt))} />
      </dl>
      {record.notes ? <p className="whitespace-pre-wrap rounded-xl border border-[#2A2E45] p-4 text-xs leading-5 text-[#C5C8DB]">{record.notes}</p> : <p className="rounded-xl border border-dashed border-[#2A2E45] p-4 text-xs text-[#888]">No contact notes.</p>}
      {onOpenClient ? <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => onOpenClient(clientId)}>Open {sourceClientName}<ArrowRight aria-hidden="true" className="size-3.5" /></Button> : null}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[10px] uppercase tracking-[0.12em] text-[#888]">{label}</dt><dd className="mt-1 break-words text-[#C5C8DB]">{value}</dd></div>;
}
