import { proposalStatusUpdateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { mapPipelineError, mapProposal, pipelineServiceFactory } from "@/lib/api/pipeline-routes";

type RouteContext = { params: Promise<{ proposalId: string }> };

export const POST = withDomainApi<RouteContext>(mapPipelineError, async (request, context, routeContext) => {
  const { proposalId } = await routeContext.params;
  const input = await parseJsonBody(request, proposalStatusUpdateSchema);
  const services = await getDomainServiceContext(context, pipelineServiceFactory);
  const proposal = await services.service.updateProposalStatus(services.identity, proposalId, input);
  const detail = await services.service.listProposals(services.identity);
  const matched = detail.find((entry) => entry.id === proposalId);
  return domainSuccess(mapProposal((matched ?? proposal) as unknown as Record<string, unknown>), context.requestId);
});

export const OPTIONS = POST;
