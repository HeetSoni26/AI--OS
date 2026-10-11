"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CHATBOT_PLATFORM_LABELS,
  CHATBOT_STATUS_LABELS,
  type ChatbotPlatformName,
  type ChatbotStatus,
} from "@aios/contracts";
import { MessagesSquare, Plus, Search } from "lucide-react";
import { Button, Card, CardContent, Dialog, Drawer, Empty, Input, Select, Skeleton, Textarea, useAnnounce } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { clientApi } from "@/features/clients/lib/client-api";
import { ChatbotDetail } from "./chatbot-detail";
import { chatbotApi, type ChatbotDetailDto, type ChatbotUpsertInput } from "../lib/chatbot-api";

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

const STATUS_STYLES: Record<ChatbotStatus, string> = {
  active: "text-[#39FF14]",
  draft: "text-amber-200",
  paused: "text-[#888]",
  archived: "text-[#666]",
};

function StatusPill({ status }: { status: ChatbotStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2A2E45] bg-[#0C1020] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
      <span className={`size-1.5 rounded-full ${status === "active" ? "bg-[#39FF14]" : status === "draft" ? "bg-amber-300" : status === "paused" ? "bg-[#888]" : "bg-[#666]"}`} aria-hidden="true" />
      <span className={STATUS_STYLES[status] ?? "text-[#888]"}>{CHATBOT_STATUS_LABELS[status]}</span>
    </span>
  );
}

