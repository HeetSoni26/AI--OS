import {
 z } from "zod";
import { agentSuccessResponse, getAgentApiServiceContext, withAgentApi } from "@/lib/agents/agent-routes";
import { getAgentRuntime } from "@/lib/agents/runtime-singleton";

const runtimeStatusSchema = z.strictObject({
  started: z.boolean(),
  activeRuns: z.number().int().nonnegative(),
  delayedRuns: z.number().int().nonnegative(),
  schedulerRunning: z.boolean(),
  providers: z.strictObject({ openai: z.boolean(), anthropic: z.boolean() }),
  liveProviderEnabled: z.boolean(),
  queue: z.strictObject({
    queued: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    oldestQueuedAgeMs: z.number().int().nonnegative().nullable(),
  }),
});

export const GET = withAgentApi(async (_request, context) => {
  const services = await getAgentApiServiceContext(context);
  const runtime = getAgentRuntime();
  const [metrics] = await Promise.all([
    services.service.queueMetrics(),
    services.identity.ownerSubject, // owner guard already enforced by the service context
  ]);
  const data = runtimeStatusSchema.parse({
    started: runtime?.status().started ?? false,
    activeRuns: runtime?.status().activeRuns ?? 0,
    delayedRuns: runtime?.status().delayedRuns ?? 0,
    schedulerRunning: runtime?.status().schedulerRunning ?? false,
    providers: runtime?.status().providers ?? { openai: false, anthropic: false },
    liveProviderEnabled: runtime?.status().liveProviderEnabled ?? false,
    queue: {
      queued: metrics.queued,
      running: metrics.running,
      oldestQueuedAgeMs: metrics.oldestQueuedAgeMs,
    },
  });
  return agentSuccessResponse(data, context.requestId);
});

export const OPTIONS = GET;
