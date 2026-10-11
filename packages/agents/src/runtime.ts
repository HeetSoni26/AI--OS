import { PrismaAgentService } from "@aios/data";
import { AgentRunExecutor } from "./executor";
import { ModelGateway, type ProviderGatewayConfig } from "./provider";
import { InProcessAgentQueue } from "./queue";
import { AgentScheduler } from "./scheduler";
import { describeTools } from "./tools";

export interface AgentRuntimeOptions {
  queue?: { concurrency?: number; pollIntervalMs?: number };
  scheduler?: { intervalMs?: number };
  gateway?: ProviderGatewayConfig;
}

export interface AgentRuntimeStatus {
  started: boolean;
  activeRuns: number;
  delayedRuns: number;
  schedulerRunning: boolean;
  providers: { openai: boolean; anthropic: boolean };
  liveProviderEnabled: boolean;
}

/**
 * Composition root for the agent runtime: one executor, one bounded in-process
 * queue, and the cron scheduler. Service agents (Parts 6-10) reuse this runtime
 * by dispatching runs through the PrismaAgentService rather than owning engines.
 */
export class AgentRuntime {
  readonly service: PrismaAgentService;
  readonly executor: AgentRunExecutor;
  readonly queue: InProcessAgentQueue;
  readonly scheduler: AgentScheduler;
  private started = false;

  constructor(database: ConstructorParameters<typeof PrismaAgentService>[0], options: AgentRuntimeOptions = {}) {
    this.service = new PrismaAgentService(database);
    const gatewayConfig = options.gateway ?? defaultGatewayConfig();
    const gateway = new ModelGateway(gatewayConfig);
    this.executor = new AgentRunExecutor(this.service, gateway, { timeoutMs: gatewayConfig.timeoutMs });
    this.queue = new InProcessAgentQueue(
      this.executor,
      async () => (await this.service.claimNextQueuedRun(`queue:${Date.now()}`))?.id ?? null,
      { concurrency: options.queue?.concurrency, pollIntervalMs: options.queue?.pollIntervalMs },
    );
    this.scheduler = new AgentScheduler(this.service, options.scheduler);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.queue.start();
    this.scheduler.start();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.queue.stop();
    this.scheduler.stop();
  }

  /** Hands a freshly queued run to the queue for near-immediate dispatch. */
  kick(runId: string, delayMs = 0): void {
    this.queue.enqueue(runId, delayMs);
  }

  status(): AgentRuntimeStatus {
    const gatewayConfig = defaultGatewayConfig();
    return {
      started: this.started,
      activeRuns: this.queue.activeCount,
      delayedRuns: this.queue.depth,
      schedulerRunning: this.scheduler.isRunning,
      providers: {
        openai: Boolean(gatewayConfig.openaiApiKey),
        anthropic: Boolean(gatewayConfig.anthropicApiKey),
      },
      liveProviderEnabled: resolveLive(gatewayConfig),
    };
  }

  toolCatalog(): ReturnType<typeof describeTools> {
    return describeTools(["web_search", "file_read", "file_write", "code_execute", "api_call", "email_send"]);
  }
}

function defaultGatewayConfig(): ProviderGatewayConfig {
  const timeoutMs = Number(process.env.AIOS_AGENT_PROVIDER_TIMEOUT_MS ?? "");
  return {
    openaiApiKey: process.env.AIOS_OPENAI_API_KEY ?? null,
    anthropicApiKey: process.env.AIOS_ANTHROPIC_API_KEY ?? null,
    openaiBaseUrl: process.env.AIOS_OPENAI_BASE_URL || undefined,
    anthropicBaseUrl: process.env.AIOS_ANTHROPIC_BASE_URL || undefined,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120_000,
  };
}

function resolveLive(config: ProviderGatewayConfig): boolean {
  return Boolean(config.openaiApiKey || config.anthropicApiKey);
}
