import { modelProvider } from "@aios/data";

export type ProviderName = "openai" | "anthropic" | "simulated";

export interface ProviderGatewayConfig {
  openaiApiKey?: string | null;
  openaiBaseUrl?: string;
  anthropicApiKey?: string | null;
  anthropicBaseUrl?: string;
  /** Per-request provider timeout. */
  timeoutMs?: number;
  fetch?: typeof fetch;
  /** Optional JSON map from catalog model ids to provider API model ids. */
  modelAliases?: Record<string, string>;
}

export interface GenerateRequest {
  model: string;
  systemPrompt: string;
  inputText: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  memoryContext?: readonly string[];
}

export interface GenerateResult {
  text: string;
  provider: ProviderName;
  simulated: boolean;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
  finishReason: string;
}

/** Normalized provider failure consumed by run error classification. */
export class ProviderCallError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ProviderCallError";
  }
}

const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_ANTHROPIC_BASE = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_ALIASES: Record<string, string> = {
  "claude-3-5-sonnet": "claude-3-5-sonnet-latest",
  "claude-4": "claude-sonnet-4-0",
};

export function resolveProviderForModel(model: string, config: ProviderGatewayConfig): ProviderName {
  const provider = modelProvider(model);
  if (provider === "openai") return config.openaiApiKey ? "openai" : "simulated";
  if (provider === "anthropic") return config.anthropicApiKey ? "anthropic" : "simulated";
  return "simulated";
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

/** Deterministic offline provider used when no API key is configured. Clearly labeled simulated. */
export function generateSimulated(request: GenerateRequest): GenerateResult {
  const started = Date.now();
  const memoryNote = request.memoryContext?.length
    ? `Relevant memory considered:\n${request.memoryContext.map((line) => `- ${line}`).join("\n")}\n\n`
    : "";
  const task = request.inputText?.trim() || "the standing agent instructions";
  const text = [
    "[Simulated run - set AIOS_OPENAI_API_KEY or AIOS_ANTHROPIC_API_KEY to enable live models.]",
    "",
    `Task: ${task.slice(0, 800)}`,
    "",
    `Approach: ${request.systemPrompt.slice(0, 400).replace(/\s+/g, " ") || "No system prompt configured."}`,
    "",
    "Result summary:",
    "1. The agent runtime executed this run end to end (queue → execution → cost ledger).",
    "2. Output, token accounting, and cost use the deterministic simulation provider.",
    "3. Configure a provider API key to replace this output with a live model completion.",
  ].join("\n");
  void memoryNote;
  return {
    text,
    provider: "simulated",
    simulated: true,
    model: request.model,
    tokensInput: estimateTokens(`${request.systemPrompt}\n${task}`),
    tokensOutput: estimateTokens(text),
    latencyMs: Math.max(1, Date.now() - started),
    finishReason: "stop",
  };
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<{ status: number; ok: boolean; json: unknown }> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, ok: response.ok, json };
}

function providerError(provider: string, status: number, json: unknown): ProviderCallError {
  const record = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const errorRecord = (record.error && typeof record.error === "object" ? record.error : {}) as Record<string, unknown>;
  const message = typeof errorRecord.message === "string"
    ? errorRecord.message
    : `${provider} request failed with status ${status}.`;
  const code = typeof errorRecord.code === "string" ? errorRecord.code : undefined;
  return new ProviderCallError(message, status, code);
}

export class ModelGateway {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ProviderGatewayConfig = {}) {
    this.fetchImpl = config.fetch ?? globalThis.fetch;
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const provider = resolveProviderForModel(request.model, this.config);
    if (provider === "simulated") return generateSimulated(request);
    const timeoutMs = this.config.timeoutMs ?? 120_000;
    const memoryBlock = request.memoryContext?.length
      ? `\n\nRelevant memory:\n${request.memoryContext.map((line) => `- ${line}`).join("\n")}`
      : "";
    const started = Date.now();
    if (provider === "openai") {
      const { status, ok, json } = await postJson(
        `${this.config.openaiBaseUrl ?? DEFAULT_OPENAI_BASE}/chat/completions`,
        { authorization: `Bearer ${this.config.openaiApiKey}` },
        {
          model: this.config.modelAliases?.[request.model] ?? request.model,
          messages: [
            { role: "system", content: `${request.systemPrompt}${memoryBlock}` },
            { role: "user", content: request.inputText || "Proceed with the standing instructions." },
          ],
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          top_p: request.topP,
          frequency_penalty: request.frequencyPenalty,
        },
        timeoutMs,
        this.fetchImpl,
      );
      if (!ok) throw providerError("OpenAI", status, json);
      const payload = json as {
        choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const choice = payload.choices?.[0];
      const text = choice?.message?.content ?? "";
      return {
        text,
        provider,
        simulated: false,
        model: request.model,
        tokensInput: payload.usage?.prompt_tokens ?? estimateTokens(request.systemPrompt),
        tokensOutput: payload.usage?.completion_tokens ?? estimateTokens(text),
        latencyMs: Math.max(1, Date.now() - started),
        finishReason: choice?.finish_reason ?? "stop",
      };
    }
    const alias = this.config.modelAliases?.[request.model]
      ?? DEFAULT_ANTHROPIC_ALIASES[request.model]
      ?? request.model;
    const { status, ok, json } = await postJson(
      `${this.config.anthropicBaseUrl ?? DEFAULT_ANTHROPIC_BASE}/v1/messages`,
      { "x-api-key": this.config.anthropicApiKey!, "anthropic-version": "2023-06-01" },
      {
        model: alias,
        system: `${request.systemPrompt}${memoryBlock}`,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        top_p: request.topP,
        messages: [{ role: "user", content: request.inputText || "Proceed with the standing instructions." }],
      },
      timeoutMs,
      this.fetchImpl,
    );
    if (!ok) throw providerError("Anthropic", status, json);
    const payload = json as {
      content?: Array<{ type?: string; text?: string }>;
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (payload.content ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join("");
    return {
      text,
      provider,
      simulated: false,
      model: request.model,
      tokensInput: payload.usage?.input_tokens ?? estimateTokens(request.systemPrompt),
      tokensOutput: payload.usage?.output_tokens ?? estimateTokens(text),
      latencyMs: Math.max(1, Date.now() - started),
      finishReason: payload.stop_reason ?? "end_turn",
    };
  }
}
