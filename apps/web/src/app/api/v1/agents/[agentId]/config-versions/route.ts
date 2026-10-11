import {  agentSuccessResponse,
 getAgentApiServiceContext, mapConfigVersionDto, withAgentApi } from "@/lib/agents/agent-routes";

type RouteContext = { params: Promise<{ agentId: string }> };

export const GET = withAgentApi<RouteContext>(async (_request, context, routeContext) => {
  const { agentId } = await routeContext.params;
  const services = await getAgentApiServiceContext(context);
  const detail = await services.service.getAgentDetail(services.identity, agentId);
  return agentSuccessResponse({ items: detail.configVersions.map(mapConfigVersionDto) }, context.requestId);
});

export const OPTIONS = GET;
