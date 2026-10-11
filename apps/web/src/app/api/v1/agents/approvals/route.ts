import {
 approvalListQuerySchema } from "@aios/contracts";
import { parseQuery } from "@/lib/api";
import { agentSuccessResponse, getAgentApiServiceContext, mapApprovalDto, withAgentApi } from "@/lib/agents/agent-routes";

export const GET = withAgentApi(async (request, context) => {
  const query = parseQuery(approvalListQuerySchema, request);
  const services = await getAgentApiServiceContext(context);
  const approvals = await services.service.listApprovals(services.identity, {
    agentId: query.agentId,
    agentRunId: query.agentRunId,
    statuses: query.statuses,
    limit: query.limit,
  });
  return agentSuccessResponse({ items: approvals.map(mapApprovalDto) }, context.requestId);
});

export const OPTIONS = GET;
