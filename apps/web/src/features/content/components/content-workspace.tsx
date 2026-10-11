"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_TYPE_LABELS,
  contentTypes,
  type ContentStatus,
} from "@aios/contracts";
import { CalendarDays, PenLine, Plus } from "lucide-react";
import { Button, Card, CardContent, Dialog, Drawer, Empty, Input, Select, Skeleton, Tab, TabPanel, Tabs, TabsList, Textarea, useAnnounce } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { clientApi } from "@/features/clients/lib/client-api";
import { ArtifactDetail } from "./artifact-detail";
import { contentApi, type ArtifactUpsertInput, type BrandProfileDto } from "../lib/content-api";

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-300",
  owner_review: "bg-cyan-300",
  client_review: "bg-purple-400",
  review: "bg-cyan-300",
  approved: "bg-[#39FF14]",
  scheduled: "bg-[#B026FF]",
  published: "bg-[#39FF14]",
  failed: "bg-[#FF4D6D]",
  archived: "bg-[#666]",
};

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function ContentWorkspace() {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [scope, setScope] = useState<"client" | "agency">("client");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  const artifacts = useQuery({
    queryKey: ["content-artifacts", scope],
    queryFn: () => contentApi.list({ scope }),
  });
  const brand = useQuery({
    queryKey: ["content-brand", scope],
    queryFn: () => contentApi.brandProfiles(scope),
  });
  const calendar = useQuery({
    queryKey: ["content-calendar", scope],
    queryFn: () => contentApi.calendar(scope),
  });
  const clients = useQuery({
    queryKey: ["content-clients"],
    queryFn: () => clientApi.list({ limit: 100, archiveScope: "active", sort: "name", direction: "asc", view: "list" }),
    staleTime: 60_000,
  });

  const invalidate = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["content-artifacts"] }),
      cache.invalidateQueries({ queryKey: ["content-brand"] }),
      cache.invalidateQueries({ queryKey: ["content-calendar"] }),
      cache.invalidateQueries({ queryKey: ["content-artifact"] }),
    ]);
  };

  const create = useMutation({
    mutationFn: (input: ArtifactUpsertInput) => contentApi.create(input),
    onSuccess: async (artifact) => {
      setCreateOpen(false);
      setSelectedId(artifact.id);
      setFeedback(`"${artifact.title}" was created as a draft. Advance it through review, approval, and scheduling.`);
      announce("Artifact created.");
      await invalidate();
    },
  });

  const stats = useMemo(() => {
    const items = artifacts.data?.items ?? [];
    return {
      total: items.length,
      inReview: items.filter((artifact) => ["owner_review", "client_review", "review"].includes(artifact.status)).length,
      approved: items.filter((artifact) => ["approved", "scheduled"].includes(artifact.status)).length,
      published: items.filter((artifact) => artifact.status === "published").length,
    };
  }, [artifacts.data]);

  const clientOptions = useMemo(
    () => (clients.data?.items ?? []).map((client) => ({ id: client.id, name: client.name })),
    [clients.data],
  );
  const brandProfile = brand.data?.items[0] ?? null;

  return (
    <div className="grid gap-6">
      <header className="flex flex-col justify-between gap-4 border-b border-[#2A2E45] pb-6 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-purple-300">/ content engine</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#F3F5FF] sm:text-3xl">Content</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#888]">Produce client and agency content with brand-scoped voice, versioned drafts, approval states, and a publishing calendar. Editing always resets approval.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setBrandOpen(true)}>Brand voice</Button>
          <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" aria-hidden="true" />New artifact</Button>
        </div>
      </header>

      {feedback ? <p role="status" className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3 text-xs text-cyan-100">{feedback}</p> : null}
      {create.error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-4 py-3 text-xs text-red-200">{errorMessage(create.error, "The artifact could not be created.")}</p> : null}

      <Tabs defaultValue="artifacts">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="surface-scrollbar mb-4 flex gap-1 overflow-x-auto border-b border-[#2A2E45]">
            <Tab value="artifacts">Artifacts</Tab>
            <Tab value="calendar">Calendar</Tab>
          </TabsList>
          <div className="flex gap-1" role="group" aria-label="Content scope">
            <Button variant={scope === "client" ? "secondary" : "ghost"} size="sm" aria-pressed={scope === "client"} onClick={() => setScope("client")}>Client</Button>
            <Button variant={scope === "agency" ? "secondary" : "ghost"} size="sm" aria-pressed={scope === "agency"} onClick={() => setScope("agency")}>Agency</Button>
          </div>
        </div>

        <TabPanel value="artifacts">
          <section aria-label="Content summary" className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Artifacts</p><p className="mt-1 font-mono text-xl text-[#F3F5FF]">{stats.total}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">In review</p><p className="mt-1 font-mono text-xl text-cyan-200">{stats.inReview}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Approved</p><p className="mt-1 font-mono text-xl text-[#39FF14]">{stats.approved}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Published</p><p className="mt-1 font-mono text-xl text-purple-300">{stats.published}</p></CardContent></Card>
          </section>

          {artifacts.isLoading ? (
            <div role="status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><span className="sr-only">Loading content…</span><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
          ) : artifacts.isError ? (
            <Empty title="Content could not be loaded" description={errorMessage(artifacts.error, "Retry the request.")} action={<Button onClick={() => artifacts.refetch()}>Retry</Button>} />
          ) : !artifacts.data?.items.length ? (
            <Empty
              title={`No ${scope} content yet`}
              description={scope === "client" ? "Create client content drafts, advance them through review and approval, then schedule them on the calendar." : "Draft the agency's own marketing: LinkedIn posts, threads, newsletters, and case studies."}
              action={<Button onClick={() => setCreateOpen(true)}><Plus className="size-4" aria-hidden="true" />New artifact</Button>}
              icon={<PenLine className="size-5 text-purple-300" aria-hidden="true" />}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="content-cards">
              {artifacts.data.items.map((artifact) => (
                <Card key={artifact.id} className="h-full transition-colors hover:border-purple-300/40">
                  <CardContent className="grid h-full gap-3">
                    <button type="button" className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60" onClick={() => setSelectedId(artifact.id)} aria-label={`Open ${artifact.title}`}>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="line-clamp-2 text-sm font-medium text-[#F3F5FF]">{artifact.title}</h3>
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#2A2E45] bg-[#0C1020] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#C5C8DB]">
                          <span className={`size-1.5 rounded-full ${STATUS_COLORS[artifact.status] ?? "bg-[#888]"}`} aria-hidden="true" />
                          {CONTENT_STATUS_LABELS[artifact.status as ContentStatus] ?? artifact.status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-purple-300">{CONTENT_TYPE_LABELS[artifact.type as keyof typeof CONTENT_TYPE_LABELS] ?? artifact.type} · {scope === "client" ? artifact.clientName ?? "No client" : "Agency"}</p>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#888]">{artifact.body.replace(/\s+/g, " ").slice(0, 140)}</p>
                      <p className="mt-2 text-[10px] text-[#888]">v{artifact.currentVersion} · updated {artifact.updatedAt ? dateTime.format(new Date(artifact.updatedAt)) : "-"}</p>
                    </button>
                    <div className="mt-auto flex items-center gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => setSelectedId(artifact.id)}>Open</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabPanel>

        <TabPanel value="calendar">
          {calendar.isLoading ? (
            <div role="status" className="grid gap-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
          ) : !calendar.data?.items.length ? (
            <Empty title="Nothing scheduled" description="Approve an artifact, then schedule it - entries appear here with platform and date." icon={<CalendarDays className="size-5 text-purple-300" aria-hidden="true" />} />
          ) : (
            <ol className="grid gap-2" aria-label="Scheduled content">
              {calendar.data.items.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3">
                  <div>
                    <p className="text-sm text-[#F3F5FF]">{entry.artifactTitle ?? "Artifact"}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-purple-300">{entry.platform} · {entry.status}</p>
                  </div>
                  <span className="text-xs text-[#C5C8DB]">{dateTime.format(new Date(entry.publishAt))}</span>
                </li>
              ))}
            </ol>
          )}
        </TabPanel>
      </Tabs>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New content artifact" description="Pick the type, write the draft, then advance it through the approval flow.">
        <ArtifactForm
          scope={scope}
          clients={clientOptions}
          pending={create.isPending}
          error={create.error ? errorMessage(create.error, "The artifact could not be saved.") : undefined}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(input) => create.mutate(input)}
        />
      </Dialog>

      <Dialog open={brandOpen} onClose={() => setBrandOpen(false)} title={`${scope === "client" ? "Client" : "Agency"} brand voice`} description="Stored as scoped memory - generation never mixes brand voices.">
        <BrandForm
          scope={scope}
          clients={clientOptions}
          profile={brandProfile}
          onSaved={async (message) => {
            setBrandOpen(false);
            setFeedback(message);
            await invalidate();
          }}
        />
      </Dialog>

      <Drawer open={Boolean(selectedId)} onClose={() => setSelectedId(null)} title="Content artifact" description="Draft, review flow, versions, and scheduling.">
        {selectedId ? <ArtifactDetail artifactId={selectedId} onFeedback={setFeedback} /> : null}
      </Drawer>
    </div>
  );
}

function ArtifactForm({
  scope,
  clients,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  scope: "client" | "agency";
  clients: ReadonlyArray<{ id: string; name: string }>;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (input: ArtifactUpsertInput) => void;
}) {
  const [clientId, setClientId] = useState(scope === "client" ? clients[0]?.id ?? "" : "");
  const [type, setType] = useState<string>("linkedin_post");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [body, setBody] = useState("");

  const submit = () => {
    if (!title.trim() || !body.trim()) return;
    if (scope === "client" && !clientId) return;
    onSubmit({
      scope,
      clientId: scope === "client" ? clientId : null,
      type,
      title: title.trim(),
      brief: brief.trim() || null,
      body: body.trim(),
      claimsToVerify: [],
    });
  };

  return (
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {scope === "client" ? (
          <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="artifact-client">Client
            <Select id="artifact-client" value={clientId} onChange={(event) => setClientId(event.target.value)} required>
              <option value="">Choose a client…</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </Select>
          </label>
        ) : null}
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="artifact-type">Type
          <Select id="artifact-type" value={type} onChange={(event) => setType(event.target.value)}>
            {contentTypes.map((entry) => <option key={entry} value={entry}>{CONTENT_TYPE_LABELS[entry]}</option>)}
          </Select>
        </label>
      </div>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="artifact-title">Title
        <Input id="artifact-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Why automation wins in 2026" required maxLength={500} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="artifact-brief">Brief <span className="text-[#666]">(source, angle, audience)</span>
        <Textarea id="artifact-brief" rows={2} value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={5000} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="artifact-body">Draft
        <Textarea id="artifact-body" rows={8} value={body} onChange={(event) => setBody(event.target.value)} required maxLength={100000} />
      </label>
      <div className="sticky bottom-0 -mx-6 mt-1 flex items-center justify-end gap-2 border-t border-[#2A2E45] bg-[#0C1020] px-6 pt-3 pb-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending || !title.trim() || !body.trim() || (scope === "client" && !clientId)}>Create draft</Button>
      </div>
    </form>
  );
}

function BrandForm({
  scope,
  clients,
  profile,
  onSaved,
}: {
  scope: "client" | "agency";
  clients: ReadonlyArray<{ id: string; name: string }>;
  profile: BrandProfileDto | null;
  onSaved: (message: string) => void;
}) {
  const [clientId, setClientId] = useState(profile?.clientId ?? clients[0]?.id ?? "");
  const [name, setName] = useState(profile?.name ?? (scope === "agency" ? "Agency voice" : ""));
  const [tone, setTone] = useState(profile?.tone ?? "Professional, warm, concrete.");
  const [audience, setAudience] = useState(profile?.targetAudience ?? "");
  const [keyMessages, setKeyMessages] = useState((profile?.keyMessages ?? []).join("\n"));
  const [prohibited, setProhibited] = useState((profile?.prohibitedClaims ?? []).join("\n"));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!name.trim() || !tone.trim() || !audience.trim()) return;
    setPending(true);
    try {
      await contentApi.upsertBrandProfile({
        scope,
        clientId: scope === "client" ? clientId : null,
        name: name.trim(),
        tone: tone.trim(),
        targetAudience: audience.trim(),
        keyMessages: keyMessages.split("\n").map((line) => line.trim()).filter(Boolean),
        prohibitedClaims: prohibited.split("\n").map((line) => line.trim()).filter(Boolean),
      });
      onSaved(`Brand voice saved for ${scope === "agency" ? "the agency" : clients.find((client) => client.id === clientId)?.name ?? "client"}. Generation stays scoped to this voice.`);
    } catch (caught) {
      setError(errorMessage(caught, "The brand profile could not be saved."));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      {scope === "client" ? (
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="brand-client">Client
          <Select id="brand-client" value={clientId} onChange={(event) => setClientId(event.target.value)} required>
            <option value="">Choose a client…</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </Select>
        </label>
      ) : null}
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="brand-name">Profile name
        <Input id="brand-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={255} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="brand-tone">Tone
        <Input id="brand-tone" value={tone} onChange={(event) => setTone(event.target.value)} required maxLength={2000} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="brand-audience">Target audience
        <Textarea id="brand-audience" rows={2} value={audience} onChange={(event) => setAudience(event.target.value)} required maxLength={2000} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="brand-messages">Key messages <span className="text-[#666]">(one per line)</span>
        <Textarea id="brand-messages" rows={3} value={keyMessages} onChange={(event) => setKeyMessages(event.target.value)} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="brand-prohibited">Prohibited claims <span className="text-[#666]">(one per line)</span>
        <Textarea id="brand-prohibited" rows={2} value={prohibited} onChange={(event) => setProhibited(event.target.value)} />
      </label>
      <div className="sticky bottom-0 -mx-6 mt-1 flex items-center justify-end gap-2 border-t border-[#2A2E45] bg-[#0C1020] px-6 pt-3 pb-1">
        <Button type="button" variant="ghost" onClick={() => onSaved("")}>Cancel</Button>
        <Button type="submit" disabled={pending}>Save brand voice</Button>
      </div>
    </form>
  );
}
