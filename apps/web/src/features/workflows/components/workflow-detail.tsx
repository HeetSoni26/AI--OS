"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Play } from "lucide-react";
import { Button, Empty, Skeleton, Tab, TabPanel, Tabs, TabsList, useAnnounce } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { workflowApi } from "../lib/workflow-api";

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

const ISSUE_LABELS: Record<string, string> = {
  missing_connection: "Missing connection",
  unreachable_node: "Unreachable node",
  cycle: "Infinite loop",
  unhandled_error: "Missing credential binding",
  unsafe_action: "Consequential action",
  empty_blueprint: "Empty blueprint",
};

export function WorkflowDetail({
  workflowId,
  onFeedback,
}: {
  workflowId: string;
  onFeedback: (message: string) => void;
}) {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [error, setError] = useState("");

  const detail = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: () => workflowApi.detail(workflowId),
  });

  const invalidate = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["workflow", workflowId] }),
      cache.invalidateQueries({ queryKey: ["workflows"] }),
    ]);
  };

  const setStatus = useMutation({
    mutationFn: (action: "activate" | "pause" | "archive") => workflowApi.setStatus(workflowId, action),
    onSuccess: async (workflow) => {
      const message = workflow.status === "active"
        ? `${workflow.name} is live. Provider events will update its health.`
        : `${workflow.name} was ${workflow.status}.`;
      onFeedback(message);
      announce(message);
      await invalidate();
    },
    onError: (caught) => setError(errorMessage(caught, "The status change failed.")),
  });

  const recordTest = useMutation({
    mutationFn: (result: "success" | "failed") => workflowApi.recordTest(workflowId, { status: result, output: { sandbox: true } }),
    onSuccess: async (execution) => {
      onFeedback(`Sandbox test recorded: ${execution.status}. Activation is now available for this version.`);
      announce("Sandbox test recorded.");
      await invalidate();
    },
    onError: (caught) => setError(errorMessage(caught, "The test could not be recorded.")),
  });

  if (detail.isLoading) {
    return <div role="status" className="grid gap-3"><span className="sr-only">Loading workflow…</span><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;
  }
  if (detail.isError || !detail.data) {
    return <Empty title="Workflow could not be loaded" description={detail.error ? errorMessage(detail.error, "Retry the request.") : ""} action={<Button onClick={() => detail.refetch()}>Retry</Button>} />;
  }

  const workflow = detail.data;
  const validation = workflow.latestVersion?.validation;
  const blueprint = workflow.latestVersion?.blueprint as { nodes?: Array<{ id: string; type: string; name: string }>; connections?: Array<{ from: string; to: string }>; trigger?: string } | undefined;

  return (
    <div className="grid gap-5">
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#F3F5FF]">{workflow.name}</h2>
            <p className="mt-1 text-xs text-[#888]">{workflow.clientName} · {workflow.provider} · v{workflow.currentVersion ?? 1}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => recordTest.mutate("success")} disabled={recordTest.isPending}>
              <Play className="size-3.5" aria-hidden="true" />Sandbox test
            </Button>
            {workflow.status !== "active" ? (
              <Button size="sm" variant="secondary" onClick={() => setStatus.mutate("activate")} disabled={setStatus.isPending}>Activate</Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setStatus.mutate("pause")} disabled={setStatus.isPending}>Pause</Button>
            )}
          </div>
        </div>
      </div>

      {validation ? (
        <div className={`rounded-xl border p-3 ${validation.valid ? "border-[#39FF14]/20 bg-[#39FF14]/[0.05]" : "border-orange-300/30 bg-orange-300/[0.06]"}`}>
          <div className="flex items-center gap-2 text-xs font-medium">
            {validation.valid ? <CheckCircle2 className="size-4 text-[#39FF14]" aria-hidden="true" /> : <AlertTriangle className="size-4 text-orange-300" aria-hidden="true" />}
            <span className={validation.valid ? "text-[#39FF14]" : "text-orange-300"}>{validation.valid ? "Blueprint valid" : "Blueprint needs attention"}</span>
          </div>
          <ul className="mt-2 grid gap-1">
            {validation.issues.map((issue, index) => (
              <li key={index} className="text-[11px] leading-4 text-[#C5C8DB]">
                <span className={issue.code === "unsafe_action" ? "text-orange-300" : "text-[#888]"}>{ISSUE_LABELS[issue.code] ?? issue.code}:</span> {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Tabs defaultValue="blueprint">
        <TabsList className="surface-scrollbar mb-4 flex gap-1 overflow-x-auto border-b border-[#2A2E45]">
          <Tab value="blueprint">Blueprint</Tab>
          <Tab value="plan">Human plan</Tab>
          <Tab value="executions">Executions ({workflow.executions.length})</Tab>
          <Tab value="versions">Versions ({workflow.versions.length})</Tab>
        </TabsList>

        <TabPanel value="blueprint">
          <div className="grid gap-2">
            <p className="text-xs text-[#888]">Trigger: <span className="font-mono text-cyan-200">{blueprint?.trigger ?? "-"}</span> · {blueprint?.nodes?.length ?? 0} nodes · {blueprint?.connections?.length ?? 0} connections</p>
            <ol className="grid gap-1.5">
              {(blueprint?.nodes ?? []).map((node, index) => (
                <li key={node.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#2A2E45] bg-[#0C1020] px-3 py-2 text-xs">
                  <span className="text-[#C5C8DB]">{index + 1}. {node.name}</span>
                  <span className="font-mono text-[10px] text-[#888]">{node.type}</span>
                </li>
              ))}
            </ol>
            <pre className="surface-scrollbar mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-[#2A2E45] bg-[#111533] p-3 font-mono text-[10px] leading-4 text-[#888]">{JSON.stringify(blueprint ?? {}, null, 2)}</pre>
          </div>
        </TabPanel>

        <TabPanel value="plan">
          <pre className="surface-scrollbar max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-[#2A2E45] bg-[#111533] p-3 font-mono text-[11px] leading-5 text-[#C5C8DB]">{workflow.latestVersion?.humanPlan ?? "-"}</pre>
          {workflow.latestVersion?.assumptions?.length ? (
            <div className="mt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[#C5C8DB]">Assumptions</h4>
              <ul className="mt-1.5 grid gap-1">
                {workflow.latestVersion.assumptions.map((assumption, index) => (
                  <li key={index} className="text-[11px] text-[#888]">· {assumption}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </TabPanel>

        <TabPanel value="executions">
          {!workflow.executions.length ? (
            <Empty title="No executions yet" description="Record a sandbox test, then activate. Provider events appear here with health metrics." />
          ) : (
            <ul className="grid gap-2" aria-label="Workflow executions">
              {workflow.executions.map((execution) => (
                <li key={execution.id} className="rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className={execution.status === "success" ? "font-semibold uppercase tracking-wide text-[#39FF14]" : "font-semibold uppercase tracking-wide text-[#FF4D6D]"}>{execution.status}</span>
                    <span className="text-[10px] text-[#666]">{execution.createdAt ? dateTime.format(new Date(execution.createdAt)) : ""}{execution.durationMs != null ? ` · ${(execution.durationMs / 1000).toFixed(1)}s` : ""}</span>
                  </div>
                  {execution.errorMessage ? <p className="mt-2 rounded-lg border border-[#FF4D6D]/20 bg-[#FF4D6D]/[0.06] px-2 py-1 text-[11px] text-red-200">{execution.errorMessage}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </TabPanel>

        <TabPanel value="versions">
          <ol className="grid gap-1.5">
            {workflow.versions.map((version) => (
              <li key={version.version} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2A2E45] px-3 py-2 text-[11px]">
                <span className="text-[#C5C8DB]">v{version.version} · {version.changeSummary ?? "-"}{version.testedAt ? " · tested" : ""}{version.deployedAt ? " · deployed" : ""}</span>
                <span className="text-[10px] text-[#666]">{version.createdAt ? dateTime.format(new Date(version.createdAt)) : ""}</span>
              </li>
            ))}
          </ol>
        </TabPanel>
      </Tabs>
    </div>
  );
}
