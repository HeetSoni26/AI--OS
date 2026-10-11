import { workflowCreateSchema, workflowListQuerySchema } from "@aios/contracts";
import { parseJsonBody, parseQuery } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { mapWorkflowError, workflowServiceFactory } from "@/lib/api/workflow-routes";
import { mapWorkflowDetail, mapWorkflowListRow } from "@/lib/api/workflow-mappers";

export const GET = withDomainApi(mapWorkflowError, async (request, context) => {
  const query = parseQuery(workflowListQuerySchema, request);
  const services = await getDomainServiceContext(context, workflowServiceFactory);
  const result = await services.service.listWorkflows(services.identity, {
    limit: query.limit,
    cursor: query.cursor,
    clientId: query.clientId,
    statuses: query.statuses,
    search: query.search,
  });
  return domainSuccess({
    items: result.items.map((row) => mapWorkflowListRow(row as unknown as Record<string, unknown>)),
    total: result.total,
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  }, context.requestId);
});

export const POST = withDomainApi(mapWorkflowError, async (request, context) => {
  const input = await parseJsonBody(request, workflowCreateSchema);
  const services = await getDomainServiceContext(context, workflowServiceFactory);
  const created = await services.service.createWorkflow(services.identity, input);
  const detail = await services.service.getWorkflowDetail(services.identity, created.workflowId);
  return domainSuccess(mapWorkflowDetail(detail as unknown as Record<string, unknown>), context.requestId, { status: 201 });
});

export const OPTIONS = GET;
