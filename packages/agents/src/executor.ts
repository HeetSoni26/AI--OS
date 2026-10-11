import { AgentRunStatus, AgentStatus, classifyRunError, computeRunCostUsd, type PrismaAgentService } from "@aios/data";
import { ModelGateway, ProviderCallError, resolveProviderForModel, type GenerateResult } from "./provider";

export type ExecutionOutcome =
  | { kind: "completed" }
  | { kind: "retry_scheduled"; delayMs: number; attempt: number }
  | { kind: "awaiting_approval" }
  | { kind: "skipped"; reason: string }
  | { kind: "failed" };

export interface ExecutorOptions {
  /** Provider request timeout in milliseconds. */
  timeoutMs?: number;
}

const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

export class AgentRunExecutor {
  constructor(
    private readonly service: PrismaAgentService,
    private readonly gateway: ModelGateway = new ModelGateway({ timeoutMs: 120_000 }),
    private readonly options: ExecutorOptions = {},
  ) {}

  /**
   * Executes one claimed run end to end: approval checkpoints, provider call,
   * retries with classified backoff, cost recording, and chain fan-out.
   */
  async executeRun(runId: string): Promise<ExecutionOutcome> {
    const correlationId = `run:${runId}:${Date.now()}`;
    const plan = await this.service.getRunExecutionPlan(runId);
    if (!plan) return { kind: "skipped", reason: "run_missing" };
    const { run, agent, configVersion, memoryContext } = plan;

    const metadata = (run.metadata ?? {}) as Record<string, unknown>;
    if (metadata.awaitingApproval === true) {
      await this.service.requestRunApproval(correlationId, runId);
      return { kind: "awaiting_approval" };
    }
    if (run.status !== AgentRunStatus.RUNNING) return { kind: "skipped", reason: `status_${String(run.status)}` };
    if (agent.status === AgentStatus.PAUSED) {
      await this.service.failRun(correlationId, runId, {
        errorClass: "terminal",
        errorMessage: "Run cancelled because the agent was paused.",
      });
      return { kind: "skipped", reason: "agent_paused" };
    }

    const model = configVersion?.model ?? agent.model;
    const systemPrompt = configVersion?.systemPrompt ?? agent.systemPrompt;
    const temperature = Number(configVersion?.temperature ?? agent.temperature);
    const maxTokens = configVersion?.maxTokens ?? agent.maxTokens;
    const topP = Number(configVersion?.topP ?? agent.topP);
    const frequencyPenalty = Number(configVersion?.frequencyPenalty ?? agent.frequencyPenalty);

    try {
      const result = await this.gateway.generate({
        model,
        systemPrompt,
        inputText: run.inputText ?? "",
        temperature,
        maxTokens,
        topP,
        frequencyPenalty,
        memoryContext,
      });
      const costUsd = computeRunCostUsd(model, result.tokensInput, result.tokensOutput) ?? 0;
      await this.service.completeRun(correlationId, runId, {
        outputText: result.text,
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        costUsd,
        durationMs: result.latencyMs,
        model,
        metadata: {
          provider: result.provider,
          simulated: result.simulated,
          finishReason: result.finishReason,
          model,
          triggerType: run.triggerType,
        },
      });
      return { kind: "completed" };
    } catch (error) {
      return this.handleFailure(correlationId, runId, model, error);
    }
  }

  private async handleFailure(correlationId: string, runId: string, model: string, error: unknown): Promise<ExecutionOutcome> {
    const status = error instanceof ProviderCallError ? error.status : undefined;
    const code = error instanceof ProviderCallError ? error.code : undefined;
    const message = error instanceof Error ? error.message : "Unknown provider failure.";
    const errorClass = classifyRunError({ status, code, message });
    const result = await this.service.failRun(correlationId, runId, {
      errorClass,
      errorMessage: message,
      metadata: { model, provider: resolveProviderForModel(model, {}), errorClass },
    });
    if ("retryScheduled" in result) {
      const nextAttemptAt = ((result.run.metadata ?? {}) as Record<string, unknown>).nextAttemptAt;
      const delayMs = typeof nextAttemptAt === "string"
        ? Math.max(0, new Date(nextAttemptAt).getTime() - Date.now())
        : RETRY_DELAYS_MS[Math.min(result.run.attempt - 1, RETRY_DELAYS_MS.length - 1)] ?? 120_000;
      return { kind: "retry_scheduled", delayMs, attempt: result.run.attempt };
    }
    return { kind: "failed" };
  }
}

export type { GenerateResult };
