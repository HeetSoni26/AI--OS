"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";
import type { ClientDeletionPlan, ClientDto } from "@aios/contracts";
import { Badge, Button, Checkbox, Dialog, Empty, FormField, Input, Textarea, useAnnounce } from "@/components/ui";
import { clientApi } from "../lib/client-api";

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short" });
const message = (error: unknown) => error instanceof Error ? error.message : "Try again.";

export function ClientDeletion({ client }: { client: ClientDto }) {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const confirmationRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [createdPlan, setCreatedPlan] = useState<ClientDeletionPlan | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const expected = `DELETE ${client.id}`;
  const deletionKey = ["clients", client.id, "deletion-state"] as const;
  const deletion = useQuery({ queryKey: deletionKey, queryFn: () => clientApi.deletionState(client.id) });
  const plan = createdPlan ?? deletion.data?.plan ?? null;
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["clients"] }),
      cache.invalidateQueries({ queryKey: ["clients", client.id] }),
    ]);
  };
  const schedule = useMutation({
    mutationFn: (reason: string | undefined) => clientApi.scheduleDeletion(client.id, { confirmation, impactAcknowledged: true, reason }),
    onMutate: () => announce("Scheduling permanent client deletion."),
    onSuccess: async (nextPlan) => { setCreatedPlan(nextPlan); cache.setQueryData(deletionKey, (state: { impact: unknown } | undefined) => state ? { ...state, plan: nextPlan } : state); setOpen(false); announce(`Client deletion scheduled for ${dateTime.format(new Date(nextPlan.notBefore))}.`); await refresh(); },
    onError: (error) => announce(`Client deletion could not be scheduled. ${message(error)}`),
  });
  const cancel = useMutation({
    mutationFn: (reason: string | undefined) => clientApi.cancelDeletion(client.id, plan!.id, reason),
    onMutate: () => announce("Cancelling scheduled client deletion."),
    onSuccess: async () => { setCreatedPlan(null); cache.setQueryData(deletionKey, (state: { impact: unknown } | undefined) => state ? { ...state, plan: null } : state); setConfirmation(""); setAcknowledged(false); announce("Scheduled client deletion cancelled and client access restored."); await refresh(); },
    onError: (error) => announce(`Scheduled deletion could not be cancelled. ${message(error)}`),
  });

  if (plan?.status === "pending") {
    return (
      <section aria-labelledby="scheduled-deletion-heading" className="rounded-xl border border-orange-400/40 bg-orange-400/[0.06] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="scheduled-deletion-heading" className="text-sm font-medium text-orange-200">Permanent deletion scheduled</h3><p className="mt-1 text-xs leading-5 text-[#C5C8DB]">Execution is scheduled for <strong>{dateTime.format(new Date(plan.notBefore))}</strong>. Undo remains available while this plan is pending.</p></div><Badge variant="orange">{plan.status}</Badge></div>
        <ImpactList items={plan.impact.items} />
        {cancel.isError ? <MutationError action="Deletion cancellation" error={cancel.error} /> : null}
        <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); cancel.mutate(String(form.get("reason") ?? "").trim() || undefined); }}><FormField label="Undo reason"><Textarea name="reason" rows={2} placeholder="Optional owner note" /></FormField><Button type="submit" disabled={cancel.isPending}><RotateCcw className="size-4" aria-hidden="true" />{cancel.isPending ? "Cancelling…" : "Cancel deletion and restore client"}</Button></form>
      </section>
    );
  }

  return (
    <>
      <Button variant="danger" className="w-full" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Trash2 className="size-4" aria-hidden="true" />Schedule permanent deletion</Button>
      <Dialog open={open} onClose={() => { if (!schedule.isPending) { schedule.reset(); setOpen(false); } }} title="Schedule permanent client deletion" description="Deletion is delayed for seven days. Review impact, type the exact confirmation, and acknowledge the effect." initialFocusRef={confirmationRef}>
        {deletion.isLoading ? <p role="status" className="rounded-xl border border-[#2A2E45] p-4 text-xs text-[#888]">Calculating deletion impact…</p> : deletion.isError ? <Empty className="min-h-32" title="Deletion impact could not be loaded" description={message(deletion.error)} action={<Button size="sm" onClick={() => deletion.refetch()}>Retry impact check</Button>} /> : deletion.data ? <div className="grid gap-4"><div className="rounded-xl border border-orange-400/30 bg-orange-400/[0.05] p-4"><p className="text-xs font-medium text-orange-200">Deletion impact</p><ImpactList items={deletion.data.impact.items} />{deletion.data.impact.legalHold ? <p role="alert" className="mt-3 text-xs text-red-200">A legal hold blocks deletion.</p> : null}{deletion.data.impact.blockers.length ? <ul role="alert" className="mt-3 list-disc pl-5 text-xs text-red-200">{deletion.data.impact.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}</div>
          <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); schedule.mutate(String(form.get("reason") ?? "").trim() || undefined); }}>
            {schedule.isError ? <MutationError action="Deletion scheduling" error={schedule.error} /> : null}
            <FormField label={<>Type <code className="font-mono text-orange-200">{expected}</code></>} required error={confirmation && confirmation !== expected ? "Confirmation does not match." : undefined}><Input ref={confirmationRef} name="confirmation" autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></FormField>
            <Checkbox checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} label="I understand the listed resources will be cascaded, detached, deleted at providers, or retained exactly as shown." />
            <FormField label="Reason"><Textarea name="reason" rows={3} placeholder="Optional audit note" /></FormField>
            <div className="flex justify-end gap-2 border-t border-[#2A2E45] pt-4"><Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={schedule.isPending}>Cancel</Button><Button type="submit" variant="danger" disabled={schedule.isPending || confirmation !== expected || !acknowledged || deletion.data.impact.legalHold || Boolean(deletion.data.impact.blockers.length)}>{schedule.isPending ? "Scheduling…" : "Schedule deletion"}</Button></div>
          </form>
        </div> : null}
      </Dialog>
    </>
  );
}

function ImpactList({ items }: { items: readonly { resourceType: string; count: number; deletionMode: string }[] }) { return <ul className="mt-3 grid gap-1 text-xs text-[#C5C8DB]">{items.map((item) => <li key={`${item.resourceType}-${item.deletionMode}`} className="flex justify-between gap-3"><span>{item.resourceType.replaceAll("_", " ")} ({item.count})</span><span className="font-mono text-[10px] uppercase text-[#888]">{item.deletionMode.replaceAll("_", " ")}</span></li>)}</ul>; }
function MutationError({ action, error }: { action: string; error: unknown }) { return <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/[0.06] p-3 text-xs text-red-200">{action} failed. {message(error)}</p>; }
