"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Workflow as WorkflowIcon } from "lucide-react";
import { Button, Card, CardContent, Dialog, Drawer, Empty, Input, Select, Skeleton, Textarea, useAnnounce } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { clientApi } from "@/features/clients/lib/client-api";
import { WorkflowDetail } from "./workflow-detail";
import { workflowApi, type WorkflowUpsertInput } from "../lib/workflow-api";

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

const TEMPLATES: Array<{ label: string; name: string; description: string; humanPlan: string; blueprint: WorkflowUpsertInput["blueprint"] }> = [
  {
    label: "Lead follow-up",
    name: "Lead Follow-up",
    description: "Sends a follow-up email two days after a new lead arrives.",
    humanPlan: "1. Webhook receives the lead-captured event.\n2. A two-day wait node delays the follow-up.\n3. An email node sends the approved follow-up template.\n4. Failures alert the owner.",
    blueprint: {
      trigger: "webhook_lead_captured",
      nodes: [
        { id: "webhook_lead_captured", type: "webhook", name: "Lead captured", parameters: {} },
        { id: "wait_2_days", type: "wait", name: "Wait 2 days", parameters: { amount: "2 days" } },
        { id: "send_followup", type: "email_send", name: "Send follow-up", parameters: { template: "lead_followup_v1" } },
      ],
      connections: [
        { from: "webhook_lead_captured", to: "wait_2_days" },
        { from: "wait_2_days", to: "send_followup" },
      ],
    },
  },
  {
    label: "Invoice reminder",
    name: "Invoice Reminder",
    description: "Reminds clients about overdue invoices every morning.",
    humanPlan: "1. Cron triggers each morning at 9am UTC.\n2. Query overdue invoices.\n3. Email a reminder per invoice.\n4. Owner is notified on failure.",
    blueprint: {
      trigger: "cron_daily_9am",
      nodes: [
        { id: "cron_daily_9am", type: "cron", name: "Every day 9am", parameters: { cron: "0 9 * * *" } },
        { id: "fetch_overdue", type: "api_call", name: "Fetch overdue invoices", parameters: { endpoint: "/api/v1/finance/invoices?status=overdue" } },
        { id: "send_reminder", type: "email_send", name: "Send reminder", parameters: { template: "invoice_reminder_v1" } },
      ],
      connections: [
        { from: "cron_daily_9am", to: "fetch_overdue" },
        { from: "fetch_overdue", to: "send_reminder" },
      ],
    },
  },
  {
    label: "Blank workflow",
    name: "Custom Workflow",
    description: "Describe the automation and edit the blueprint JSON.",
    humanPlan: "1. Describe each step in order.\n2. Note the trigger and expected output.\n3. Note failure behavior.",
    blueprint: {
      trigger: "manual_trigger",
      nodes: [{ id: "manual_trigger", type: "manual", name: "Manual trigger", parameters: {} }],
      connections: [],
    },
  },
];

