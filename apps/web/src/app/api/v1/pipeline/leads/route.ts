import { crmLeadCreateSchema, crmLeadListQuerySchema } from "@aios/contracts";
import { parseJsonBody, parseQuery } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { mapCrmLead, mapPipelineError, pipelineServiceFactory } from "@/lib/api/pipeline-routes";

export const GET = withDomainApi(mapPipelineError, async (request, context) => {
  const query = parseQuery(crmLeadListQuerySchema, request);
  const services = await getDomainServiceContext(context, pipelineServiceFactory);
  const leads = await services.service.listCrmLeads(services.identity, {
    limit: query.limit,
    stages: query.stages,
    search: query.search,
  });
  return domainSuccess({ items: leads.map((lead) => mapCrmLead(lead as unknown as Record<string, unknown>)) }, context.requestId);
});

export const POST = withDomainApi(mapPipelineError, async (request, context) => {
  const input = await parseJsonBody(request, crmLeadCreateSchema);
  const services = await getDomainServiceContext(context, pipelineServiceFactory);
  const lead = await services.service.createCrmLead(services.identity, input);
  return domainSuccess(mapCrmLead(lead as unknown as Record<string, unknown>), context.requestId, { status: 201 });
});

export const OPTIONS = GET;
