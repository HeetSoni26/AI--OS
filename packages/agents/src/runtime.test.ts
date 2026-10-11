import { describe, expect, it, vi } from "vitest";
import { InProcessAgentQueue } from "./queue";
import { AgentScheduler } from "./scheduler";
import type { ExecutionOutcome } from "./executor";

function deferredExecutor() {
  const outcomes: Array<{ runId: string; resolve: (outcome: ExecutionOutcome) => void }> = [];
  const executeRun = vi.fn((runId: string) => new Promise<ExecutionOutcome>((resolve) => {
    outcomes.push({ runId, resolve });
  }));
  return { executeRun, outcomes };
}

describe("InProcessAgentQueue", () => {
  it("claims and executes up to the concurrency limit", async () => {
    const { executeRun, outcomes } = deferredExecutor();
    const claim = vi.fn()
      .mockResolvedValueOnce("run-1")
      .mockResolvedValueOnce("run-2")
      .mockResolvedValue(null);
    const queue = new InProcessAgentQueue({ executeRun }, claim, { concurrency: 2, pollIntervalMs: 1_000 });
    queue.start();
    await vi.waitFor(() => expect(executeRun).toHaveBeenCalledTimes(2));
    expect(queue.activeCount).toBe(2);
    outcomes[0]!.resolve({ kind: "completed" });
    await vi.waitFor(() => expect(queue.activeCount).toBe(1));
    queue.stop();
  });

  it("re-enqueues retries after the requested delay", async () => {
    vi.useFakeTimers();
    try {
      const { executeRun, outcomes } = deferredExecutor();
      const claim = vi.fn()
        .mockResolvedValueOnce("run-1")
        .mockResolvedValueOnce("run-1")
        .mockResolvedValue(null);
      const queue = new InProcessAgentQueue({ executeRun }, claim, { concurrency: 1, pollIntervalMs: 60_000 });
      queue.start();
      await vi.advanceTimersByTimeAsync(1);
      expect(executeRun).toHaveBeenCalledTimes(1);
      outcomes[0]!.resolve({ kind: "retry_scheduled", delayMs: 5_000, attempt: 2 });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(executeRun).toHaveBeenCalledTimes(2);
      outcomes[1]!.resolve({ kind: "completed" });
      queue.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not execute a run id twice concurrently", async () => {
    const { executeRun, outcomes } = deferredExecutor();
    const claim = vi.fn().mockResolvedValue("run-1");
    const queue = new InProcessAgentQueue({ executeRun }, claim, { concurrency: 5, pollIntervalMs: 60_000 });
    queue.start();
    queue.enqueue("run-1");
    await vi.waitFor(() => expect(executeRun).toHaveBeenCalledTimes(1));
    queue.enqueue("run-1");
    expect(executeRun).toHaveBeenCalledTimes(1);
    outcomes[0]!.resolve({ kind: "completed" });
    queue.stop();
  });
});

describe("AgentScheduler", () => {
  it("dispatches due agents with per-minute idempotency keys", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const service = {
      listScheduledAgents: vi.fn().mockResolvedValue([
        { id: "agent-1", scheduleCron: "* * * * *", status: "SCHEDULED" },
      ]),
    };
    const scheduler = new AgentScheduler(service as never, { dispatch });
    // First observation seeds the next fire window without retroactive dispatch.
    expect(await scheduler.tick(new Date("2026-10-08T14:30:10Z"))).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
    const dispatched = await scheduler.tick(new Date("2026-10-08T14:31:05Z"));
    expect(dispatched).toBe(1);
    expect(dispatch).toHaveBeenCalledWith("agent-1", "scheduled:agent-1:2026-10-08T14:31");
  });

  it("does not redispatch within the same fire window", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const service = {
      listScheduledAgents: vi.fn().mockResolvedValue([
        { id: "agent-1", scheduleCron: "* * * * *", status: "SCHEDULED" },
      ]),
    };
    const scheduler = new AgentScheduler(service as never, { dispatch });
    await scheduler.tick(new Date("2026-10-08T14:30:10Z"));
    await scheduler.tick(new Date("2026-10-08T14:31:05Z"));
    expect(dispatch).toHaveBeenCalledTimes(1);
    await scheduler.tick(new Date("2026-10-08T14:31:50Z"));
    expect(dispatch).toHaveBeenCalledTimes(1);
    await scheduler.tick(new Date("2026-10-08T14:32:10Z"));
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenLastCalledWith("agent-1", "scheduled:agent-1:2026-10-08T14:32");
  });

  it("skips paused agents entirely", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const service = {
      listScheduledAgents: vi.fn().mockResolvedValue([
        { id: "agent-1", scheduleCron: "* * * * *", status: "PAUSED" },
      ]),
    };
    const scheduler = new AgentScheduler(service as never, { dispatch });
    expect(await scheduler.tick(new Date())).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
