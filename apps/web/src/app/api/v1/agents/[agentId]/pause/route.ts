import {  agentSuccessResponse,
 getAgentApiServiceContext, mapAgentDto, withAgentApi } from "@/lib/agents/agent-routes";

type RouteContext = { params: Promise<{ agentId: string }> };

export const POST = withAgentApi<RouteContext>(async (_request, context, routeContext) => {
  const { agentId } = await routeContext.params;
  const services = await getAgentApiServiceContext(context);
  const detail = await services.service.setAgentStatus(services.identity, agentId, "paused");
  return agentSuccessResponse(mapAgentDto(detail), context.requestId);
});

export const OPTIONS = POST;
