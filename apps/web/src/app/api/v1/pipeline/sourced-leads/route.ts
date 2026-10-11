import { parseJsonBody } from "@/lib/api";
import { sourcedLeadCreateSchema } from "@aios/contracts";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { mapPipelineError, mapSourcedLead, pipelineServiceFactory } from "@/lib/api/pipeline-routes";

export const GET = withDomainApi(mapPipelineError, async (request, context) => {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId") ?? undefined;
  const services = await getDomainServiceContext(context, pipelineServiceFactory);
  const leads = await services.service.listSourcedLeads(services.identity, clientId);
  return domainSuccess({ items: leads.map((lead) => mapSourcedLead(lead as unknown as Record<string, unknown>)) }, context.requestId);
});

export const POST = withDomainApi(mapPipelineError, async (request, context) => {
  const input = await parseJsonBody(request, sourcedLeadCreateSchema);
  const services = await getDomainServiceContext(context, pipelineServiceFactory);
  const lead = await services.service.createSourcedLead(services.identity, input);
  return domainSuccess(mapSourcedLead(lead as unknown as Record<string, unknown>), context.requestId, { status: 201 });
});

export const OPTIONS = GET;
