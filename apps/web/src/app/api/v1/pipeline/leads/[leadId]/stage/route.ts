import { crmLeadStageUpdateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { mapCrmLead, mapPipelineError, pipelineServiceFactory } from "@/lib/api/pipeline-routes";

type RouteContext = { params: Promise<{ leadId: string }> };

export const POST = withDomainApi<RouteContext>(mapPipelineError, async (request, context, routeContext) => {
  const { leadId } = await routeContext.params;
  const input = await parseJsonBody(request, crmLeadStageUpdateSchema);
  const services = await getDomainServiceContext(context, pipelineServiceFactory);
  const lead = await services.service.updateCrmLeadStage(services.identity, leadId, input);
  return domainSuccess(mapCrmLead(lead as unknown as Record<string, unknown>), context.requestId);
});

export const OPTIONS = POST;
