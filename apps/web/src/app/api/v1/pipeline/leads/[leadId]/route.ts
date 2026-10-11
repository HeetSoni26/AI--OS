import { crmLeadUpdateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { mapCrmLead, mapPipelineError, pipelineServiceFactory } from "@/lib/api/pipeline-routes";

type RouteContext = { params: Promise<{ leadId: string }> };

export const GET = withDomainApi<RouteContext>(mapPipelineError, async (_request, context, routeContext) => {
  const { leadId } = await routeContext.params;
  const services = await getDomainServiceContext(context, pipelineServiceFactory);
  const lead = await services.service.getCrmLead(services.identity, leadId);
  return domainSuccess(mapCrmLead(lead as unknown as Record<string, unknown>), context.requestId);
});

export const PATCH = withDomainApi<RouteContext>(mapPipelineError, async (request, context, routeContext) => {
  const { leadId } = await routeContext.params;
  const input = await parseJsonBody(request, crmLeadUpdateSchema);
  const services = await getDomainServiceContext(context, pipelineServiceFactory);
  const lead = await services.service.updateCrmLead(services.identity, leadId, input);
  return domainSuccess(mapCrmLead(lead as unknown as Record<string, unknown>), context.requestId);
});

export const OPTIONS = GET;