export function ChatbotsWorkspace() {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  const chatbots = useQuery({
    queryKey: ["chatbots", { search }],
    queryFn: () => chatbotApi.list({ search: search || undefined }),
  });
  const clients = useQuery({
    queryKey: ["chatbots-clients"],
    queryFn: () => clientApi.list({ limit: 100, archiveScope: "active", sort: "name", direction: "asc", view: "list" }),
    staleTime: 60_000,
  });

  const invalidate = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["chatbots"] }),
      cache.invalidateQueries({ queryKey: ["chatbot"] }),
    ]);
  };

  const create = useMutation({
    mutationFn: (input: ChatbotUpsertInput) => chatbotApi.create(input),
    onSuccess: async (chatbot) => {
      setCreateOpen(false);
      setSelectedId(chatbot.id);
      setFeedback(`${chatbot.name} was created as a draft. Add a knowledge source, approve its Q&A, then deploy.`);
      announce(`${chatbot.name} was created.`);
      await invalidate();
    },
  });

  const stats = useMemo(() => {
    const items = chatbots.data?.items ?? [];
    return {
      count: items.length,
      active: items.filter((chatbot) => chatbot.status === "active").length,
      openConversations: items.reduce((sum, chatbot) => sum + chatbot.openConversationCount, 0),
      escalations: 0,
    };
  }, [chatbots.data]);

  const clientOptions = useMemo(
    () => (clients.data?.items ?? []).map((client) => ({ id: client.id, name: client.name })),
    [clients.data],
  );

  return (
    <div className="grid gap-6">
      <header className="flex flex-col justify-between gap-4 border-b border-[#2A2E45] pb-6 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-purple-300">/ client services</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#F3F5FF] sm:text-3xl">Chatbots</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#888]">Build client chatbots from approved knowledge, review their Q&A, deploy them, and watch live conversations - with escalation instead of invented answers.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" aria-hidden="true" />New chatbot</Button>
      </header>

      {feedback ? <p role="status" className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-3 text-xs text-cyan-100">{feedback}</p> : null}
      {create.error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-4 py-3 text-xs text-red-200">{errorMessage(create.error, "The chatbot could not be created.")}</p> : null}

      <section aria-label="Chatbot summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Chatbots</p><p className="mt-1 font-mono text-xl text-[#F3F5FF]">{stats.count}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Active</p><p className="mt-1 font-mono text-xl text-[#39FF14]">{stats.active}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Open conversations</p><p className="mt-1 font-mono text-xl text-cyan-200">{stats.openConversations}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wide text-[#666]">Escalated</p><p className="mt-1 font-mono text-xl text-orange-300">{stats.escalations}</p></CardContent></Card>
      </section>

      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#666]" />
        <Input
          type="search"
          className="pl-10"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") setSearch(searchDraft); }}
          placeholder="Search chatbots by name…  (press Enter)"
          aria-label="Search chatbots"
        />
      </div>

      <section aria-labelledby="chatbot-results-heading" aria-busy={chatbots.isLoading || chatbots.isFetching}>
        <h2 id="chatbot-results-heading" className="sr-only">Chatbot results</h2>
        {chatbots.isLoading ? (
          <div role="status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><span className="sr-only">Loading chatbots…</span><Skeleton className="h-36" /><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
        ) : chatbots.isError ? (
          <Empty title="Chatbots could not be loaded" description={errorMessage(chatbots.error, "Retry the request.")} action={<Button onClick={() => chatbots.refetch()}>Retry</Button>} />
        ) : !chatbots.data?.items.length ? (
          <Empty
            title="No chatbots yet"
            description="Create your first client chatbot, paste its FAQ content, approve the extracted Q&A, and deploy - it takes about a minute."
            action={<Button onClick={() => setCreateOpen(true)}><Plus className="size-4" aria-hidden="true" />New chatbot</Button>}
            icon={<MessagesSquare className="size-5 text-purple-300" aria-hidden="true" />}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="chatbot-cards">
            {chatbots.data.items.map((chatbot) => (
              <Card key={chatbot.id} className="h-full transition-colors hover:border-purple-300/40">
                <CardContent className="grid h-full gap-3">
                  <button type="button" className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60" onClick={() => setSelectedId(chatbot.id)} aria-label={`Open ${chatbot.name}`}>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-medium text-[#F3F5FF]">{chatbot.name}</h3>
                      <StatusPill status={chatbot.status} />
                    </div>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-purple-300">{chatbot.clientName} · {CHATBOT_PLATFORM_LABELS[chatbot.platform as ChatbotPlatformName]}</p>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div><dt className="text-[10px] uppercase text-[#888]">Sources</dt><dd className="mt-0.5 font-mono text-[#C5C8DB]">{chatbot.sourceCount}</dd></div>
                      <div><dt className="text-[10px] uppercase text-[#888]">Chats</dt><dd className="mt-0.5 font-mono text-cyan-200">{chatbot.conversationCount}</dd></div>
                      <div><dt className="text-[10px] uppercase text-[#888]">Open</dt><dd className="mt-0.5 font-mono text-[#39FF14]">{chatbot.openConversationCount}</dd></div>
                    </dl>
                    <p className="mt-2 text-[10px] text-[#888]">{chatbot.activeVersion ? `Deployed v${chatbot.activeVersion}` : "Not deployed"}</p>
                  </button>
                  <div className="mt-auto flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(chatbot.id)}>Open</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New chatbot" description="Pick the client, give it a voice, then add knowledge and deploy.">
        <ChatbotForm
          clients={clientOptions}
          pending={create.isPending}
          error={create.error ? errorMessage(create.error, "The chatbot could not be saved.") : undefined}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(input) => create.mutate(input)}
        />
      </Dialog>

      <Drawer open={Boolean(selectedId)} onClose={() => setSelectedId(null)} title="Chatbot details" description="Configuration, knowledge sources, conversations, and a live test chat.">
        {selectedId ? <ChatbotDetail chatbotId={selectedId} onFeedback={setFeedback} /> : null}
      </Drawer>
    </div>
  );
}

function ChatbotForm({
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
  onSubmit: (input: ChatbotUpsertInput) => void;
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<ChatbotUpsertInput["platform"]>("website");
  const [brandVoice, setBrandVoice] = useState("Friendly, concise, and helpful.");
  const [greeting, setGreeting] = useState("Hi! How can I help you today?");
  const [fallback, setFallback] = useState("I'm not sure about that one - let me connect you with a person who can help.");
  const [confidence, setConfidence] = useState("0.7");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant for the client's business. Answer only from the approved knowledge. If unsure, say so and offer escalation.");

  const submit = () => {
    if (!clientId || !name.trim()) return;
    onSubmit({
      clientId,
      platform,
      allowedDomains: [],
      config: {
        name: name.trim(),
        brandVoice: brandVoice.trim(),
        greetingMessage: greeting.trim(),
        fallbackResponse: fallback.trim(),
        confidenceThreshold: Number(confidence) || 0.7,
        model: "gpt-4o-mini",
        systemPrompt: systemPrompt.trim(),
      },
    });
  };

  return (
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="chatbot-client">Client
          <Select id="chatbot-client" value={clientId} onChange={(event) => setClientId(event.target.value)} required>
            <option value="">Choose a client…</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </Select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="chatbot-platform">Platform
          <Select id="chatbot-platform" value={platform} onChange={(event) => setPlatform(event.target.value as ChatbotUpsertInput["platform"])}>
            <option value="website">Website Widget</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram DM</option>
            <option value="api">Custom API</option>
          </Select>
        </label>
      </div>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="chatbot-name">Chatbot name
        <Input id="chatbot-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Stellar Assistant" required maxLength={255} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="chatbot-greeting">Greeting message
        <Input id="chatbot-greeting" value={greeting} onChange={(event) => setGreeting(event.target.value)} maxLength={1000} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="chatbot-fallback">Fallback response <span className="text-[#666]">(used when confidence is below threshold)</span>
        <Textarea id="chatbot-fallback" rows={2} value={fallback} onChange={(event) => setFallback(event.target.value)} maxLength={1000} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="chatbot-confidence">Confidence threshold
          <Input id="chatbot-confidence" type="number" step="0.05" min={0} max={1} value={confidence} onChange={(event) => setConfidence(event.target.value)} />
        </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="chatbot-voice">Brand voice
        <Input id="chatbot-voice" value={brandVoice} onChange={(event) => setBrandVoice(event.target.value)} maxLength={2000} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="chatbot-system-prompt">System prompt
        <Textarea id="chatbot-system-prompt" rows={2} value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} maxLength={20000} />
      </label>
      </div>
      <div className="sticky bottom-0 -mx-6 mt-1 flex items-center justify-end gap-2 border-t border-[#2A2E45] bg-[#0C1020] px-6 pt-3 pb-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending || !clientId || !name.trim()}>Create chatbot</Button>
      </div>
    </form>
  );
}

export type { ChatbotDetailDto };
