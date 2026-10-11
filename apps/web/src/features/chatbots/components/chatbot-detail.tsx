"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FilePlus2, Play, Send } from "lucide-react";
import { Button, Card, CardContent, Empty, Input, Skeleton, Tab, TabPanel, Tabs, TabsList, Textarea, useAnnounce } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { chatbotApi, type ChatbotDetailDto } from "../lib/chatbot-api";

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

export function ChatbotDetail({
  chatbotId,
  onFeedback,
}: {
  chatbotId: string;
  onFeedback: (message: string) => void;
}) {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [error, setError] = useState("");

  const detail = useQuery({
    queryKey: ["chatbot", chatbotId],
    queryFn: () => chatbotApi.detail(chatbotId),
  });

  const invalidate = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["chatbot", chatbotId] }),
      cache.invalidateQueries({ queryKey: ["chatbots"] }),
    ]);
  };

  const setStatus = useMutation({
    mutationFn: (action: "deploy" | "pause" | "archive") => chatbotApi.setStatus(chatbotId, action),
    onSuccess: async (chatbot) => {
      const message = chatbot.status === "active"
        ? `${chatbot.name} is live. Test it from the Conversations tab.`
        : chatbot.status === "paused" ? `${chatbot.name} was paused.` : `${chatbot.name} was archived.`;
      onFeedback(message);
      announce(message);
      await invalidate();
    },
    onError: (caught) => setError(errorMessage(caught, "The status change failed.")),
  });

  if (detail.isLoading) {
    return <div role="status" className="grid gap-3"><span className="sr-only">Loading chatbot…</span><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;
  }
  if (detail.isError || !detail.data) {
    return <Empty title="Chatbot could not be loaded" description={detail.error ? errorMessage(detail.error, "Retry the request.") : ""} action={<Button onClick={() => detail.refetch()}>Retry</Button>} />;
  }

  const chatbot = detail.data;
  return (
    <div className="grid gap-5">
      {error ? <p role="alert" className="rounded-lg border border-[#FF4D6D]/30 bg-[#FF4D6D]/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#F3F5FF]">{chatbot.name}</h2>
            <p className="mt-1 text-xs text-[#888]">{chatbot.clientName} · v{chatbot.version?.version ?? 1} config · threshold {Math.round((chatbot.config?.confidenceThreshold ?? 0.7) * 100)}%</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chatbot.status !== "active" ? (
              <Button size="sm" onClick={() => setStatus.mutate("deploy")} disabled={setStatus.isPending}>
                <Play className="size-3.5" aria-hidden="true" />Deploy
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setStatus.mutate("pause")} disabled={setStatus.isPending}>Pause</Button>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="sources">
        <TabsList className="surface-scrollbar mb-4 flex gap-1 overflow-x-auto border-b border-[#2A2E45]">
          <Tab value="sources">Knowledge ({chatbot.sources.length})</Tab>
          <Tab value="conversations">Conversations ({chatbot.conversations.length})</Tab>
          <Tab value="config">Configuration</Tab>
        </TabsList>

        <TabPanel value="sources">
          <div className="grid gap-3">
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setSourceOpen((open) => !open)}>
                <FilePlus2 className="size-3.5" aria-hidden="true" />Add knowledge source
              </Button>
            </div>
            {sourceOpen ? (
              <SourceForm
                chatbotId={chatbotId}
                onClose={() => setSourceOpen(false)}
                onDone={async (message) => {
                  setSourceOpen(false);
                  onFeedback(message);
                  await invalidate();
                }}
                onError={setError}
              />
            ) : null}
            {!chatbot.sources.length ? (
              <Empty title="No knowledge yet" description="Paste FAQ or product content. The chatbot extracts Q&A pairs for your review - approve them, then deploy." />
            ) : (
              <ul className="grid gap-2" aria-label="Knowledge sources">
                {chatbot.sources.map((source) => (
                  <li key={source.id}>
                    <Card>
                      <CardContent className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-[#F3F5FF]">{source.title}</p>
                          <p className="mt-1 text-[10px] text-[#888]">
                            {source.type.replaceAll("_", " ")} · {source.qaPairCount} Q&A · {source.pendingQaCount} pending review
                            {source.approvedAt ? ` · approved ${dateTime.format(new Date(source.approvedAt))}` : ""}
                          </p>
                        </div>
                        {!source.approvedAt ? (
                          <Button size="sm" onClick={async () => {
                            try {
                              const updated = await chatbotApi.approveSource(chatbotId, source.id);
                              onFeedback(`Approved ${updated.sources.find((entry) => entry.id === source.id)?.qaPairCount ?? 0} Q&A pairs for "${source.title}".`);
                              await invalidate();
                            } catch (caught) {
                              setError(errorMessage(caught, "The source could not be approved."));
                            }
                          }}>
                            <Check className="size-3.5" aria-hidden="true" />Approve Q&A
                          </Button>
                        ) : (
                          <span className="text-[10px] font-medium uppercase tracking-wide text-[#39FF14]">Approved</span>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabPanel>

        <TabPanel value="conversations">
          <TestChat chatbot={chatbot} onConversationStarted={() => { void invalidate(); }} onError={setError} />
          {chatbot.conversations.length ? (
            <div className="mt-5 grid gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#C5C8DB]">Recent conversations</h3>
              <ul className="grid gap-2" aria-label="Recent conversations">
                {chatbot.conversations.map((conversation) => (
                  <li key={conversation.id} className="rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-[#C5C8DB]">{dateTime.format(new Date(conversation.createdAt))} · {conversation.messageCount} messages</span>
                      <span className={conversation.isLowConfidence ? "text-orange-300" : "text-[#39FF14]"}>
                        {conversation.isLowConfidence ? "Escalated - low confidence" : conversation.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </TabPanel>

        <TabPanel value="config">
          <dl className="grid gap-2 rounded-xl border border-[#2A2E45] bg-[#0C1020] p-4 text-xs sm:grid-cols-2">
            <div className="flex justify-between gap-2"><dt className="text-[#888]">Platform</dt><dd className="text-[#C5C8DB]">{chatbot.platform}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-[#888]">Model</dt><dd className="font-mono text-cyan-200">{chatbot.config?.model ?? "-"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-[#888]">Confidence threshold</dt><dd className="font-mono text-[#C5C8DB]">{chatbot.config?.confidenceThreshold ?? "-"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-[#888]">Greeting</dt><dd className="text-[#C5C8DB]">{chatbot.config?.greetingMessage ?? "-"}</dd></div>
          </dl>
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[#C5C8DB]">System prompt</h4>
            <pre className="surface-scrollbar mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-[#2A2E45] bg-[#111533] p-3 font-mono text-[11px] leading-5 text-[#C5C8DB]">{chatbot.config?.systemPrompt ?? "-"}</pre>
          </div>
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[#C5C8DB]">Version history</h4>
            <ol className="mt-2 grid gap-1.5">
              {chatbot.versions.map((version) => (
                <li key={version.version} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2A2E45] px-3 py-2 text-[11px]">
                  <span className="text-[#C5C8DB]">v{version.version} · {version.name}{version.publishedAt ? " · published" : ""}</span>
                  <span className="text-[10px] text-[#666]">{version.createdAt ? dateTime.format(new Date(version.createdAt)) : ""}</span>
                </li>
              ))}
            </ol>
          </div>
        </TabPanel>
      </Tabs>
    </div>
  );
}

function SourceForm({
  chatbotId,
  onClose,
  onDone,
  onError,
}: {
  chatbotId: string;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"faq" | "product_document" | "website_url">("faq");
  const [sourceUrl, setSourceUrl] = useState("");
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!title.trim() || !content.trim()) return;
    setPending(true);
    try {
      const result = await chatbotApi.addSource(chatbotId, {
        title: title.trim(),
        type,
        sourceUrl: type === "website_url" ? sourceUrl.trim() : null,
        content: content.trim(),
      });
      onDone(`Ingested "${title}" - ${result.qaPairCount} Q&A pairs extracted. Review and approve them, then deploy.`);
    } catch (caught) {
      onError(errorMessage(caught, "The source could not be ingested."));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="source-title">Title
            <Input id="source-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Pricing FAQ" maxLength={500} />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="source-type">Type
            <select id="source-type" className="h-9 rounded-lg border border-[#2A2E45] bg-[#0C1020] px-3 text-xs text-[#F3F5FF]" value={type} onChange={(event) => setType(event.target.value as typeof type)}>
              <option value="faq">FAQ document</option>
              <option value="product_document">Product document</option>
              <option value="website_url">Website URL</option>
            </select>
          </label>
        </div>
        {type === "website_url" ? (
          <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="source-url">Source URL
            <Input id="source-url" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://client.com/faq" />
          </label>
        ) : null}
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]" htmlFor="source-content">Content
          <Textarea id="source-content" rows={8} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Paste the FAQ or product content. Separate topics with blank lines - each paragraph becomes a reviewable Q&A pair." />
        </label>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} type="button">Close</Button>
          <Button size="sm" onClick={() => void submit()} disabled={pending || !title.trim() || !content.trim()}>
            {pending ? "Ingesting…" : "Ingest & extract Q&A"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TestChat({
  chatbot,
  onConversationStarted,
  onError,
}: {
  chatbot: ChatbotDetailDto;
  onConversationStarted: () => void;
  onError: (message: string) => void;
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ role: string; content: string; confidence?: number | null }>>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [started, setStarted] = useState(false);

  const send = async () => {
    if (!input.trim() || pending) return;
    const message = input.trim();
    setInput("");
    setMessages((current) => [...current, { role: "user", content: message }]);
    setPending(true);
    try {
      const response = await chatbotApi.chat(chatbot.id, message, conversationId);
      setConversationId(response.conversationId);
      setMessages((current) => [...current, { role: "assistant", content: response.message.content, confidence: response.message.confidence }]);
      if (!started) {
        setStarted(true);
        onConversationStarted();
      }
    } catch (caught) {
      onError(errorMessage(caught, "The message could not be sent."));
    } finally {
      setPending(false);
    }
  };

  if (chatbot.status !== "active") {
    return (
      <div className="rounded-xl border border-[#2A2E45] bg-[#0C1020] p-4 text-xs text-[#888]">
        Deploy this chatbot to test conversations. Answers come only from approved Q&A; anything below the confidence threshold gets the fallback and is flagged for escalation.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-[#2A2E45] bg-[#0C1020] p-3">
        <div className="surface-scrollbar grid max-h-72 gap-2 overflow-y-auto" aria-label="Test conversation" aria-live="polite">
          {chatbot.config?.greetingMessage && !messages.length ? (
            <p className="rounded-lg bg-[#111533] px-3 py-2 text-xs text-[#C5C8DB]">{chatbot.config.greetingMessage}</p>
          ) : null}
          {messages.map((message, index) => (
            <div
              key={index}
              className={message.role === "user"
                ? "ml-auto max-w-[85%] rounded-lg bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100"
                : "max-w-[85%] rounded-lg bg-[#111533] px-3 py-2 text-xs text-[#C5C8DB]"}
            >
              {message.content}
              {message.role === "assistant" && message.confidence != null ? (
                <span className="mt-1 block text-[9px] text-[#666]">confidence {Math.round(message.confidence * 100)}%</span>
              ) : null}
            </div>
          ))}
          {pending ? <p className="text-[10px] text-[#666]">Thinking…</p> : null}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask a question from the approved knowledge…" aria-label="Test message" />
          <Button type="submit" size="icon" disabled={pending || !input.trim()} aria-label="Send message">
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </form>
      </div>
      <p className="text-[10px] leading-4 text-[#666]">Grounded answers only: responses come from approved Q&A pairs. Low-confidence questions fall back and mark the conversation for escalation.</p>
    </div>
  );
}
