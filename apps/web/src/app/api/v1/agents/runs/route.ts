import {
 agentRunListQuerySchema } from "@aios/contracts";
import { parseQuery } from "@/lib/api";
import { agentSuccessResponse, getAgentApiServiceContext, mapRunDto, withAgentApi } from "@/lib/agents/agent-routes";

export const GET = withAgentApi(async (request, context) => {
  const query = parseQuery(agentRunListQuerySchema, request);
  const services = await getAgentApiServiceContext(context);
  const result = await services.service.listRuns(services.identity, {
    agentId: query.agentId,
    clientId: query.clientId,
    statuses: query.statuses,
    triggerTypes: query.triggerTypes,
    fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
    toDate: query.toDate ? new Date(query.toDate) : undefined,
    cursor: query.cursor,
    limit: query.limit,
  });
  return agentSuccessResponse({ items: result.items.map(mapRunDto), nextCursor: result.nextCursor, hasMore: result.hasMore, total: result.total }, context.requestId);
});

export const OPTIONS = GET;
