import "server-only";

import { AgentRuntime } from "@aios/agents";
import { getDatabaseClient } from "@aios/data";

const globalForRuntime = globalThis as unknown as { __aiosAgentRuntime?: AgentRuntime };

/**
 * Lazily starts the single in-process agent runtime (queue + scheduler) for this
 * server instance. Opt out with AIOS_AGENT_RUNTIME_DISABLED=true; production
 * multi-process deployments replace this with the BullMQ worker topology.
 */
export function getAgentRuntime(): AgentRuntime | null {
  if (process.env.AIOS_AGENT_RUNTIME_DISABLED === "true") return null;
  if (!globalForRuntime.__aiosAgentRuntime) {
    const concurrency = Number(process.env.AIOS_AGENT_MAX_CONCURRENT ?? "");
    const runtime = new AgentRuntime(getDatabaseClient(), {
      queue: {
        concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 30,
        pollIntervalMs: 5_000,
      },
    });
    runtime.start();
    globalForRuntime.__aiosAgentRuntime = runtime;
  }
  return globalForRuntime.__aiosAgentRuntime;
}
