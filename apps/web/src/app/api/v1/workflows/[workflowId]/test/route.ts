import { z } from "zod";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { mapWorkflowError, workflowServiceFactory } from "@/lib/api/workflow-routes";
import { mapExecution } from "@/lib/api/workflow-mappers";

type RouteContext = { params: Promise<{ workflowId: string }> };

const testBodySchema = z.strictObject({
  status: z.enum(["success", "failed"]).default("success"),
  output: z.record(z.string(), z.unknown()).default({}),
  errorMessage: z.string().trim().max(2_000).nullable().optional(),
});

/** Records a sandbox test execution - activation requires a tested version. */
export const POST = withDomainApi<RouteContext>(mapWorkflowError, async (request, context, routeContext) => {
  const { workflowId } = await routeContext.params;
  const input = await parseJsonBody(request, testBodySchema);
  const services = await getDomainServiceContext(context, workflowServiceFactory);
  const execution = await services.service.recordTestExecution(services.identity, workflowId, input);
  return domainSuccess(mapExecution(execution), context.requestId, { status: 201 });
});

export const OPTIONS = POST;
