import type { PrismaAgentService } from "@aios/data";
import { minuteBucket, nextCronFire } from "./cron";

export interface SchedulerOptions {
  intervalMs?: number;
  /** Override dispatch (tests); defaults to dispatchSystemRun with triggerType "scheduled". */
  dispatch?: (agentId: string, idempotencyKey: string) => Promise<void>;
  logger?: (record: { component: string; message: string; [key: string]: unknown }) => void;
}

interface ScheduledAgentState {
  cron: string;
  nextFire: Date | null;
}

/**
 * Durable-idempotent cron scheduler. Each dispatch uses a per-minute
 * idempotency key, so overlapping ticks or process restarts cannot duplicate
 * runs; the database unique constraint is the final guard.
 */
export class AgentScheduler {
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;
  private readonly states = new Map<string, ScheduledAgentState>();
  private readonly intervalMs: number;
  private readonly dispatch: (agentId: string, idempotencyKey: string) => Promise<void>;
  private lastError: string | null = null;

  constructor(
    private readonly service: PrismaAgentService,
    options: SchedulerOptions = {},
  ) {
    this.intervalMs = Math.max(10_000, options.intervalMs ?? 30_000);
    this.dispatch = options.dispatch ?? (async (agentId, idempotencyKey) => {
      await this.service.dispatchSystemRun(`scheduler:${idempotencyKey}`, agentId, {
        triggerType: "scheduled",
        idempotencyKey,
      });
    });
    if (options.logger) this.logger = options.logger;
  }

  private logger: NonNullable<SchedulerOptions["logger"]> = () => undefined;

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get isRunning(): boolean {
    return !this.stopped;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  async tick(now: Date = new Date()): Promise<number> {
    let dispatched = 0;
    try {
      const agents = await this.service.listScheduledAgents();
      const seen = new Set<string>();
      for (const agent of agents) {
        if (!agent.scheduleCron) continue;
        seen.add(agent.id);
        let state = this.states.get(agent.id);
        if (!state || state.cron !== agent.scheduleCron) {
          state = { cron: agent.scheduleCron, nextFire: nextCronFire(agent.scheduleCron, now) };
          this.states.set(agent.id, state);
        }
        if (!state.nextFire || state.nextFire.getTime() > now.getTime()) continue;
        const idempotencyKey = `scheduled:${agent.id}:${minuteBucket(state.nextFire)}`;
        state.nextFire = nextCronFire(agent.scheduleCron, now);
        try {
          await this.dispatch(agent.id, idempotencyKey);
          dispatched += 1;
          this.logger({ component: "agent-scheduler", message: "Scheduled run dispatched.", agentId: agent.id });
        } catch (error) {
          // Unique-violation or budget errors are expected guards; log and continue.
          this.lastError = String(error);
          this.logger({ component: "agent-scheduler", message: "Scheduled dispatch skipped.", agentId: agent.id, error: String(error) });
        }
      }
      for (const agentId of [...this.states.keys()]) {
        if (!seen.has(agentId)) this.states.delete(agentId);
      }
      this.lastError = null;
    } catch (error) {
      this.lastError = String(error);
      this.logger({ component: "agent-scheduler", message: "Scheduler tick failed.", error: String(error) });
    }
    return dispatched;
  }
}
