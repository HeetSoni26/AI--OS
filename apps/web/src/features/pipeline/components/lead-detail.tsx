"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CRM_LEAD_STAGE_LABELS, crmLeadStages, type CrmLeadStage } from "@aios/contracts";
import { FileText } from "lucide-react";
import { Button, Empty, Select, Skeleton, Textarea, useAnnounce } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { pipelineApi, type CrmLeadDto } from "../lib/pipeline-api";

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

export function LeadDetail({
  leadId,
  onFeedback,
  onCreateProposal,
}: {
  leadId: string;
  onFeedback: (message: string) => void;
  onCreateProposal: (lead: CrmLeadDto) => void;
}) {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [error, setError] = useState("");
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  const lead = useQuery({
    queryKey: ["pipeline-lead", leadId],
    queryFn: () => pipelineApi.lead(leadId),
  });

  const invalidate = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["pipeline-lead", leadId] }),
      cache.invalidateQueries({ queryKey: ["pipeline-leads"] }),
    ]);
  };

  const setStage = useMutation({
    mutationFn: (stage: CrmLeadStage) => pipelineApi.setStage(leadId, stage),
    onSuccess: async (updated) => {
      onFeedback(`${updated.name} moved to ${CRM_LEAD_STAGE_LABELS[updated.stage as CrmLeadStage]}.`);
      announce("Stage updated.");
      await invalidate();
    },
    onError: (caught) => setError(errorMessage(caught, "The stage change failed.")),
  });

  const saveNotes = useMutation({
    mutationFn: (notes: string) => pipelineApi.updateLead(leadId, { notes }),
    onSuccess: async () => {
      onFeedback("Notes saved.");
      await invalidate();
    },
    onError: (caught) => setError(errorMessage(caught, "The notes could not be saved.")),
  });

  if (lead.isLoading) {
    return <div role="status" className="grid gap-3"><span className="sr-only">Loading lead…</span><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;
  }
  if (lead.isError || !lead.data) {
    return <Empty title="Lead could not be loaded" description={lead.error ? errorMessage(lead.error, "Retry the request.") : ""} action={<Button onClick={() => lead.refetch()}>Retry</Button>} />;
  }

  const data = lead.data;
  return (
    <div className="grid gap-5">
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#F3F5FF]">{data.name}</h2>
          <p className="mt-1 text-xs text-[#888]">{data.company ?? "No company"} · {data.email ?? "no email"}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <label className="grid gap-1 text-[10px] font-medium uppercase tracking-wide text-[#888]" htmlFor="lead-stage-select">Stage
            <Select id="lead-stage-select" value={data.stage} onChange={(event) => setStage.mutate(event.target.value as CrmLeadStage)} className="min-w-36">
              {crmLeadStages.map((stage) => <option key={stage} value={stage}>{CRM_LEAD_STAGE_LABELS[stage]}</option>)}
            </Select>
          </label>
          <Button size="sm" onClick={() => onCreateProposal(data)}>
            <FileText className="size-3.5" aria-hidden="true" />Proposal
          </Button>
        </div>
      </div>

      {data.interest ? (
        <div className="rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3 text-xs leading-5 text-[#C5C8DB]">{data.interest}</div>
      ) : null}

      {data.value != null ? (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3"><p className="text-[10px] uppercase text-[#666]">Deal value</p><p className="mt-1 font-mono text-sm text-cyan-200">{currency.format(data.value)}</p></div>
          <div className="rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3"><p className="text-[10px] uppercase text-[#666]">Close probability</p><p className="mt-1 font-mono text-sm text-purple-300">{data.expectedCloseProbability != null ? `${Math.round(data.expectedCloseProbability * 100)}%` : "-"}</p></div>
        </div>
      ) : null}

      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="lead-notes">Notes
        <Textarea
          id="lead-notes"
          rows={4}
          value={notesDraft ?? data.notes ?? ""}
          onChange={(event) => setNotesDraft(event.target.value)}
        />
      </label>
      <div className="flex justify-end">
        <Button size="sm" disabled={notesDraft === null || notesDraft.trim() === (data.notes ?? "")} onClick={() => saveNotes.mutate(notesDraft?.trim() ?? "")}>Save notes</Button>
      </div>

      {data.proposals.length ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#C5C8DB]">Proposals</h3>
          <ul className="mt-2 grid gap-1.5">
            {data.proposals.map((proposal) => (
              <li key={proposal.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#2A2E45] px-3 py-2 text-[11px]">
                <span className="text-[#C5C8DB]">{proposal.title}</span>
                <span className="text-[10px] uppercase text-[#888]">{proposal.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#C5C8DB]">Stage history</h3>
        <ol className="mt-2 grid gap-1.5">
          {data.stageHistory.map((entry, index) => (
            <li key={index} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2A2E45] px-3 py-2 text-[11px]">
              <span className="text-[#C5C8DB]">
                {entry.fromStage ? `${CRM_LEAD_STAGE_LABELS[entry.fromStage as CrmLeadStage]} → ` : ""}{CRM_LEAD_STAGE_LABELS[entry.toStage as CrmLeadStage]}
                {entry.reason ? <span className="text-[#666]"> · {entry.reason}</span> : null}
              </span>
              <span className="text-[10px] text-[#666]">{entry.changedAt ? dateTime.format(new Date(entry.changedAt)) : ""}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
