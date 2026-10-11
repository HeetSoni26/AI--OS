import { describe, expect, it } from "vitest";
import { ModelGateway, ProviderCallError, generateSimulated, resolveProviderForModel } from "./provider";
import { requiresApprovalForTools } from "./tools";

const baseRequest = {
  model: "gpt-4o-mini",
  systemPrompt: "You are a test agent.",
  inputText: "Say hello.",
  temperature: 0.7,
  maxTokens: 100,
  topP: 1,
  frequencyPenalty: 0,
};

describe("resolveProviderForModel", () => {
  it("falls back to simulated when no key is configured", () => {
    expect(resolveProviderForModel("gpt-4o", {})).toBe("simulated");
    expect(resolveProviderForModel("claude-4", {})).toBe("simulated");
    expect(resolveProviderForModel("unknown-model", { openaiApiKey: "k" })).toBe("simulated");
  });

  it("selects the configured provider when a key exists", () => {
    expect(resolveProviderForModel("gpt-4o", { openaiApiKey: "k" })).toBe("openai");
    expect(resolveProviderForModel("claude-4", { anthropicApiKey: "k" })).toBe("anthropic");
  });
});

describe("generateSimulated", () => {
  it("produces clearly-labeled deterministic output with token accounting", () => {
    const result = generateSimulated(baseRequest);
    expect(result.simulated).toBe(true);
    expect(result.provider).toBe("simulated");
    expect(result.text).toContain("[Simulated run");
    expect(result.tokensInput).toBeGreaterThan(0);
    expect(result.tokensOutput).toBeGreaterThan(0);
    expect(result.finishReason).toBe("stop");
  });
});

describe("ModelGateway", () => {
  it("routes to the simulated provider without network access", async () => {
    const gateway = new ModelGateway({});
    const result = await gateway.generate(baseRequest);
    expect(result.simulated).toBe(true);
    expect(result.model).toBe("gpt-4o-mini");
  });

  it("normalizes OpenAI chat completion responses", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: "Hello from OpenAI." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 34 },
    }), { status: 200 })) as unknown as typeof fetch;
    const gateway = new ModelGateway({ openaiApiKey: "test-key", fetch: fetchImpl });
    const result = await gateway.generate(baseRequest);
    expect(result.text).toBe("Hello from OpenAI.");
    expect(result.provider).toBe("openai");
    expect(result.simulated).toBe(false);
    expect(result.tokensInput).toBe(12);
    expect(result.tokensOutput).toBe(34);
  });

  it("normalizes Anthropic message responses and applies model aliases", async () => {
    const captured: { url: string; body: Record<string, unknown> }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      captured.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "Hello from Claude." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 9, output_tokens: 21 },
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const gateway = new ModelGateway({ anthropicApiKey: "test-key", fetch: fetchImpl });
    const result = await gateway.generate({ ...baseRequest, model: "claude-3-5-sonnet" });
    expect(result.text).toBe("Hello from Claude.");
    expect(result.provider).toBe("anthropic");
    expect(captured[0]?.url).toContain("/v1/messages");
    expect(captured[0]?.body.model).toBe("claude-3-5-sonnet-latest");
    expect(result.tokensInput).toBe(9);
    expect(result.tokensOutput).toBe(21);
  });

  it("surfaces provider errors with status codes for retry classification", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      error: { message: "Rate limited", code: "rate_limit_exceeded" },
    }), { status: 429 })) as unknown as typeof fetch;
    const gateway = new ModelGateway({ openaiApiKey: "test-key", fetch: fetchImpl });
    const error = await gateway.generate(baseRequest).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderCallError);
    expect((error as ProviderCallError).status).toBe(429);
    expect((error as ProviderCallError).message).toBe("Rate limited");
  });
});

describe("tool registry", () => {
  it("requires approval only for consequential tools", () => {
    expect(requiresApprovalForTools(["web_search", "file_read"])).toBe(false);
    expect(requiresApprovalForTools(["web_search", "email_send"])).toBe(true);
    expect(requiresApprovalForTools(["api_call"])).toBe(true);
    expect(requiresApprovalForTools(["unknown-tool"])).toBe(true);
  });
});
