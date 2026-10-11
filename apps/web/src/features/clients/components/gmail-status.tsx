"use client";

import { useId, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Mail, RefreshCcw } from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { Badge, Button, Skeleton, useAnnounce } from "@/components/ui";

type GmailSyncStatus = "idle" | "running" | "rate_limited" | "error" | "revoked" | string;
type GmailConnectionStatus = "connected" | "degraded" | "revoked" | "error" | "disabled" | "not_configured" | string;

type GmailStatus = {
  configured: boolean;
  connection: null | {
    id: string;
    name: string;
    status: GmailConnectionStatus;
    account: string | null;
    connectedAt: string | null;
    sync: null | {
      status: GmailSyncStatus;
      lastSyncedAt: string | null;
      nextRetryAt: string | null;
      lastErrorCode: string | null;
    };
  };
};

type GmailSyncResponse = {
  accepted: boolean;
  connectionId: string;
  status: string;
  message: string;
};

type StatusPresentation = {
  label: string;
  variant: "neutral" | "cyan" | "green" | "purple" | "orange" | "pink";
  description: string;
  action: "none" | "connect" | "reconnect" | "sync" | "retry-sync";
  actionLabel?: string;
};

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function describeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

function presentStatus(data: GmailStatus): StatusPresentation {
  if (!data.configured) {
    return {
      label: "Not configured",
      variant: "purple",
      description: "Gmail OAuth credentials have not been configured on the server. Configure them before connecting a mailbox.",
      action: "none",
    };
  }

  const connection = data.connection;
  if (!connection) {
    return {
      label: "Not connected",
      variant: "orange",
      description: "Connect the owner mailbox to automatically log messages that match client contact emails.",
      action: "connect",
      actionLabel: "Connect Gmail",
    };
  }

  const account = connection.account ?? connection.name;
  const sync = connection.sync;
  if (connection.status === "revoked" || sync?.status === "revoked") {
    return {
      label: "Authorization revoked",
      variant: "pink",
      description: `Access to ${account} was revoked. Reconnect Gmail before ingestion can resume.`,
      action: "reconnect",
      actionLabel: "Reconnect Gmail",
    };
  }
  if (sync?.status === "rate_limited") {
    const retryAt = formatDateTime(sync.nextRetryAt);
    return {
      label: "Rate limited",
      variant: "orange",
      description: `Gmail temporarily limited synchronization for ${account}.${retryAt ? ` The next automatic retry is ${retryAt}.` : " Retry when Gmail permits new requests."}`,
      action: "retry-sync",
      actionLabel: "Retry sync",
    };
  }
  if (sync?.status === "running") {
    return {
      label: "Syncing",
      variant: "cyan",
      description: `Messages for ${account} are being synchronized now.`,
      action: "sync",
      actionLabel: "Sync in progress",
    };
  }
  if (sync?.status === "error") {
    return {
      label: "Sync failed",
      variant: "pink",
      description: `The latest synchronization for ${account} failed${sync.lastErrorCode ? ` (${sync.lastErrorCode})` : ""}. The last successful checkpoint was preserved.`,
      action: "retry-sync",
      actionLabel: "Retry sync",
    };
  }
  if (["degraded", "error", "disabled"].includes(connection.status)) {
    return {
      label: "Connection issue",
      variant: "pink",
      description: `The connection to ${account} is ${connection.status}. Reconnect Gmail to restore ingestion.`,
      action: "reconnect",
      actionLabel: "Reconnect Gmail",
    };
  }

  const lastSyncedAt = formatDateTime(sync?.lastSyncedAt ?? null);
  return {
    label: "Connected",
    variant: "green",
    description: `Connected to ${account}.${lastSyncedAt ? ` Last synchronized ${lastSyncedAt}.` : " No completed synchronization has been recorded yet."}`,
    action: "sync",
    actionLabel: "Request sync",
  };
}

