"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KNOWLEDGE_CATEGORY_LABELS,
  knowledgeCategories,
  type KnowledgeCategoryName,
} from "@aios/contracts";
import { Database, Plus, Search } from "lucide-react";
import { Button, Card, CardContent, Dialog, Drawer, Empty, Input, Select, Skeleton, Tab, TabPanel, Tabs, TabsList, Textarea, useAnnounce } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { knowledgeApi, type KnowledgeEntryDto, type SopDto } from "../lib/knowledge-api";

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function KnowledgeWorkspace() {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState<"keyword" | "semantic">("keyword");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [sopFor, setSopFor] = useState<SopDto | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const entries = useQuery({
    queryKey: ["knowledge-entries", search, searchMode],
    queryFn: () => knowledgeApi.entries(search || undefined, searchMode),
  });
  const sops = useQuery({ queryKey: ["knowledge-sops"], queryFn: () => knowledgeApi.sops() });

  const invalidate = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["knowledge-entries"] }),
      cache.invalidateQueries({ queryKey: ["knowledge-sops"] }),
    ]);
  };

  const create = useMutation({
    mutationFn: (input: Parameters<typeof knowledgeApi.createEntry>[0]) => knowledgeApi.createEntry(input),
    onSuccess: async (entry) => {
      setCreateOpen(false);
      setFeedback(`"${entry.title}" saved. Every future edit records a version.`);
      announce("Knowledge entry created.");
      await invalidate();
    },
  });

  return (
    <div className="grid gap-6">
      <header className="flex flex-col justify-between gap-4 border-b border-[#2A2E45] pb-6 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-purple-300">/ operational knowledge</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#F3F5FF] sm:text-3xl">Knowledge Base</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#888]">Markdown knowledge with version history and search, plus SOPs your agents and you execute - the agency's memory improves every process.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" aria-hidden="true" />New entry</Button>
      </header>

      {feedback ? <p role="status" className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3 text-xs text-cyan-100">{feedback}</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-4 py-3 text-xs text-red-200">{error}</p> : null}

      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#666]" />
        <Input
          type="search"
          className="pl-10"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") setSearch(searchDraft); }}
          placeholder="Search titles, content, and tags…  (press Enter)"
          aria-label="Search knowledge"
        />
        <div className="mt-2 flex gap-1" role="group" aria-label="Search mode">
          <Button variant={searchMode === "keyword" ? "secondary" : "ghost"} size="sm" aria-pressed={searchMode === "keyword"} onClick={() => setSearchMode("keyword")}>Keyword</Button>
          <Button variant={searchMode === "semantic" ? "secondary" : "ghost"} size="sm" aria-pressed={searchMode === "semantic"} onClick={() => setSearchMode("semantic")}>Semantic</Button>
        </div>
      </div>

      <Tabs defaultValue="entries">
        <TabsList className="surface-scrollbar mb-4 flex gap-1 overflow-x-auto border-b border-[#2A2E45]">
          <Tab value="entries">Entries ({entries.data?.total ?? 0})</Tab>
          <Tab value="sops">SOPs ({sops.data?.items.length ?? 0})</Tab>
        </TabsList>

        <TabPanel value="entries">
          {entries.isLoading ? (
            <div role="status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
          ) : entries.isError ? (
            <Empty title="Knowledge could not be loaded" description={errorMessage(entries.error, "Retry the request.")} action={<Button onClick={() => entries.refetch()}>Retry</Button>} />
          ) : !entries.data?.items.length ? (
            <Empty
              title={search ? "No entries match" : "No knowledge yet"}
              description={search ? "Try a different search." : "Capture SOPs, templates, decisions, and lessons - every entry is versioned and searchable."}
              action={search ? <Button onClick={() => { setSearchDraft(""); setSearch(""); }}>Clear search</Button> : <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" aria-hidden="true" />New entry</Button>}
              icon={<Database className="size-5 text-purple-300" aria-hidden="true" />}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="knowledge-cards">
              {entries.data.items.map((entry) => (
                <Card key={entry.id} className="h-full transition-colors hover:border-purple-300/40">
                  <CardContent className="grid h-full gap-2">
                    <button type="button" className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60" onClick={() => setSelectedId(entry.id)} aria-label={`Open ${entry.title}`}>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="line-clamp-2 text-sm font-medium text-[#F3F5FF]">{entry.title}</h3>
                        <span className="shrink-0 rounded-full border border-[#2A2E45] bg-[#0C1020] px-2 py-0.5 text-[9px] uppercase tracking-wide text-purple-300">{KNOWLEDGE_CATEGORY_LABELS[entry.category as KnowledgeCategoryName] ?? entry.category}</span>
                      </div>
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#888]">{entry.content.replace(/[#*`>]/g, "").replace(/\s+/g, " ").slice(0, 180)}</p>
                      <p className="mt-2 text-[10px] text-[#888]">v{entry.version} · {entry.accessCount} accesses · {entry.updatedAt ? dateTime.format(new Date(entry.updatedAt)) : ""}</p>
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabPanel>

        <TabPanel value="sops">
          {sops.isLoading ? (
            <div role="status" className="grid gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : !sops.data?.items.length ? (
            <Empty
              title="No SOPs yet"
              description="Document a repeatable procedure as ordered steps. Execute it from here as a checklist; every run is recorded with its SOP version."
              action={<SopCreateButton onCreated={async (message) => { setFeedback(message); await invalidate(); }} />}
              icon={<Database className="size-5 text-purple-300" aria-hidden="true" />}
            />
          ) : (
            <ul className="grid gap-2" aria-label="SOPs">
              {sops.data.items.map((sop) => (
                <li key={sop.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-[#F3F5FF]">{sop.title}</p>
                        <p className="mt-0.5 text-[10px] text-[#888]">{sop.steps.length} steps · used {sop.usageCount}× · {sop.lastExecutedAt ? `last ${dateTime.format(new Date(sop.lastExecutedAt))}` : "never executed"}</p>
                      </div>
                      <Button size="sm" onClick={() => setSopFor(sop)}>Run checklist</Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabPanel>
      </Tabs>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New knowledge entry" description="Markdown entry; edits are versioned.">
        <EntryForm
          pending={create.isPending}
          error={create.error ? errorMessage(create.error, "The entry could not be saved.") : undefined}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(input) => create.mutate(input)}
        />
      </Dialog>

      <Drawer open={Boolean(selectedId)} onClose={() => setSelectedId(null)} title="Knowledge entry" description="Content, versions, and edit history.">
        {selectedId ? <EntryDetail entryId={selectedId} onFeedback={setFeedback} onError={setError} /> : null}
      </Drawer>

      <Drawer open={Boolean(sopFor)} onClose={() => setSopFor(null)} title="Run SOP checklist" description="Check off each step; the execution records the exact SOP version.">
        {sopFor ? <SopChecklist sop={sopFor} onDone={async (message) => { setSopFor(null); setFeedback(message); await invalidate(); }} onError={setError} /> : null}
      </Drawer>
    </div>
  );
}

function SopCreateButton({ onCreated }: { onCreated: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden="true" />New SOP</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New SOP" description="Document the procedure as ordered steps.">
        <SopForm
          onCreated={async (message) => { setOpen(false); onCreated(message); }}
        />
      </Dialog>
    </>
  );
}

function SopForm({ onCreated }: { onCreated: (message: string) => void }) {
  const [title, setTitle] = useState("");
  const [outcome, setOutcome] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const steps = stepsText.split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => ({
      title: `Step ${index + 1}`,
      instructions: line,
    }));
    if (!title.trim() || !outcome.trim() || !steps.length) return;
    setPending(true);
    try {
      const sop = await knowledgeApi.createSop({ title: title.trim(), expectedOutcome: outcome.trim(), steps });
      onCreated(`SOP "${sop.title}" created with ${steps.length} steps.`);
    } catch (caught) {
      setError(errorMessage(caught, "The SOP could not be saved."));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="sop-title">Title
        <Input id="sop-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Weekly client reporting" required maxLength={500} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="sop-outcome">Expected outcome
        <Input id="sop-outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="Report sent to client every Monday" required maxLength={2000} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="sop-steps">Steps <span className="text-[#666]">(one per line)</span>
        <Textarea id="sop-steps" rows={6} value={stepsText} onChange={(event) => setStepsText(event.target.value)} placeholder={"Pull metrics from the finance dashboard\nDraft the summary in the client's brand voice\nSend and log the communication"} />
      </label>
      <div className="sticky bottom-0 -mx-6 mt-1 flex items-center justify-end gap-2 border-t border-[#2A2E45] bg-[#0C1020] px-6 pt-3 pb-1">
        <Button type="button" variant="ghost" onClick={() => onCreated("")}>Cancel</Button>
        <Button type="submit" disabled={pending || !title.trim() || !outcome.trim() || !stepsText.trim()}>Create SOP</Button>
      </div>
    </form>
  );
}

function SopChecklist({ sop, onDone, onError }: { sop: SopDto; onDone: (message: string) => void; onError: (message: string) => void }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState(false);

  const finish = async (status: "completed" | "failed") => {
    setPending(true);
    try {
      await knowledgeApi.recordSopExecution(sop.id, {
        status,
        stepResults: sop.steps.map((step) => ({ position: step.position, done: checked.has(step.position) })),
      });
      onDone(`SOP "${sop.title}" execution recorded (${status}).`);
    } catch (caught) {
      onError(errorMessage(caught, "The execution could not be recorded."));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold text-[#F3F5FF]">{sop.title}</h2>
        <p className="mt-1 text-xs text-[#888]">{sop.expectedOutcome} · v{sop.currentVersion}</p>
      </div>
      <ol className="grid gap-2">
        {sop.steps.map((step) => {
          const done = checked.has(step.position);
          return (
            <li key={step.id}>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${done ? "border-[#39FF14]/30 bg-[#39FF14]/[0.04]" : "border-[#2A2E45] bg-[#0C1020] hover:border-[#2A2E45]"}`}>
                <input
                  type="checkbox"
                  className="mt-0.5 accent-cyan-300"
                  checked={done}
                  onChange={() => setChecked((current) => {
                    const next = new Set(current);
                    if (next.has(step.position)) next.delete(step.position);
                    else next.add(step.position);
                    return next;
                  })}
                />
                <span>
                  <span className="text-xs font-medium text-[#F3F5FF]">{step.title}{step.isOptional ? " (optional)" : ""}</span>
                  <span className="mt-1 block text-[11px] leading-5 text-[#888]">{step.instructions}</span>
                  {step.expectedResult ? <span className="mt-1 block text-[10px] text-[#666]">Expected: {step.expectedResult}</span> : null}
                </span>
              </label>
            </li>
          );
        })}
      </ol>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => void finish("failed")} disabled={pending}>Record failure</Button>
        <Button onClick={() => void finish("completed")} disabled={pending}>Complete execution</Button>
      </div>
    </div>
  );
}

function EntryForm({
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (input: Parameters<typeof knowledgeApi.createEntry>[0]) => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("lesson");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");

  return (
    <form className="grid gap-4" onSubmit={(event) => {
      event.preventDefault();
      if (!title.trim() || !content.trim()) return;
      onSubmit({
        title: title.trim(),
        category,
        content: content.trim(),
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
      });
    }}>
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="entry-title">Title
          <Input id="entry-title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={500} />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="entry-category">Category
          <Select id="entry-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {knowledgeCategories.map((entry) => <option key={entry} value={entry}>{KNOWLEDGE_CATEGORY_LABELS[entry as KnowledgeCategoryName]}</option>)}
          </Select>
        </label>
      </div>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="entry-content">Content <span className="text-[#666]">(Markdown)</span>
        <Textarea id="entry-content" rows={10} value={content} onChange={(event) => setContent(event.target.value)} required />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="entry-tags">Tags <span className="text-[#666]">(comma separated)</span>
        <Input id="entry-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="process, automation" />
      </label>
      <div className="sticky bottom-0 -mx-6 mt-1 flex items-center justify-end gap-2 border-t border-[#2A2E45] bg-[#0C1020] px-6 pt-3 pb-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending || !title.trim() || !content.trim()}>Save entry</Button>
      </div>
    </form>
  );
}

function EntryDetail({ entryId, onFeedback, onError }: { entryId: string; onFeedback: (message: string) => void; onError: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [summary, setSummary] = useState("");
  const [pending, setPending] = useState(false);

  const entry = useQuery({
    queryKey: ["knowledge-entry", entryId],
    queryFn: () => knowledgeApi.entry(entryId),
  });

  if (entry.isLoading) {
    return <div role="status" className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-48" /></div>;
  }
  if (entry.isError || !entry.data) {
    return <Empty title="Entry could not be loaded" description={entry.error ? errorMessage(entry.error, "Retry the request.") : ""} action={<Button onClick={() => entry.refetch()}>Retry</Button>} />;
  }

  const data: KnowledgeEntryDto = entry.data;
  const save = async () => {
    setPending(true);
    try {
      await knowledgeApi.updateEntry(entryId, { content: draft.trim(), changeSummary: summary.trim() || undefined });
      setEditing(false);
      setSummary("");
      onFeedback(`Saved a new version (v${data.version + 1}) of "${data.title}".`);
      await entry.refetch();
    } catch (caught) {
      onError(errorMessage(caught, "The entry could not be saved."));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#F3F5FF]">{data.title}</h2>
          <p className="mt-1 text-xs text-[#888]">{KNOWLEDGE_CATEGORY_LABELS[data.category as KnowledgeCategoryName]} · v{data.version} · {data.accessCount} accesses</p>
        </div>
        {!editing ? (
          <Button size="sm" variant="ghost" onClick={() => { setEditing(true); setDraft(data.content); }}>Edit</Button>
        ) : null}
      </div>
      {editing ? (
        <div className="grid gap-2">
          <Textarea rows={10} value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Entry content" />
          <Input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Change summary (optional)" maxLength={500} aria-label="Change summary" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={() => void save()} disabled={pending || draft.trim() === data.content}>Save new version</Button>
          </div>
        </div>
      ) : (
        <pre className="surface-scrollbar max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-[#2A2E45] bg-[#111533] p-4 text-xs leading-6 text-[#C5C8DB]">{data.content}</pre>
      )}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#C5C8DB]">Version history</h3>
        <ol className="mt-2 grid gap-1.5">
          {data.versions.map((version) => (
            <li key={version.version} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2A2E45] px-3 py-2 text-[11px]">
              <span className="text-[#C5C8DB]">v{version.version} · {version.changeSummary ?? "-"}{version.createdBy ? ` · by ${version.createdBy}` : ""}</span>
              <span className="text-[10px] text-[#666]">{version.createdAt ? dateTime.format(new Date(version.createdAt)) : ""}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
