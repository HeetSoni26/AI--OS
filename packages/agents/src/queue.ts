import type { AgentRunExecutor, ExecutionOutcome } from "./executor";

export interface QueueOptions {
  /** Maximum simultaneously executing runs (SRS target: up to 30). */
  concurrency?: number;
  /** How often the queue polls the durable queue for new work. */
  pollIntervalMs?: number;
  logger?: (record: { component: string; message: string; [key: string]: unknown }) => void;
}

type QueueListener = (outcome: ExecutionOutcome, runId: string) => void;

/**
 * In-process durable queue. Runs are claimed from the database (so state
 * survives restarts); this loop provides dispatch latency, bounded concurrency,
 * and delayed retries. The BullMQ backend for multi-process deployments
 * implements the same `enqueue` contract against Redis.
 */
export class InProcessAgentQueue {
  private readonly delayed = new Map<string, NodeJS.Timeout>();
  private readonly active = new Set<string>();
  private pollTimer: NodeJS.Timeout | null = null;
  private stopped = true;
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly listeners = new Set<QueueListener>();

  constructor(
    private readonly executor: Pick<AgentRunExecutor, "executeRun">,
    private readonly claimNext: () => Promise<string | null>,
    options: QueueOptions = {},
  ) {
    this.concurrency = Math.max(1, options.concurrency ?? 30);
    this.pollIntervalMs = Math.max(1_000, options.pollIntervalMs ?? 10_000);
    if (options.logger) this.logger = options.logger;
  }

  private logger: NonNullable<QueueOptions["logger"]> = () => undefined;

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedulePoll(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    for (const timer of this.delayed.values()) clearTimeout(timer);
    this.delayed.clear();
  }

  /** Schedules execution of a queued run after an optional delay (retries). */
  enqueue(runId: string, delayMs = 0): void {
    if (this.stopped || delayMs <= 0) {
      this.pump();
      return;
    }
    if (this.delayed.has(runId)) return;
    const timer = setTimeout(() => {
      this.delayed.delete(runId);
      this.pump();
    }, delayMs);
    this.delayed.set(runId, timer);
  }

  onOutcome(listener: QueueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get depth(): number {
    return this.delayed.size + this.active.size;
  }

  get activeCount(): number {
    return this.active.size;
  }

  private schedulePoll(delayMs: number): void {
    if (this.stopped) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      this.pump().finally(() => this.schedulePoll(this.pollIntervalMs));
    }, delayMs);
  }

  /** Fills free slots by claiming durable queued runs, then executes them. */
  private async pump(): Promise<void> {
    while (!this.stopped && this.active.size < this.concurrency) {
      const runId = await this.claimNext().catch((error) => {
        this.logger({ component: "agent-queue", message: "Claim failed.", error: String(error) });
        return null;
      });
      if (!runId) return;
      if (!this.execute(runId)) return;
    }
  }

  private execute(runId: string): boolean {
    if (this.active.has(runId)) return false;
    this.active.add(runId);
    void (async () => {
      try {
        const outcome = await this.executor.executeRun(runId);
        for (const listener of this.listeners) {
          try {
            listener(outcome, runId);
          } catch {
            // listener failures must never break execution
          }
        }
        if (outcome.kind === "retry_scheduled") {
          this.enqueue(runId, outcome.delayMs);
          return;
        }
        this.logger({ component: "agent-queue", message: "Run finished.", runId, outcome: outcome.kind });
      } catch (error) {
        this.logger({ component: "agent-queue", message: "Run execution crashed.", runId, error: String(error) });
      } finally {
        this.active.delete(runId);
        if (!this.stopped) void this.pump();
      }
    })();
    return true;
  }
}
