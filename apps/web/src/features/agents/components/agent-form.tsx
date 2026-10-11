"use client";

import { useMemo, useState } from "react";
import { AGENT_TYPE_LABELS, agentTypes, type AgentType } from "@aios/contracts";
import { ChevronDown, Wand2 } from "lucide-react";
import { Button, FormField, Input, Select, Textarea } from "@/components/ui";
import type { AgentDetailDto, AgentTriggerType, AgentUpsertInput } from "../lib/agent-api";

const MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o mini · fast & cheap" },
  { value: "gpt-4o", label: "GPT-4o · balanced flagship" },
  { value: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet · balanced" },
  { value: "claude-4", label: "Claude 4 · strongest" },
] as const;

const TOOLS = [
  { id: "web_search", label: "Web Search", risk: "safe" },
  { id: "file_read", label: "File Read", risk: "safe" },
  { id: "file_write", label: "File Write", risk: "elevated" },
  { id: "code_execute", label: "Code Execute", risk: "elevated" },
  { id: "api_call", label: "API Call", risk: "consequential" },
  { id: "email_send", label: "Email Send", risk: "consequential" },
] as const;

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at 9am", value: "0 9 * * *" },
  { label: "Every Monday 9am", value: "0 9 * * 1" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
];

const PROMPT_PRESETS: Partial<Record<AgentType, string>> = {
  custom: `You are a focused AI operator for the agency. Approach every task step by step, verify assumptions, and end with a clear summary of results and next actions.`,
  content_writer: `You are the agency content writer. Write clear, on-brand copy. Structure output with a title, body, and suggested call to action. Match the client's tone when context is provided.`,
  lead_generator: `You are the agency lead researcher. Given a target profile, produce qualified leads with company, role, reason to reach out, and a suggested first message. Never invent unverifiable contact details.`,
  invoice_chaser: `You are the agency invoice chaser. Draft polite, escalating reminder emails for overdue invoices. Reference the invoice number and due date, and propose the next step.`,
  reporter: `You are the agency weekly reporter. Summarize project progress, risks, wins, and financial movements into a concise owner briefing with sections: Highlights, Risks, Numbers, Next week.`,
  analyst: `You are the agency research analyst. Analyze the provided input, surface insights with evidence, flag uncertainties, and end with 3 recommended actions.`,
};

export interface AgentFormSubmitResult {
  ok: boolean;
  error?: string;
}

