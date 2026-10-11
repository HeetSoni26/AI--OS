import {
 agentUpdateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { agentSuccessResponse,
  getAgentApiServiceContext,
  mapAgentDto,
  withAgentApi,
} from "@/lib/agents/agent-routes";

type RouteContext = { params: Promise<{ agentId: string }> };

export const GET = withAgentApi<RouteContext>(async (_request, context, routeContext) => {
  const { agentId } = await routeContext.params;
  const services = await getAgentApiServiceContext(context);
  const detail = await services.service.getAgentDetail(services.identity, agentId);
  return agentSuccessResponse(mapAgentDto(detail), context.requestId);
});

export const PATCH = withAgentApi<RouteContext>(async (request, context, routeContext) => {
  const { agentId } = await routeContext.params;
  const input = await parseJsonBody(request, agentUpdateSchema);
  const services = await getAgentApiServiceContext(context);
  const updated = await services.service.updateAgent(services.identity, agentId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.modelParameters ? {
      model: input.modelParameters.model,
      temperature: input.modelParameters.temperature,
      maxTokens: input.modelParameters.maxTokens,
      topP: input.modelParameters.topP,
      frequencyPenalty: input.modelParameters.frequencyPenalty,
    } : {}),
    ...(input.systemPrompt !== undefined ? { systemPrompt: input.systemPrompt } : {}),
    ...(input.tools !== undefined ? { tools: input.tools } : {}),
    ...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
    ...(input.dailyTokenBudget !== undefined ? { dailyTokenBudget: input.dailyTokenBudget ?? null } : {}),
    ...(input.clientIds !== undefined ? { clientIds: input.clientIds } : {}),
    ...(input.approvalRequired !== undefined ? { approvalRequired: input.approvalRequired } : {}),
    ...(input.memoryEnabled !== undefined ? { memoryEnabled: input.memoryEnabled } : {}),
    ...(input.changeSummary !== undefined ? { changeSummary: input.changeSummary } : {}),
  });
  return agentSuccessResponse(mapAgentDto(updated), context.requestId);
});

export const DELETE = withAgentApi<RouteContext>(async (_request, context, routeContext) => {
  const { agentId } = await routeContext.params;
  const services = await getAgentApiServiceContext(context);
  await services.service.deleteAgent(services.identity, agentId);
  return agentSuccessResponse({ deleted: true }, context.requestId);
});

export const OPTIONS = GET;
