import { workflowUpdateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { mapWorkflowError, workflowServiceFactory } from "@/lib/api/workflow-routes";
import { mapWorkflowDetail } from "@/lib/api/workflow-mappers";

type RouteContext = { params: Promise<{ workflowId: string }> };

export const GET = withDomainApi<RouteContext>(mapWorkflowError, async (_request, context, routeContext) => {
  const { workflowId } = await routeContext.params;
  const services = await getDomainServiceContext(context, workflowServiceFactory);
  const detail = await services.service.getWorkflowDetail(services.identity, workflowId);
  return domainSuccess(mapWorkflowDetail(detail as unknown as Record<string, unknown>), context.requestId);
});

export const PATCH = withDomainApi<RouteContext>(mapWorkflowError, async (request, context, routeContext) => {
  const { workflowId } = await routeContext.params;
  const input = await parseJsonBody(request, workflowUpdateSchema);
  const services = await getDomainServiceContext(context, workflowServiceFactory);
  const detail = await services.service.updateWorkflow(services.identity, workflowId, input);
  return domainSuccess(mapWorkflowDetail(detail as unknown as Record<string, unknown>), context.requestId);
});

export const OPTIONS = GET;
