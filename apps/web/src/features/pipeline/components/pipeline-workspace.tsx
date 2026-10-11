"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CRM_LEAD_STAGE_LABELS,
  PROPOSAL_STATUS_LABELS,
  crmLeadStages,
  type CrmLeadStage,
  type ProposalStatus,
} from "@aios/contracts";
import { ArrowRight, FileText, GitBranch, Plus } from "lucide-react";
import { Button, Card, CardContent, Dialog, Drawer, Empty, Input, Skeleton, Tab, TabPanel, Tabs, TabsList, Textarea, useAnnounce } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { LeadDetail } from "./lead-detail";
import { pipelineApi, type CrmLeadDto } from "../lib/pipeline-api";

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Click-to-advance Kanban column order; keyboard users get the same control from the detail drawer. */
const FORWARD: Partial<Record<CrmLeadStage, CrmLeadStage>> = {
  new: "contacted",
  contacted: "qualified",
  qualified: "proposal",
  proposal: "negotiating",
  negotiating: "won",
};

export function PipelineWorkspace() {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [proposalFor, setProposalFor] = useState<CrmLeadDto | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const leads = useQuery({ queryKey: ["pipeline-leads"], queryFn: () => pipelineApi.leads() });
  const proposals = useQuery({ queryKey: ["pipeline-proposals"], queryFn: () => pipelineApi.proposals() });

  const invalidate = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["pipeline-leads"] }),
      cache.invalidateQueries({ queryKey: ["pipeline-proposals"] }),
      cache.invalidateQueries({ queryKey: ["pipeline-lead"] }),
    ]);
  };

  const advance = useMutation({
    mutationFn: ({ lead, stage }: { lead: CrmLeadDto; stage: CrmLeadStage }) => pipelineApi.setStage(lead.id, stage),
    onSuccess: async (lead) => {
      announce(`${lead.name} moved to ${CRM_LEAD_STAGE_LABELS[lead.stage as CrmLeadStage]}.`);
      await invalidate();
    },
    onError: (caught) => setError(errorMessage(caught, "The stage change failed.")),
  });

  const createLead = useMutation({
    mutationFn: (input: Parameters<typeof pipelineApi.createLead>[0]) => pipelineApi.createLead(input),
    onSuccess: async (lead) => {
      setCreateLeadOpen(false);
      setFeedback(`${lead.name} was added to the pipeline as New.`);
      announce("Lead created.");
      await invalidate();
    },
  });

  const createProposal = useMutation({
    mutationFn: (input: Parameters<typeof pipelineApi.createProposal>[0]) => pipelineApi.createProposal(input),
    onSuccess: async (proposal) => {
      setProposalFor(null);
      setFeedback(`Proposal "${proposal.title}" was created as a draft. Send it from the Proposals tab.`);
      await invalidate();
    },
    onError: (caught) => setError(errorMessage(caught, "The proposal could not be created.")),
  });

  const byStage = useMemo(() => {
    const map = new Map<string, CrmLeadDto[]>();
    for (const stage of crmLeadStages) map.set(stage, []);
    for (const lead of leads.data?.items ?? []) {
      map.get(lead.stage)?.push(lead);
    }
    return map;
  }, [leads.data]);

  const stats = useMemo(() => {
    const items = leads.data?.items ?? [];
    const openValue = items
      .filter((lead) => !["won", "lost"].includes(lead.stage))
      .reduce((sum, lead) => sum + (lead.expectedCloseProbability ?? 0) * (lead.value ?? 0), 0);
    const won = items.filter((lead) => lead.stage === "won").reduce((sum, lead) => sum + (lead.value ?? 0), 0);
    const wonCount = items.filter((lead) => lead.stage === "won").length;
    const deals = items.filter((lead) => !["won", "lost"].includes(lead.stage) && lead.value).length;
    return {
      count: items.length,
      openPipeline: openValue,
      weighted: openValue,
      won,
      wonCount,
      conversion: items.length && (wonCount + items.filter((lead) => lead.stage === "lost").length) > 0
        ? Math.round((wonCount / (wonCount + items.filter((lead) => lead.stage === "lost").length)) * 100)
        : null,
      deals,
    };
  }, [leads.data]);

  return (
    <div className="grid min-w-0 gap-6">
      <header className="flex flex-col justify-between gap-4 border-b border-[#2A2E45] pb-6 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-purple-300">/ sales pipeline</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#F3F5FF] sm:text-3xl">Pipeline</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#888]">Track every agency lead from first contact to won. Click a card's arrow to advance the stage; proposals are versioned and drive Won/Negotiating automatically.</p>
        </div>
        <Button onClick={() => setCreateLeadOpen(true)}><Plus className="size-4" aria-hidden="true" />New lead</Button>
      </header>

      {feedback ? <p role="status" className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3 text-xs text-cyan-100">{feedback}</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-4 py-3 text-xs text-red-200">{error}</p> : null}
      {createLead.error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-4 py-3 text-xs text-red-200">{errorMessage(createLead.error, "The lead could not be created.")}</p> : null}

      <section aria-label="Pipeline summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Open leads</p><p className="mt-1 font-mono text-xl text-[#F3F5FF]">{stats.count - stats.wonCount - (leads.data?.items.filter((lead) => lead.stage === "lost").length ?? 0)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Weighted pipeline</p><p className="mt-1 font-mono text-xl text-cyan-200">{currency.format(stats.weighted)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Won revenue</p><p className="mt-1 font-mono text-xl text-[#39FF14]">{currency.format(stats.won)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Win rate</p><p className="mt-1 font-mono text-xl text-purple-300">{stats.conversion != null ? `${stats.conversion}%` : "-"}</p></CardContent></Card>
      </section>

      <Tabs defaultValue="board">
        <TabsList className="surface-scrollbar mb-4 flex gap-1 overflow-x-auto border-b border-[#2A2E45]">
          <Tab value="board">Kanban</Tab>
          <Tab value="proposals">Proposals ({proposals.data?.items.length ?? 0})</Tab>
        </TabsList>

        <TabPanel value="board">
          {leads.isLoading ? (
            <div role="status" className="grid gap-3"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
          ) : !leads.data?.items.length ? (
            <Empty
              title="No leads yet"
              description="Add your first lead - capture the name, company, and value, then advance it through stages to Won."
              action={<Button onClick={() => setCreateLeadOpen(true)}><Plus className="size-4" aria-hidden="true" />New lead</Button>}
              icon={<GitBranch className="size-5 text-purple-300" aria-hidden="true" />}
            />
          ) : (
            <div className="surface-scrollbar min-w-0 grid grid-cols-[repeat(7,minmax(150px,1fr))] gap-2 overflow-x-auto pb-2" data-testid="kanban-board">
              {crmLeadStages.map((stage) => {
                const items = byStage.get(stage) ?? [];
                const total = items.reduce((sum, lead) => sum + (lead.value ?? 0), 0);
                return (
                  <section key={stage} aria-label={`${CRM_LEAD_STAGE_LABELS[stage]} column`} className="rounded-xl border border-[#2A2E45] bg-[#0C1020] p-2">
                    <header className="flex items-center justify-between px-1 pb-2">
                      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-[#C5C8DB]">{CRM_LEAD_STAGE_LABELS[stage]}</h3>
                      <span className="text-[10px] text-[#666]">{items.length}</span>
                    </header>
                    <p className="px-1 pb-2 text-[10px] font-mono text-[#888]">{total ? currency.format(total) : "-"}</p>
                    <div className="grid gap-1.5">
                      {items.map((lead) => (
                        <div key={lead.id} className="rounded-lg border border-[#2A2E45] bg-[#111533] p-2">
                          <button type="button" className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60" onClick={() => setSelectedId(lead.id)} aria-label={`Open ${lead.name}`}>
                            <p className="truncate text-xs font-medium text-[#F3F5FF]">{lead.name}</p>
                            <p className="mt-0.5 truncate text-[10px] text-[#888]">{lead.company ?? "-"}</p>
                            {lead.value ? <p className="mt-1 font-mono text-[10px] text-cyan-200">{currency.format(lead.value)}</p> : null}
                          </button>
                          {FORWARD[stage] ? (
                            <button
                              type="button"
                              className="mt-1.5 flex min-h-7 w-full items-center justify-end gap-1 py-1 text-[10px] text-[#666] transition-colors hover:text-cyan-200"
                              onClick={() => advance.mutate({ lead, stage: FORWARD[stage]! })}
                              aria-label={`Move ${lead.name} to ${CRM_LEAD_STAGE_LABELS[FORWARD[stage]!]}`}
                            >
                              {CRM_LEAD_STAGE_LABELS[FORWARD[stage]!]} <ArrowRight className="size-3" aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </TabPanel>

        <TabPanel value="proposals">
          {proposals.isLoading ? (
            <div role="status" className="grid gap-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
          ) : !proposals.data?.items.length ? (
            <Empty
              title="No proposals yet"
              description="Open a qualified lead and create a proposal - versions are immutable and acceptance moves the lead to Won automatically."
              icon={<FileText className="size-5 text-purple-300" aria-hidden="true" />}
            />
          ) : (
            <ul className="grid gap-2" aria-label="Proposals">
              {proposals.data.items.map((proposal) => (
                <li key={proposal.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-[#F3F5FF]">{proposal.title}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-purple-300">
                          {proposal.leadName ?? "Lead"} · v{proposal.currentVersion}
                          {proposal.acceptedAt ? " · accepted" : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-[10px] font-medium uppercase tracking-wide ${proposal.status === "accepted" ? "text-[#39FF14]" : proposal.status === "rejected" ? "text-[#FF4D6D]" : "text-[#C5C8DB]"}`}>
                          {PROPOSAL_STATUS_LABELS[proposal.status as ProposalStatus] ?? proposal.status}
                        </span>
                        {proposal.status === "draft" ? (
                          <Button size="sm" variant="ghost" onClick={async () => {
                            try {
                              await pipelineApi.setProposalStatus(proposal.id, "sent");
                              setFeedback(`Proposal "${proposal.title}" marked as sent.`);
                              await invalidate();
                            } catch (caught) { setError(errorMessage(caught, "Status update failed.")); }
                          }}>Mark sent</Button>
                        ) : null}
                        {proposal.status === "sent" ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={async () => {
                              try {
                                await pipelineApi.setProposalStatus(proposal.id, "accepted");
                                setFeedback(`Proposal "${proposal.title}" accepted - the lead moved to Won.`);
                                await invalidate();
                              } catch (caught) { setError(errorMessage(caught, "Status update failed.")); }
                            }}>Accepted</Button>
                            <Button size="sm" variant="ghost" onClick={async () => {
                              try {
                                await pipelineApi.setProposalStatus(proposal.id, "rejected");
                                setFeedback(`Proposal "${proposal.title}" rejected - the lead moved to Negotiating.`);
                                await invalidate();
                              } catch (caught) { setError(errorMessage(caught, "Status update failed.")); }
                            }}>Rejected</Button>
                          </>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabPanel>
      </Tabs>

      <Dialog open={createLeadOpen} onClose={() => setCreateLeadOpen(false)} title="New lead" description="Capture the lead; you can advance stages from the board.">
        <LeadForm
          pending={createLead.isPending}
          error={createLead.error ? errorMessage(createLead.error, "The lead could not be saved.") : undefined}
          onCancel={() => setCreateLeadOpen(false)}
          onSubmit={(input) => createLead.mutate(input)}
        />
      </Dialog>

      <Dialog open={Boolean(proposalFor)} onClose={() => setProposalFor(null)} title="New proposal" description="Versioned proposal - acceptance moves the lead to Won.">
        <ProposalForm
          lead={proposalFor}
          pending={createProposal.isPending}
          onCancel={() => setProposalFor(null)}
          onSubmit={(input) => createProposal.mutate(input)}
        />
      </Dialog>

      <Drawer open={Boolean(selectedId)} onClose={() => setSelectedId(null)} title="Lead details" description="Stage history, notes, and proposal actions.">
        {selectedId ? (
          <LeadDetail
            leadId={selectedId}
            onFeedback={setFeedback}
            onCreateProposal={(lead) => { setProposalFor(lead); }}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

function LeadForm({
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (input: Parameters<typeof pipelineApi.createLead>[0]) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [interest, setInterest] = useState("");
  const [value, setValue] = useState("");

  return (
    <form className="grid gap-4" onSubmit={(event) => {
      event.preventDefault();
      if (!name.trim()) return;
      onSubmit({
        name: name.trim(),
        email: email.trim() || null,
        company: company.trim() || null,
        interest: interest.trim() || null,
        value: value.trim() ? Number(value) : null,
      });
    }}>
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="lead-name">Name
        <Input id="lead-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={255} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="lead-company">Company
          <Input id="lead-company" value={company} onChange={(event) => setCompany(event.target.value)} maxLength={255} />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="lead-email">Email
          <Input id="lead-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} />
        </label>
      </div>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="lead-interest">What are they interested in?
        <Textarea id="lead-interest" rows={2} value={interest} onChange={(event) => setInterest(event.target.value)} maxLength={2000} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="lead-value">Deal value (USD)
        <Input id="lead-value" type="number" min={0} value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      <div className="sticky bottom-0 -mx-6 mt-1 flex items-center justify-end gap-2 border-t border-[#2A2E45] bg-[#0C1020] px-6 pt-3 pb-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending || !name.trim()}>Add lead</Button>
      </div>
    </form>
  );
}

function ProposalForm({
  lead,
  pending,
  onCancel,
  onSubmit,
}: {
  lead: CrmLeadDto | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: Parameters<typeof pipelineApi.createProposal>[0]) => void;
}) {
  const [title, setTitle] = useState(lead ? `${lead.company ?? lead.name} - Automation retainer` : "");
  const [scope, setScope] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [timeline, setTimeline] = useState("");
  const [pricing, setPricing] = useState("");
  const [terms, setTerms] = useState("");

  return (
    <form className="grid gap-4" onSubmit={(event) => {
      event.preventDefault();
      if (!lead || !title.trim() || !scope.trim()) return;
      onSubmit({
        crmLeadId: lead.id,
        title: title.trim(),
        scope: scope.trim(),
        deliverables: deliverables.trim() || null,
        timeline: timeline.trim() || null,
        pricing: pricing.trim() || null,
        terms: terms.trim() || null,
      });
    }}>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="proposal-title">Title
        <Input id="proposal-title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={500} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="proposal-scope">Scope
        <Textarea id="proposal-scope" rows={4} value={scope} onChange={(event) => setScope(event.target.value)} placeholder="What we will deliver…" required />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="proposal-deliverables">Deliverables
          <Textarea id="proposal-deliverables" rows={3} value={deliverables} onChange={(event) => setDeliverables(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="proposal-timeline">Timeline
          <Textarea id="proposal-timeline" rows={3} value={timeline} onChange={(event) => setTimeline(event.target.value)} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="proposal-pricing">Pricing
          <Textarea id="proposal-pricing" rows={2} value={pricing} onChange={(event) => setPricing(event.target.value)} placeholder="$2,400/month, 3-month initial term" />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="proposal-terms">Terms
          <Textarea id="proposal-terms" rows={2} value={terms} onChange={(event) => setTerms(event.target.value)} />
        </label>
      </div>
      <div className="sticky bottom-0 -mx-6 mt-1 flex items-center justify-end gap-2 border-t border-[#2A2E45] bg-[#0C1020] px-6 pt-3 pb-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending || !title.trim() || !scope.trim()}>Create draft</Button>
      </div>
    </form>
  );
}
