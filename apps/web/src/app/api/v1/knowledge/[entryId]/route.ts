import { knowledgeUpdateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { knowledgeServiceFactory, mapKnowledgeEntry, mapKnowledgeError } from "@/lib/api/knowledge-routes";

type RouteContext = { params: Promise<{ entryId: string }> };

export const GET = withDomainApi<RouteContext>(mapKnowledgeError, async (_request, context, routeContext) => {
  const { entryId } = await routeContext.params;
  const services = await getDomainServiceContext(context, knowledgeServiceFactory);
  const entry = await services.service.getEntry(services.identity, entryId);
  return domainSuccess(mapKnowledgeEntry(entry as unknown as Record<string, unknown>), context.requestId);
});

export const PATCH = withDomainApi<RouteContext>(mapKnowledgeError, async (request, context, routeContext) => {
  const { entryId } = await routeContext.params;
  const input = await parseJsonBody(request, knowledgeUpdateSchema);
  const services = await getDomainServiceContext(context, knowledgeServiceFactory);
  const entry = await services.service.updateEntry(services.identity, entryId, input);
  return domainSuccess(mapKnowledgeEntry(entry as unknown as Record<string, unknown>), context.requestId);
});

export const OPTIONS = GET;
