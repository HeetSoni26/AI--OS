"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleSlash } from "lucide-react";
import { Card, CardContent, Empty, Skeleton } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { apiFetch } from "@/lib/api-client";

type SettingsDto = {
  workspace: {
    ownerEmail: string;
    ownerName: string;
    environment: string;
    authMode: string;
    database: string;
    agentRuntime: string;
    rateLimitBackend: string;
  };
  integrations: Array<{
    id: string;
    label: string;
    group: string;
    configured: boolean;
    envVars: string[];
    effect: string;
  }>;
  generatedAt: string;
};

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

export function SettingsWorkspace() {
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await apiFetch<SettingsDto>("/api/v1/settings")).data,
    refetchInterval: 60_000,
  });

  if (settings.isLoading) {
    return <div role="status" className="grid gap-3"><span className="sr-only">Loading settings…</span><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  }
  if (settings.isError || !settings.data) {
    return <Empty title="Settings could not be loaded" description={settings.error ? errorMessage(settings.error, "Retry the request.") : ""} />;
  }

  const { workspace, integrations } = settings.data;
  const groups = [...new Set(integrations.map((integration) => integration.group))];
  const configuredCount = integrations.filter((integration) => integration.configured).length;

  return (
    <div className="grid gap-6">
      <header className="border-b border-[#2A2E45] pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-purple-300">/ workspace settings</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#F3F5FF] sm:text-3xl">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#888]">Workspace identity, runtime posture, and every integration with an honest configured / not-configured state - no secrets are ever displayed here.</p>
      </header>

      <section aria-label="Workspace" className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="grid gap-2 p-4 text-xs">
            <h2 className="text-sm font-semibold text-[#F3F5FF]">Workspace</h2>
            <div className="flex justify-between gap-2"><span className="text-[#888]">Owner</span><span className="truncate text-[#C5C8DB]">{workspace.ownerName} · {workspace.ownerEmail}</span></div>
            <div className="flex justify-between gap-2"><span className="text-[#888]">Environment</span><span className="text-[#C5C8DB]">{workspace.environment}</span></div>
            <div className="flex justify-between gap-2"><span className="text-[#888]">Auth</span><span className="text-[#C5C8DB]">{workspace.authMode}</span></div>
            <div className="flex justify-between gap-2"><span className="text-[#888]">Database</span><span className="text-[#39FF14]">{workspace.database}</span></div>
            <div className="flex justify-between gap-2"><span className="text-[#888]">Agent runtime</span><span className="text-[#C5C8DB]">{workspace.agentRuntime}</span></div>
            <div className="flex justify-between gap-2"><span className="text-[#888]">API rate limiting</span><span className="text-[#C5C8DB]">{workspace.rateLimitBackend}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2 p-4 text-xs">
            <h2 className="text-sm font-semibold text-[#F3F5FF]">Self-contained mode</h2>
            <p className="leading-5 text-[#888]">
              {configuredCount} of {integrations.length} integrations configured. Everything else runs on built-in local alternatives - deterministic AI simulation, manual payment recording, local publish recording, and local embeddings for semantic search - so the entire workspace is usable without any external account.
            </p>
            <p className="text-[10px] leading-4 text-[#666]">Configure any integration by adding its environment variables and restarting. Nothing here displays secret values.</p>
          </CardContent>
        </Card>
      </section>

      {groups.map((group) => (
        <section key={group} aria-labelledby={`settings-${group.replace(/\s+/g, "-")}`} className="grid gap-2">
          <h2 id={`settings-${group.replace(/\s+/g, "-")}`} className="text-xs font-semibold uppercase tracking-wide text-[#C5C8DB]">{group}</h2>
          {integrations.filter((integration) => integration.group === group).map((integration) => (
            <Card key={integration.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {integration.configured
                      ? <CheckCircle2 className="size-4 shrink-0 text-[#39FF14]" aria-hidden="true" />
                      : <CircleSlash className="size-4 shrink-0 text-[#888]" aria-hidden="true" />}
                    <p className="text-sm font-medium text-[#F3F5FF]">{integration.label}</p>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-5 text-[#888]">{integration.effect}</p>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] font-medium uppercase tracking-wide ${integration.configured ? "text-[#39FF14]" : "text-[#888]"}`}>
                    {integration.configured ? "Configured" : "Not configured"}
                  </span>
                  <p className="mt-1 font-mono text-[10px] text-[#666]">{integration.envVars.join(" · ")}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      ))}
    </div>
  );
}