export function AgentForm({
  mode,
  initial,
  clients,
  agents,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  initial?: AgentDetailDto;
  clients: ReadonlyArray<{ id: string; name: string }>;
  agents: ReadonlyArray<{ id: string; name: string }>;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (input: AgentUpsertInput) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState<AgentType>((initial?.type as AgentType) ?? "custom");
  const [model, setModel] = useState(initial?.model ?? "gpt-4o-mini");
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? PROMPT_PRESETS.custom ?? "");
  const [triggerType, setTriggerType] = useState<AgentTriggerType>(initial?.trigger.type ?? "manual");
  const [cronExpression, setCronExpression] = useState(initial?.trigger.cronExpression ?? "0 9 * * *");
  const [webhookPath, setWebhookPath] = useState(initial?.trigger.webhookPath ?? "");
  const [chainParentAgentId, setChainParentAgentId] = useState(initial?.trigger.chainParentAgentId ?? "");
  const [dailyTokenBudget, setDailyTokenBudget] = useState(initial?.dailyTokenBudget != null ? String(initial.dailyTokenBudget) : "");
  const [selectedTools, setSelectedTools] = useState<ReadonlySet<string>>(
    new Set((initial?.tools ?? []).filter((tool) => tool.enabled).map((tool) => tool.id)),
  );
  const [approvalRequired, setApprovalRequired] = useState(initial?.settings.approvalRequired ?? false);
  const [memoryEnabled, setMemoryEnabled] = useState(initial?.settings.memoryEnabled ?? true);
  const [clientIds, setClientIds] = useState<ReadonlySet<string>>(new Set(initial?.clientIds ?? []));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [temperature, setTemperature] = useState(String(initial?.temperature ?? 0.7));
  const [maxTokens, setMaxTokens] = useState(String(initial?.maxTokens ?? 4096));
  const [topP, setTopP] = useState(String(initial?.topP ?? 1));
  const [frequencyPenalty, setFrequencyPenalty] = useState(String(initial?.frequencyPenalty ?? 0));

  const promptPreset = useMemo(() => PROMPT_PRESETS[type], [type]);
  const budgetNumber = dailyTokenBudget.trim() ? Number(dailyTokenBudget) : null;

  const toggleTool = (id: string) => {
    setSelectedTools((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleClient = (id: string) => {
    setClientIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = () => {
    const trigger = {
      type: triggerType,
      cronExpression: triggerType === "scheduled" ? cronExpression.trim() : null,
      eventFilters: [] as string[],
      webhookPath: triggerType === "webhook" ? webhookPath.trim() || null : null,
      chainParentAgentId: triggerType === "chain" ? chainParentAgentId || null : null,
    };
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      type,
      modelParameters: {
        model,
        temperature: Number(temperature) || 0,
        maxTokens: Math.max(1, Math.round(Number(maxTokens) || 4096)),
        topP: Number(topP) || 1,
        frequencyPenalty: Number(frequencyPenalty) || 0,
      },
      systemPrompt: systemPrompt.trim(),
      tools: TOOLS.map((tool) => ({
        id: tool.id,
        type: tool.id,
        config: {},
        enabled: selectedTools.has(tool.id),
      })),
      trigger,
      dailyTokenBudget: budgetNumber != null && Number.isFinite(budgetNumber) && budgetNumber > 0 ? Math.round(budgetNumber) : null,
      clientIds: [...clientIds],
      approvalRequired,
      memoryEnabled,
    });
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="agent-name" label="Name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Weekly Reporter" maxLength={255} required />
        </FormField>
        <FormField id="agent-type" label="Type">
          <Select value={type} onChange={(event) => setType(event.target.value as AgentType)}>
            {agentTypes.map((agentType) => (
              <option key={agentType} value={agentType}>{AGENT_TYPE_LABELS[agentType]}</option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField id="agent-description" label="Description" hint="What this agent does for the agency.">
        <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Summarizes delivery, finance, and pipeline every week." maxLength={2000} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="agent-model" label="Model" required>
          <Select value={model} onChange={(event) => setModel(event.target.value)}>
            {MODELS.map((entry) => (
              <option key={entry.value} value={entry.value}>{entry.label}</option>
            ))}
          </Select>
        </FormField>
        <FormField id="agent-budget" label="Daily token budget" hint="Optional. Blocks new runs once reached.">
          <Input type="number" min={1} value={dailyTokenBudget} onChange={(event) => setDailyTokenBudget(event.target.value)} placeholder="No limit" />
        </FormField>
      </div>

      <FormField
        id="agent-prompt"
        label="System prompt"
        required
        hint={
          promptPreset && systemPrompt !== promptPreset ? (
            <button type="button" className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200" onClick={() => setSystemPrompt(promptPreset)}>
              <Wand2 className="size-3" aria-hidden="true" /> Use the {AGENT_TYPE_LABELS[type]} starter prompt
            </button>
          ) : undefined
        }
      >
        <Textarea
          rows={6}
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
          placeholder="Write the agent's operating instructions…"
          required
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="agent-trigger" label="Trigger">
          <Select value={triggerType} onChange={(event) => setTriggerType(event.target.value as AgentTriggerType)}>
            <option value="manual">Manual - run when I click</option>
            <option value="scheduled">Scheduled - cron</option>
            <option value="webhook">Webhook - external call</option>
            <option value="chain">Chained - after another agent</option>
            <option value="event">Event - system event</option>
          </Select>
        </FormField>
        {triggerType === "scheduled" ? (
          <FormField id="agent-cron" label="Cron schedule" hint="Minute Hour Day Month Weekday (UTC)." required>
            <div className="grid gap-2">
              <Input value={cronExpression} onChange={(event) => setCronExpression(event.target.value)} placeholder="0 9 * * *" required />
              <div className="flex flex-wrap gap-1">
                {CRON_PRESETS.map((preset) => (
                  <Button key={preset.value} type="button" variant={cronExpression === preset.value ? "secondary" : "ghost"} size="sm" onClick={() => setCronExpression(preset.value)}>
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          </FormField>
        ) : null}
        {triggerType === "webhook" ? (
          <FormField id="agent-webhook" label="Webhook path" hint="POST /api/v1/webhooks + this path." required>
            <Input value={webhookPath} onChange={(event) => setWebhookPath(event.target.value)} placeholder="lead-captured" required />
          </FormField>
        ) : null}
        {triggerType === "chain" ? (
          <FormField id="agent-parent" label="Runs after" required>
            <Select value={chainParentAgentId} onChange={(event) => setChainParentAgentId(event.target.value)} required>
              <option value="">Choose a parent agent…</option>
              {agents.filter((agent) => agent.id !== initial?.id).map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </Select>
          </FormField>
        ) : null}
      </div>

      <FormField id="agent-tools" label="Tools" hint="Consequential tools require your approval before executing.">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Agent tools">
          {TOOLS.map((tool) => {
            const pressed = selectedTools.has(tool.id);
            return (
              <Button
                key={tool.id}
                type="button"
                variant={pressed ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={pressed}
                onClick={() => toggleTool(tool.id)}
                className={pressed && tool.risk === "consequential" ? "border-orange-300/40" : undefined}
              >
                {tool.label}{tool.risk === "consequential" ? " ⚠" : ""}
              </Button>
            );
          })}
        </div>
      </FormField>

      <div className="grid gap-2 rounded-xl border border-[#2A2E45] p-3">
        <label className="flex items-center gap-2 text-xs text-[#C5C8DB]">
          <input type="checkbox" className="accent-cyan-300" checked={approvalRequired} onChange={(event) => setApprovalRequired(event.target.checked)} />
          Require my approval before each run (human-in-the-loop)
        </label>
        <label className="flex items-center gap-2 text-xs text-[#C5C8DB]">
          <input type="checkbox" className="accent-cyan-300" checked={memoryEnabled} onChange={(event) => setMemoryEnabled(event.target.checked)} />
          Let this agent remember run outputs and preferences (memory)
        </label>
        {clients.length ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-[#888] hover:text-[#C5C8DB]">Assign clients ({clientIds.size} selected)</summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {clients.map((client) => (
                <Button key={client.id} type="button" variant={clientIds.has(client.id) ? "secondary" : "ghost"} size="sm" aria-pressed={clientIds.has(client.id)} onClick={() => toggleClient(client.id)}>
                  {client.name}
                </Button>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <div className="rounded-xl border border-[#2A2E45]">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-[#C5C8DB]"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
        >
          Advanced model parameters
          <ChevronDown className={`size-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {advancedOpen ? (
          <div className="grid gap-3 border-t border-[#2A2E45] p-3 sm:grid-cols-2">
            <FormField id="agent-temperature" label="Temperature" hint="0 = precise, 2 = creative.">
              <Input type="number" step="0.1" min={0} max={2} value={temperature} onChange={(event) => setTemperature(event.target.value)} />
            </FormField>
            <FormField id="agent-max-tokens" label="Max output tokens">
              <Input type="number" min={1} max={128000} value={maxTokens} onChange={(event) => setMaxTokens(event.target.value)} />
            </FormField>
            <FormField id="agent-top-p" label="Top P">
              <Input type="number" step="0.05" min={0} max={1} value={topP} onChange={(event) => setTopP(event.target.value)} />
            </FormField>
            <FormField id="agent-frequency-penalty" label="Frequency penalty">
              <Input type="number" step="0.1" min={-2} max={2} value={frequencyPenalty} onChange={(event) => setFrequencyPenalty(event.target.value)} />
            </FormField>
          </div>
        ) : null}
      </div>

      <div className="sticky bottom-0 -mx-6 mt-1 flex items-center justify-end gap-2 border-t border-[#2A2E45] bg-[#0C1020] px-6 pt-3 pb-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending || !name.trim() || !systemPrompt.trim()}>
          {mode === "create" ? "Create agent" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
