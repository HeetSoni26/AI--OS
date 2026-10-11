import { sopExecutionSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { knowledgeServiceFactory, mapKnowledgeError } from "@/lib/api/knowledge-routes";

type RouteContext = { params: Promise<{ sopId: string }> };

export const POST = withDomainApi<RouteContext>(mapKnowledgeError, async (request, context, routeContext) => {
  const { sopId } = await routeContext.params;
  const input = await parseJsonBody(request, sopExecutionSchema);
  const services = await getDomainServiceContext(context, knowledgeServiceFactory);
  const execution = await services.service.recordSopExecution(services.identity, sopId, input);
  return domainSuccess({ id: execution.id, status: execution.status.toLowerCase() }, context.requestId, { status: 201 });
});

export const OPTIONS = POST;
