import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { mapWorkflowError, workflowServiceFactory } from "@/lib/api/workflow-routes";
import { mapExecution } from "@/lib/api/workflow-mappers";

export const GET = withDomainApi(mapWorkflowError, async (request, context) => {
  const url = new URL(request.url);
  const workflowId = url.searchParams.get("workflowId");
  const limit = Number(url.searchParams.get("limit") ?? 25);
  const services = await getDomainServiceContext(context, workflowServiceFactory);
  const executions = await services.service.listExecutions(services.identity, {
    workflowId: workflowId ?? undefined,
    limit: Number.isInteger(limit) && limit > 0 ? limit : 25,
  });
  return domainSuccess({ items: executions.map((execution) => mapExecution(execution)) }, context.requestId);
});

export const OPTIONS = GET;