export function GmailStatusCard() {
  const headingId = useId();
  const announce = useAnnounce();
  const [feedback, setFeedback] = useState("");
  const status = useQuery({
    queryKey: ["integrations", "gmail"],
    queryFn: () => apiFetch<GmailStatus>("/api/v1/integrations/gmail").then((response) => response.data),
    retry: false,
  });
  const connect = useMutation({
    mutationFn: () => apiFetch<{ authorizationUrl: string }>("/api/v1/integrations/gmail/connect", { method: "POST" }).then((response) => response.data),
    onMutate: () => setFeedback("Opening Gmail authorization…"),
    onSuccess: ({ authorizationUrl }) => {
      announce("Gmail authorization is ready. Redirecting to Google.");
      window.location.assign(authorizationUrl);
    },
    onError: (error) => {
      const message = describeError(error, "Gmail authorization could not be started.");
      setFeedback(message);
      announce(message);
    },
  });
  const sync = useMutation({
    mutationFn: () => apiFetch<GmailSyncResponse>("/api/v1/integrations/gmail/sync", { method: "POST" }).then((response) => response.data),
    onMutate: () => setFeedback("Requesting Gmail synchronization…"),
    onSuccess: async (result) => {
      setFeedback(result.message);
      announce(result.message);
      await status.refetch();
    },
    onError: (error) => {
      const message = describeError(error, "Gmail synchronization could not be requested.");
      setFeedback(message);
      announce(message);
    },
  });

  if (status.isLoading) {
    return (
      <section aria-labelledby={headingId} aria-busy="true" className="rounded-xl border border-[#2A2E45] p-4">
        <div className="flex items-center gap-2"><Mail aria-hidden="true" className="size-4 text-red-300" /><h3 id={headingId} className="text-xs font-medium text-[#C5C8DB]">Gmail ingestion</h3></div>
        <div role="status" className="mt-3 grid gap-2"><span className="sr-only">Checking Gmail status…</span><Skeleton className="h-4 w-28" /><Skeleton className="h-9 w-full" /></div>
      </section>
    );
  }

  if (status.isError || !status.data) {
    const message = describeError(status.error, "Gmail status is temporarily unavailable.");
    return (
      <section aria-labelledby={headingId} className="rounded-xl border border-red-400/30 p-4">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><AlertTriangle aria-hidden="true" className="size-4 text-red-300" /><h3 id={headingId} className="text-xs font-medium text-[#C5C8DB]">Gmail ingestion</h3></div><Badge variant="pink">Status unavailable</Badge></div>
        <p role="alert" className="mt-2 text-[11px] leading-5 text-red-200">{message}</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => status.refetch()} disabled={status.isFetching}><RefreshCcw aria-hidden="true" className="size-3.5" />{status.isFetching ? "Retrying…" : "Retry status"}</Button>
      </section>
    );
  }

  const presentation = presentStatus(status.data);
  const syncIsRunning = status.data.connection?.sync?.status === "running";
  const actionPending = connect.isPending || sync.isPending;
  const runAction = () => {
    setFeedback("");
    if (presentation.action === "connect" || presentation.action === "reconnect") connect.mutate();
    if (presentation.action === "sync" || presentation.action === "retry-sync") sync.mutate();
  };
  const buttonLabel = connect.isPending
    ? presentation.action === "reconnect" ? "Reconnecting…" : "Connecting…"
    : sync.isPending
      ? "Requesting sync…"
      : presentation.actionLabel;

  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-[#2A2E45] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Mail aria-hidden="true" className="size-4 text-red-300" /><h3 id={headingId} className="text-xs font-medium text-[#C5C8DB]">Gmail ingestion</h3></div>
        <Badge variant={presentation.variant}>{presentation.label}</Badge>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-[#888]">{presentation.description}</p>
      {presentation.action !== "none" ? <Button variant="ghost" size="sm" className="mt-3" onClick={runAction} disabled={actionPending || syncIsRunning}><RefreshCcw aria-hidden="true" className="size-3.5" />{buttonLabel}</Button> : null}
      {feedback ? <p role={connect.isError || sync.isError ? "alert" : "status"} aria-live="polite" className={`mt-3 text-[11px] leading-5 ${connect.isError || sync.isError ? "text-red-200" : "text-cyan-100"}`}>{feedback}</p> : null}
    </section>
  );
}