export function WorkflowsWorkspace() {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  const workflows = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowApi.list(),
  });
  const clients = useQuery({
    queryKey: ["workflows-clients"],
    queryFn: () => clientApi.list({ limit: 100, archiveScope: "active", sort: "name", direction: "asc", view: "list" }),
    staleTime: 60_000,
  });

  const invalidate = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["workflows"] }),
      cache.invalidateQueries({ queryKey: ["workflow"] }),
    ]);
  };

  const create = useMutation({
    mutationFn: (input: WorkflowUpsertInput) => workflowApi.create(input),
    onSuccess: async (workflow) => {
      setCreateOpen(false);
      setSelectedId(workflow.id);
      setFeedback(`${workflow.name} was created as a draft. Run a sandbox test, then activate it.`);
      announce(`${workflow.name} was created.`);
      await invalidate();
    },
  });

  const stats = useMemo(() => {
    const items = workflows.data?.items ?? [];
    return {
      count: items.length,
      active: items.filter((workflow) => workflow.status === "active").length,
      failing: items.filter((workflow) => workflow.latestValidation && !workflow.latestValidation.valid).length,
    };
  }, [workflows.data]);

  const clientOptions = useMemo(
    () => (clients.data?.items ?? []).map((client) => ({ id: client.id, name: client.name })),
    [clients.data],
  );

  return (
    <div className="grid gap-6">
      <header className="flex flex-col justify-between gap-4 border-b border-[#2A2E45] pb-6 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-purple-300">/ workflow automation</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#F3F5FF] sm:text-3xl">Automations</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#888]">Turn automation requests into validated, owner-approved, tested n8n or Make workflows - with version history, health, and provider events.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New workflow</Button>
      </header>

      {feedback ? <p role="status" className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3 text-xs text-cyan-100">{feedback}</p> : null}
      {create.error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-4 py-3 text-xs text-red-200">{errorMessage(create.error, "The workflow could not be created.")}</p> : null}

      <section aria-label="Workflow summary" className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Workflows</p><p className="mt-1 font-mono text-xl text-[#F3F5FF]">{stats.count}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Active</p><p className="mt-1 font-mono text-xl text-[#39FF14]">{stats.active}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Failing validation</p><p className="mt-1 font-mono text-xl text-[#FF4D6D]">{stats.failing}</p></CardContent></Card>
      </section>

      <section aria-labelledby="workflow-results-heading" aria-busy={workflows.isLoading || workflows.isFetching}>
        <h2 id="workflow-results-heading" className="sr-only">Workflow results</h2>
        {workflows.isLoading ? (
          <div role="status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><span className="sr-only">Loading workflows…</span><Skeleton className="h-36" /><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
        ) : workflows.isError ? (
          <Empty title="Workflows could not be loaded" description={errorMessage(workflows.error, "Retry the request.")} action={<Button onClick={() => workflows.refetch()}>Retry</Button>} />
        ) : !workflows.data?.items.length ? (
          <Empty
            title="No workflows yet"
            description="Start from a template (lead follow-up, invoice reminder) or describe your own automation - validate, test, and activate it."
            action={<Button onClick={() => setCreateOpen(true)}>New workflow</Button>}
            icon={<WorkflowIcon className="size-5 text-purple-300" aria-hidden="true" />}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="workflow-cards">
            {workflows.data.items.map((workflow) => (
              <Card key={workflow.id} className="h-full transition-colors hover:border-purple-300/40">
                <CardContent className="grid h-full gap-3">
                  <button type="button" className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60" onClick={() => setSelectedId(workflow.id)} aria-label={`Open ${workflow.name}`}>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-medium text-[#F3F5FF]">{workflow.name}</h3>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2A2E45] bg-[#0C1020] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                        <span className={`size-1.5 rounded-full ${workflow.status === "active" ? "bg-[#39FF14]" : workflow.status === "paused" ? "bg-[#888]" : "bg-amber-300"}`} aria-hidden="true" />
                        <span className={workflow.status === "active" ? "text-[#39FF14]" : "text-[#C5C8DB]"}>{workflow.status.replaceAll("_", " ")}</span>
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-purple-300">{workflow.clientName} · {workflow.provider}</p>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#888]">{workflow.description ?? "No description."}</p>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div><dt className="text-[10px] uppercase text-[#888]">Runs</dt><dd className="mt-0.5 font-mono text-[#C5C8DB]">{workflow.totalExecutions}</dd></div>
                      <div><dt className="text-[10px] uppercase text-[#888]">Success</dt><dd className="mt-0.5 font-mono text-[#39FF14]">{workflow.totalExecutions > 0 ? `${workflow.successRate.toFixed(0)}%` : "-"}</dd></div>
                      <div><dt className="text-[10px] uppercase text-[#888]">Version</dt><dd className="mt-0.5 font-mono text-cyan-200">v{workflow.currentVersion ?? 1}</dd></div>
                    </dl>
                  </button>
                  <div className="mt-auto flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(workflow.id)}>Open</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New workflow" description="Start from a template, describe the plan, and validate the blueprint.">
        <WorkflowForm
          clients={clientOptions}
          pending={create.isPending}
          error={create.error ? errorMessage(create.error, "The workflow could not be saved.") : undefined}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(input) => create.mutate(input)}
        />
      </Dialog>

      <Drawer open={Boolean(selectedId)} onClose={() => setSelectedId(null)} title="Workflow details" description="Blueprint, validation, versions, executions, and lifecycle.">
        {selectedId ? <WorkflowDetail workflowId={selectedId} onFeedback={setFeedback} /> : null}
      </Drawer>
    </div>
  );
}

function WorkflowForm({
  clients,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  clients: ReadonlyArray<{ id: string; name: string }>;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (input: WorkflowUpsertInput) => void;
}) {
  const [templateIndex, setTemplateIndex] = useState(0);
  const template = TEMPLATES[templateIndex]!;
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [provider, setProvider] = useState<WorkflowUpsertInput["provider"]>("n8n");
  const [humanPlan, setHumanPlan] = useState(template.humanPlan);
  const [blueprintText, setBlueprintText] = useState(JSON.stringify(template.blueprint, null, 2));
  const [parseError, setParseError] = useState("");

  const applyTemplate = (index: number) => {
    setTemplateIndex(index);
    const selected = TEMPLATES[index]!;
    setName(selected.name);
    setDescription(selected.description);
    setHumanPlan(selected.humanPlan);
    setBlueprintText(JSON.stringify(selected.blueprint, null, 2));
    setParseError("");
  };

  const submit = () => {
    let blueprint: WorkflowUpsertInput["blueprint"];
    try {
      blueprint = JSON.parse(blueprintText) as WorkflowUpsertInput["blueprint"];
    } catch {
      setParseError("The blueprint JSON is invalid.");
      return;
    }
    if (!clientId || !name.trim() || !humanPlan.trim()) return;
    onSubmit({
      clientId,
      name: name.trim(),
      description: description?.trim() || null,
      provider,
      blueprint,
      humanPlan: humanPlan.trim(),
      assumptions: [],
    });
  };

  return (
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      <fieldset className="grid gap-2">
        <legend className="text-xs font-medium text-[#C5C8DB]">Template</legend>
        <div className="flex flex-wrap gap-1">
          {TEMPLATES.map((entry, index) => (
            <Button key={entry.label} type="button" size="sm" variant={templateIndex === index ? "secondary" : "ghost"} aria-pressed={templateIndex === index} onClick={() => applyTemplate(index)}>{entry.label}</Button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="workflow-client">Client
          <Select id="workflow-client" value={clientId} onChange={(event) => setClientId(event.target.value)} required>
            <option value="">Choose a client…</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </Select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="workflow-provider">Provider
          <Select id="workflow-provider" value={provider} onChange={(event) => setProvider(event.target.value as WorkflowUpsertInput["provider"])}>
            <option value="n8n">n8n</option>
            <option value="make">Make.com</option>
          </Select>
        </label>
      </div>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="workflow-name">Name
        <Input id="workflow-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={255} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="workflow-description">Description
        <Input id="workflow-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="workflow-plan">Human plan <span className="text-[#666]">(each step in order, failure behavior)</span>
        <Textarea id="workflow-plan" rows={4} value={humanPlan} onChange={(event) => setHumanPlan(event.target.value)} required />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="workflow-blueprint">Blueprint JSON
        <Textarea id="workflow-blueprint" rows={8} className="font-mono text-[11px]" value={blueprintText} onChange={(event) => { setBlueprintText(event.target.value); setParseError(""); }} />
        {parseError ? <p role="alert" className="text-xs text-red-300">{parseError}</p> : null}
      </label>
      <div className="sticky bottom-0 -mx-6 mt-1 flex items-center justify-end gap-2 border-t border-[#2A2E45] bg-[#0C1020] px-6 pt-3 pb-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending || !clientId || !name.trim() || !humanPlan.trim()}>Create workflow</Button>
      </div>
    </form>
  );
}
