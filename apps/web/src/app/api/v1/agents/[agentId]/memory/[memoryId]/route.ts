import {
 agentMemoryUpdateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { agentSuccessResponse, getAgentApiServiceContext, mapMemoryDto, withAgentApi } from "@/lib/agents/agent-routes";

type RouteContext = { params: Promise<{ agentId: string; memoryId: string }> };

export const PATCH = withAgentApi<RouteContext>(async (request, context, routeContext) => {
  const { memoryId } = await routeContext.params;
  const input = await parseJsonBody(request, agentMemoryUpdateSchema);
  const services = await getAgentApiServiceContext(context);
  const memory = await services.service.updateMemory(services.identity, memoryId, input);
  return agentSuccessResponse(mapMemoryDto(memory), context.requestId);
});

export const DELETE = withAgentApi<RouteContext>(async (_request, context, routeContext) => {
  const { memoryId } = await routeContext.params;
  const services = await getAgentApiServiceContext(context);
  await services.service.deleteMemory(services.identity, memoryId);
  return agentSuccessResponse({ deleted: true }, context.requestId);
});

export const OPTIONS = PATCH;
