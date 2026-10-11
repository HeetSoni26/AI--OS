"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { Button, Empty, Input, Skeleton, useAnnounce } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { contentApi } from "../lib/content-api";

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

const NEXT_STATUS: Record<string, Array<{ label: string; status: string }>> = {
  draft: [{ label: "Send to owner review", status: scopeAware("draft") }],
  owner_review: [{ label: "Send to client review", status: "client_review" }, { label: "Back to draft", status: "draft" }],
  review: [{ label: "Approve", status: "approved" }, { label: "Back to draft", status: "draft" }],
  client_review: [{ label: "Approve", status: "approved" }, { label: "Back to draft", status: "draft" }],
  approved: [{ label: "Schedule", status: "scheduled" }],
  scheduled: [{ label: "Mark published", status: "published" }],
};

function scopeAware(_from: string): string {
  return "owner_review";
}

export function ArtifactDetail({
  artifactId,
  onFeedback,
}: {
  artifactId: string;
  onFeedback: (message: string) => void;
}) {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [bodyDraft, setBodyDraft] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");

  const detail = useQuery({
    queryKey: ["content-artifact", artifactId],
    queryFn: () => contentApi.detail(artifactId),
  });

  const invalidate = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["content-artifact", artifactId] }),
      cache.invalidateQueries({ queryKey: ["content-artifacts"] }),
      cache.invalidateQueries({ queryKey: ["content-calendar"] }),
    ]);
  };

  const setStatus = useMutation({
    mutationFn: (status: string) => contentApi.setStatus(artifactId, status),
    onSuccess: async (artifact) => {
      onFeedback(`"${artifact.title}" is now ${artifact.status.replaceAll("_", " ")}.`);
      announce("Status updated.");
      await invalidate();
    },
    onError: (caught) => setError(errorMessage(caught, "The status change failed.")),
  });

  const save = useMutation({
    mutationFn: (body: string) => contentApi.update(artifactId, { body }),
    onSuccess: async (artifact) => {
      setEditing(false);
      onFeedback(`Saved a new version of "${artifact.title}". Approval was reset to draft.`);
      await invalidate();
    },
    onError: (caught) => setError(errorMessage(caught, "The artifact could not be saved.")),
  });

  const schedule = useMutation({
    mutationFn: (publishAt: string) => contentApi.schedule(artifactId, publishAt),
    onSuccess: async (artifact) => {
      setScheduleOpen(false);
      onFeedback(`"${artifact.title}" was scheduled for ${dateTime.format(new Date(scheduleAt))}.`);
      await invalidate();
    },
    onError: (caught) => setError(errorMessage(caught, "The artifact could not be scheduled.")),
  });

  if (detail.isLoading) {
    return <div role="status" className="grid gap-3"><span className="sr-only">Loading artifact…</span><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;
  }
  if (detail.isError || !detail.data) {
    return <Empty title="Artifact could not be loaded" description={detail.error ? errorMessage(detail.error, "Retry the request.") : ""} action={<Button onClick={() => detail.refetch()}>Retry</Button>} />;
  }

  const artifact = detail.data;
  const actions = NEXT_STATUS[artifact.status] ?? [];

  return (
    <div className="grid gap-5">
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#F3F5FF]">{artifact.title}</h2>
            <p className="mt-1 text-xs text-[#888]">{artifact.type.replaceAll("_", " ")} · v{artifact.currentVersion} · {artifact.scope} scope</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {actions.map((action) => (
              action.status === "scheduled" ? (
                <Button key={action.label} size="sm" onClick={() => { setScheduleOpen((open) => !open); }} disabled={setStatus.isPending}>
                  <CalendarPlus className="size-3.5" aria-hidden="true" />{action.label}
                </Button>
              ) : (
                <Button key={action.label} size="sm" onClick={() => setStatus.mutate(action.status)} disabled={setStatus.isPending}>
                  {action.label}
                </Button>
              )
            ))}
            {!editing ? (
              <Button size="sm" variant="ghost" onClick={() => { setEditing(true); setBodyDraft(artifact.body); }}>Edit</Button>
            ) : null}
          </div>
        </div>
        {scheduleOpen ? (
          <div className="grid gap-2 rounded-xl border border-[#B026FF]/30 bg-[#B026FF]/[0.06] p-3">
            <label htmlFor="schedule-at" className="text-xs font-medium text-[#C5C8DB]">Publish date & time</label>
            <div className="flex flex-wrap gap-2">
              <Input id="schedule-at" type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
              <Button size="sm" disabled={!scheduleAt || schedule.isPending} onClick={() => schedule.mutate(new Date(scheduleAt).toISOString())}>Schedule</Button>
            </div>
          </div>
        ) : null}
        {editing ? (
          <div className="grid gap-2">
            <textarea
              className="surface-scrollbar min-h-48 rounded-xl border border-[#2A2E45] bg-[#111533] p-3 font-mono text-xs leading-5 text-[#F3F5FF]"
              value={bodyDraft}
              onChange={(event) => setBodyDraft(event.target.value)}
              aria-label="Artifact body"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" disabled={save.isPending || bodyDraft.trim() === artifact.body} onClick={() => save.mutate(bodyDraft.trim())}>Save new version</Button>
            </div>
          </div>
        ) : (
          <pre className="surface-scrollbar max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-[#2A2E45] bg-[#111533] p-3 text-xs leading-5 text-[#C5C8DB]">{artifact.body}</pre>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#C5C8DB]">Version history</h3>
        <ol className="mt-2 grid gap-1.5">
          {artifact.versions.map((version) => (
            <li key={version.version} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2A2E45] px-3 py-2 text-[11px]">
              <span className="text-[#C5C8DB]">v{version.version} · {version.status.replaceAll("_", " ")}</span>
              <span className="text-[10px] text-[#666]">{version.createdAt ? dateTime.format(new Date(version.createdAt)) : ""}</span>
            </li>
          ))}
        </ol>
      </div>

      {artifact.calendarEntries.length ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#C5C8DB]">Scheduled</h3>
          <ul className="mt-2 grid gap-1.5">
            {artifact.calendarEntries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#2A2E45] px-3 py-2 text-[11px]">
                <span className="text-[#C5C8DB]">{entry.platform} · {entry.status}</span>
                <span className="text-[10px] text-[#666]">{entry.publishAt ? dateTime.format(new Date(entry.publishAt)) : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
