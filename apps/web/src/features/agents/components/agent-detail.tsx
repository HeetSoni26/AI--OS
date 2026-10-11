"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AGENT_RUN_STATUS_LABELS,
  AGENT_TRIGGER_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  AGENT_TYPE_LABELS,
  MEMORY_KIND_LABELS,
  type AgentRunStatus,
} from "@aios/contracts";
import { Check, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { Button, Card, CardContent, Dialog, Empty, Input, Skeleton, Tab, TabPanel, Tabs, TabsList, Textarea, useAnnounce } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { AgentStatusBadge } from "./agent-status-badge";
import { agentApi, type AgentDetailDto } from "../lib/agent-api";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

const RUN_STATUS_STYLES: Record<AgentRunStatus, string> = {
  success: "text-[#39FF14]",
  failed: "text-[#FF4D6D]",
  timeout: "text-orange-300",
  running: "text-cyan-300",
  queued: "text-[#888]",
  cancelled: "text-[#888]",
};

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

export function AgentDetail({
  agentId,
  onEdit,
}: {
  agentId: string;
  onEdit: (agent: AgentDetailDto) => void;
}) {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [runOpen, setRunOpen] = useState(false);
  const [runInput, setRunInput] = useState("");

  const detail = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => agentApi.detail(agentId),
  });
  const runsActive = useMemo(
    () => detail.data?.status === "running" || detail.data?.recentRuns.some((run) => run.status === "queued" || run.status === "running"),
    [detail.data],
  );
  const approvals = useQuery({
    queryKey: ["agent-approvals", agentId],
    queryFn: () => agentApi.approvals(25),
    refetchInterval: runsActive ? 2_500 : false,
  });
  const pendingApprovals = useMemo(
    () => (approvals.data?.items ?? []).filter((approval) => approval.status === "pending" && approval.agentId === agentId),
    [approvals.data, agentId],
  );

  const invalidate = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["agent", agentId] }),
      cache.invalidateQueries({ queryKey: ["agents"] }),
      cache.invalidateQueries({ queryKey: ["agent-approvals", agentId] }),
    ]);
  };

  const run = useMutation({
    mutationFn: (inputText: string) => agentApi.run(agentId, inputText),
    onSuccess: async (result) => {
      setRunOpen(false);
      setRunInput("");
      const message = result.metadata && result.metadata.awaitingApproval === true
        ? "Run queued and waiting for your approval."
        : "Run dispatched. It will start within seconds.";
      announce(message);
      await invalidate();
    },
  });
  const pause = useMutation({
    mutationFn: () => agentApi.pause(agentId),
    onSuccess: async () => {
      announce("Agent paused. Queued runs were cancelled.");
      await invalidate();
    },
  });
  const resume = useMutation({
    mutationFn: () => agentApi.resume(agentId),
    onSuccess: async () => {
      announce("Agent resumed.");
      await invalidate();
    },
  });
  const decide = useMutation({
    mutationFn: ({ approvalId, decision, payloadHash }: { approvalId: string; decision: "approve" | "reject"; payloadHash: string }) =>
      agentApi.decideApproval(approvalId, decision, payloadHash),
    onSuccess: async () => {
      announce("Approval recorded.");
      await invalidate();
    },
  });

  const agent = detail.data;

  return (
    <div className="grid gap-5">
      {detail.isLoading ? (
        <div role="status" className="grid gap-3"><span className="sr-only">Loading agent…</span><Skeleton className="h-24" /><Skeleton className="h-40" /></div>
      ) : detail.isError ? (
        <Empty title="Agent could not be loaded" description={errorMessage(detail.error, "Retry the request.")} action={<Button onClick={() => detail.refetch()}>Retry</Button>} />
      ) : !agent ? null : (
        <>
          <div className="grid gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-[#F3F5FF]">{agent.name}</h2>
                  <AgentStatusBadge status={agent.status} />
                </div>
                <p className="mt-1 text-xs text-[#888]">{agent.description ?? "No description."}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => setRunOpen(true)} disabled={agent.status === "paused" || agent.archivedAt != null}>
                  <Play className="size-3.5" aria-hidden="true" />Run
                </Button>
                {agent.status === "paused" ? (
                  <Button size="sm" variant="secondary" onClick={() => resume.mutate()} disabled={resume.isPending}>Resume</Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => pause.mutate()} disabled={pause.isPending || agent.archivedAt != null}>Pause</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => onEdit(agent)} disabled={agent.archivedAt != null}>
                  <Pencil className="size-3.5" aria-hidden="true" />Edit
                </Button>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3">
                <dt className="text-[10px] uppercase tracking-wide text-[#666]">Total runs</dt>
                <dd className="mt-1 font-mono text-sm text-cyan-200">{agent.totalRuns}</dd>
              </div>
              <div className="rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3">
                <dt className="text-[10px] uppercase tracking-wide text-[#666]">Success rate</dt>
                <dd className="mt-1 font-mono text-sm text-[#39FF14]">{agent.totalRuns > 0 ? `${agent.successRate.toFixed(1)}%` : "-"}</dd>
              </div>
              <div className="rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3">
                <dt className="text-[10px] uppercase tracking-wide text-[#666]">Total cost</dt>
                <dd className="mt-1 font-mono text-sm text-cyan-200">{currency.format(agent.totalCostUsd)}</dd>
              </div>
              <div className="rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3">
                <dt className="text-[10px] uppercase tracking-wide text-[#666]">Last run</dt>
                <dd className="mt-1 text-xs text-[#C5C8DB]">{agent.lastRunAt ? dateTime.format(new Date(agent.lastRunAt)) : "Never"}</dd>
              </div>
            </dl>
            {agent.dailyTokenBudget != null ? (
              <div className="rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#888]">Daily token budget</span>
                  <span className={agent.tokensUsedToday >= agent.dailyTokenBudget ? "text-[#FF4D6D]" : "text-[#C5C8DB]"}>
                    {agent.tokensUsedToday.toLocaleString()} / {agent.dailyTokenBudget.toLocaleString()} today
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#171B3D]">
                  <div
                    className={agent.tokensUsedToday >= agent.dailyTokenBudget ? "h-full rounded-full bg-[#FF4D6D]" : "h-full rounded-full bg-cyan-300"}
                    style={{ width: `${Math.min(100, (agent.tokensUsedToday / agent.dailyTokenBudget) * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
            {run.error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-3 py-2 text-xs text-red-200">{errorMessage(run.error, "The run could not be dispatched.")}</p> : null}
            {pause.error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-3 py-2 text-xs text-red-200">{errorMessage(pause.error, "The agent could not be paused.")}</p> : null}
          </div>

          {pendingApprovals.length ? (
            <section aria-labelledby="agent-approvals-heading" className="grid gap-2">
              <h3 id="agent-approvals-heading" className="text-xs font-semibold uppercase tracking-wide text-orange-300">Approvals waiting ({pendingApprovals.length})</h3>
              {pendingApprovals.map((approval) => (
                <Card key={approval.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#C5C8DB]">Agent run checkpoint · requested {dateTime.format(new Date(approval.requestedAt))}</p>
                      <p className="mt-1 text-[10px] text-[#666]">Runs stay paused until you approve. Rejecting fails the run.</p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => decide.mutate({ approvalId: approval.id, decision: "approve", payloadHash: approval.payloadHash })} disabled={decide.isPending}>
                        <Check className="size-3.5" aria-hidden="true" />Approve
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => decide.mutate({ approvalId: approval.id, decision: "reject", payloadHash: approval.payloadHash })} disabled={decide.isPending}>
                        <X className="size-3.5" aria-hidden="true" />Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>
          ) : null}

          <Tabs defaultValue="runs">
            <TabsList className="surface-scrollbar mb-4 flex gap-1 overflow-x-auto border-b border-[#2A2E45]">
              <Tab value="runs">Runs</Tab>
              <Tab value="memory">Memory ({agent.memoryCount})</Tab>
              <Tab value="config">Configuration</Tab>
            </TabsList>

            <TabPanel value="runs">
              <AgentRunsPanel agentId={agentId} agent={agent} polling={Boolean(runsActive)} />
            </TabPanel>
            <TabPanel value="memory">
              <AgentMemoryPanel agentId={agentId} memoryEnabled={agent.settings.memoryEnabled} />
            </TabPanel>
            <TabPanel value="config">
              <AgentConfigPanel agent={agent} />
            </TabPanel>
          </Tabs>
        </>
      )}

      <Dialog open={runOpen} onClose={() => setRunOpen(false)} title={`Run ${agent?.name ?? "agent"}`} description="Give the agent a task for this run, or leave it empty to follow the standing prompt.">
        <div className="grid gap-3">
          <Textarea rows={4} value={runInput} onChange={(event) => setRunInput(event.target.value)} placeholder="Optional task or question for this run…" />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-[#666]">{agent?.settings.approvalRequired ? "This agent pauses for your approval before executing." : "Runs start within seconds."}</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setRunOpen(false)}>Cancel</Button>
              <Button onClick={() => run.mutate(runInput)} disabled={run.isPending}>
                <Play className="size-3.5" aria-hidden="true" />Run now
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function AgentRunsPanel({ agentId, agent, polling }: { agentId: string; agent: AgentDetailDto; polling: boolean }) {
  const runs = useQuery({
    queryKey: ["agent-runs", agentId],
    queryFn: () => agentApi.runs({ agentId, limit: 20 }),
    refetchInterval: polling ? 2_500 : false,
  });
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  if (runs.isLoading) return <div role="status" className="grid gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;
  const items = runs.data?.items ?? agent.recentRuns;
  if (!items.length) {
    return <Empty title="No runs yet" description="Click Run to dispatch the first execution of this agent." />;
  }
  return (
    <ul className="grid gap-2" aria-label="Recent runs">
      {items.map((run) => (
        <li key={run.id}>
          <button
            type="button"
            className="w-full rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3 text-left transition-colors hover:border-cyan-300/30"
            aria-expanded={expandedRun === run.id}
            onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold uppercase tracking-wide ${RUN_STATUS_STYLES[run.status as AgentRunStatus] ?? "text-[#C5C8DB]"}`}>
                  {AGENT_RUN_STATUS_LABELS[run.status as AgentRunStatus]}
                </span>
                <span className="text-[10px] text-[#666]">{AGENT_TRIGGER_TYPE_LABELS[run.triggerType]}{run.attempt > 1 ? ` · attempt ${run.attempt}` : ""}</span>
              </div>
              <span className="text-[10px] text-[#666]">{run.createdAt ? dateTime.format(new Date(run.createdAt)) : ""}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#888]">
              <span>{run.tokensInput + run.tokensOutput} tokens</span>
              <span>{currency.format(run.costUsd)}</span>
              {run.durationMs != null ? <span>{(run.durationMs / 1000).toFixed(1)}s</span> : null}
              {run.metadata?.simulated === true ? <span className="text-purple-300">simulated</span> : null}
            </div>
            {run.errorMessage ? <p className="mt-2 rounded-lg border border-[#FF4D6D]/20 bg-[#FF4D6D]/[0.06] px-2 py-1 text-[11px] text-red-200">{run.errorMessage}</p> : null}
            {expandedRun === run.id ? (
              <div className="mt-3 grid gap-2 border-t border-[#2A2E45] pt-3">
                {run.inputText ? (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[#666]">Input</p>
                    <pre className="surface-scrollbar mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-[#111533] p-2 font-mono text-[11px] text-[#C5C8DB]">{run.inputText}</pre>
                  </div>
                ) : null}
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[#666]">{run.outputText ? "Output" : "Partial output"}</p>
                  <pre className="surface-scrollbar mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-[#111533] p-2 font-mono text-[11px] text-[#C5C8DB]">{run.outputText ?? run.partialOutput ?? "-"}</pre>
                </div>
              </div>
            ) : run.outputText ? (
              <p className="mt-2 line-clamp-2 text-[11px] text-[#888]">{run.outputText.replace(/\s+/g, " ")}</p>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function AgentMemoryPanel({ agentId, memoryEnabled }: { agentId: string; memoryEnabled: boolean }) {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const memory = useQuery({ queryKey: ["agent-memory", agentId], queryFn: () => agentApi.memory(agentId) });
  const [newOpen, setNewOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const invalidate = () => cache.invalidateQueries({ queryKey: ["agent-memory", agentId] }).then(() => cache.invalidateQueries({ queryKey: ["agent", agentId] }));

  const create = useMutation({
    mutationFn: () => agentApi.createMemory(agentId, { kind: "key_value", key: newKey.trim() || null, value: newValue }),
    onSuccess: async () => {
      setNewOpen(false);
      setNewKey("");
      setNewValue("");
      announce("Memory saved.");
      await invalidate();
    },
  });
  const update = useMutation({
    mutationFn: (input: { memoryId: string; value: string }) => agentApi.updateMemory(agentId, input.memoryId, { value: input.value }),
    onSuccess: async () => {
      setEditingId(null);
      announce("Memory updated.");
      await invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (memoryId: string) => agentApi.deleteMemory(agentId, memoryId),
    onSuccess: async () => {
      announce("Memory deleted.");
      await invalidate();
    },
  });

  return (
    <div className="grid gap-3">
      {!memoryEnabled ? (
        <p className="rounded-lg border border-orange-300/20 bg-orange-300/[0.06] px-3 py-2 text-xs text-orange-200">Memory is disabled for this agent - runs will not read or write memories.</p>
      ) : null}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => setNewOpen((open) => !open)}>
          <Plus className="size-3.5" aria-hidden="true" />Add memory
        </Button>
      </div>
      {newOpen ? (
        <Card>
          <CardContent className="grid gap-2">
            <Input value={newKey} onChange={(event) => setNewKey(event.target.value)} placeholder="Key (optional) - e.g. tone_preference" maxLength={255} />
            <Textarea rows={3} value={newValue} onChange={(event) => setNewValue(event.target.value)} placeholder="What the agent should remember…" />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !newValue.trim()}>Save memory</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {memory.isLoading ? (
        <div role="status" className="grid gap-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : !memory.data?.items.length ? (
        <Empty title="No memories" description="Approved learnings and run outputs appear here once the agent has memory to inspect." />
      ) : (
        <ul className="grid gap-2" aria-label="Agent memories">
          {memory.data.items.map((item) => (
            <li key={item.id} className="rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide text-[#666]">
                  {MEMORY_KIND_LABELS[item.kind]}{item.key ? ` · ${item.key}` : ""} · v{item.version}
                  {item.sourceRunId ? " · from run" : ""}
                </span>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" aria-label={editingId === item.id ? "Cancel editing" : "Edit memory"} onClick={() => { setEditingId(editingId === item.id ? null : item.id); setEditValue(item.value); }}>
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Delete memory" onClick={() => remove.mutate(item.id)}>
                    <Trash2 className="size-3.5 text-[#FF4D6D]" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {editingId === item.id ? (
                <div className="mt-2 grid gap-2">
                  <Textarea rows={3} value={editValue} onChange={(event) => setEditValue(event.target.value)} />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button size="sm" onClick={() => update.mutate({ memoryId: item.id, value: editValue })} disabled={update.isPending}>Save</Button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[#C5C8DB]">{item.value}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AgentConfigPanel({ agent }: { agent: AgentDetailDto }) {
  return (
    <div className="grid gap-4">
      <dl className="grid gap-2 rounded-xl border border-[#2A2E45] bg-[#0C1020] p-4 text-xs sm:grid-cols-2">
        <div className="flex justify-between gap-2"><dt className="text-[#888]">Type</dt><dd className="text-[#C5C8DB]">{AGENT_TYPE_LABELS[agent.type]}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-[#888]">Model</dt><dd className="font-mono text-cyan-200">{agent.model}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-[#888]">Trigger</dt><dd className="text-[#C5C8DB]">{AGENT_TRIGGER_TYPE_LABELS[agent.trigger.type]}{agent.trigger.cronExpression ? ` (${agent.trigger.cronExpression})` : ""}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-[#888]">Approval checkpoint</dt><dd className={agent.settings.approvalRequired ? "text-orange-300" : "text-[#C5C8DB]"}>{agent.settings.approvalRequired ? "Required" : "Off"}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-[#888]">Temperature</dt><dd className="font-mono text-[#C5C8DB]">{agent.temperature}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-[#888]">Max tokens</dt><dd className="font-mono text-[#C5C8DB]">{agent.maxTokens}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-[#888]">Tools</dt><dd className="text-[#C5C8DB]">{agent.tools.filter((tool) => tool.enabled).map((tool) => tool.id).join(", ") || "None"}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-[#888]">Assigned clients</dt><dd className="text-[#C5C8DB]">{agent.clientIds.length || "None"}</dd></div>
      </dl>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#C5C8DB]">System prompt (current version)</h4>
        <pre className="surface-scrollbar mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-[#2A2E45] bg-[#111533] p-3 font-mono text-[11px] leading-5 text-[#C5C8DB]">{agent.systemPrompt}</pre>
      </div>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#C5C8DB]">Configuration history</h4>
        <ol className="mt-2 grid gap-1.5">
          {[...agent.configVersions].sort((a, b) => b.version - a.version).map((version) => (
            <li key={version.version} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2A2E45] px-3 py-2 text-[11px]">
              <span className="text-[#C5C8DB]">v{version.version} · <span className="font-mono text-cyan-200">{version.model}</span> · {version.changeSummary ?? "-"}</span>
              <span className="text-[10px] text-[#666]">{version.createdAt ? dateTime.format(new Date(version.createdAt)) : ""}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="grid gap-1 rounded-xl border border-[#2A2E45] bg-[#0C1020] p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#C5C8DB]">Approval audit</h4>
        <p className="mt-1 text-[10px] leading-4 text-[#666]">Pending runs pause at checkpoints. Approve or reject them from the approvals card. {APPROVAL_STATUS_LABELS.pending} approvals expire when the configuration changes.</p>
      </div>
    </div>
  );
}
