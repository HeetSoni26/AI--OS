import { proposalCreateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { mapPipelineError, mapProposal, pipelineServiceFactory } from "@/lib/api/pipeline-routes";

export const GET = withDomainApi(mapPipelineError, async (_request, context) => {
  const services = await getDomainServiceContext(context, pipelineServiceFactory);
  const proposals = await services.service.listProposals(services.identity);
  return domainSuccess({ items: proposals.map((proposal) => mapProposal(proposal as unknown as Record<string, unknown>)) }, context.requestId);
});

export const POST = withDomainApi(mapPipelineError, async (request, context) => {
  const input = await parseJsonBody(request, proposalCreateSchema);
  const services = await getDomainServiceContext(context, pipelineServiceFactory);
  const proposal = await services.service.createProposal(services.identity, input);
  return domainSuccess(mapProposal(proposal as unknown as Record<string, unknown>), context.requestId, { status: 201 });
});

export const OPTIONS = GET;
