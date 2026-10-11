import { z } from "zod";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { mapWorkflowError, workflowServiceFactory } from "@/lib/api/workflow-routes";
import { mapWorkflowDetail } from "@/lib/api/workflow-mappers";

type RouteContext = { params: Promise<{ workflowId: string }> };

const statusBodySchema = z.strictObject({ action: z.enum(["activate", "pause", "archive"]) });

export const POST = withDomainApi<RouteContext>(mapWorkflowError, async (request, context, routeContext) => {
  const { workflowId } = await routeContext.params;
  const input = await parseJsonBody(request, statusBodySchema);
  const services = await getDomainServiceContext(context, workflowServiceFactory);
  const detail = await services.service.setWorkflowStatus(services.identity, workflowId, input.action);
  return domainSuccess(mapWorkflowDetail(detail as unknown as Record<string, unknown>), context.requestId);
});

export const OPTIONS = POST;
