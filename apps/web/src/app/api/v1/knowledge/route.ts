import { knowledgeCreateSchema, knowledgeListQuerySchema } from "@aios/contracts";
import { parseJsonBody, parseQuery } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { knowledgeServiceFactory, mapKnowledgeEntry, mapKnowledgeError } from "@/lib/api/knowledge-routes";

export const GET = withDomainApi(mapKnowledgeError, async (request, context) => {
  const query = parseQuery(knowledgeListQuerySchema, request);
  const services = await getDomainServiceContext(context, knowledgeServiceFactory);
  const result = await services.service.listEntries(services.identity, {
    limit: query.limit,
    cursor: query.cursor,
    search: query.search,
    searchMode: query.searchMode,
    categories: query.categories,
    clientId: query.clientId,
  });
  return domainSuccess({
    items: result.items.map((entry) => mapKnowledgeEntry(entry as unknown as Record<string, unknown>)),
    total: result.total,
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  }, context.requestId);
});

export const POST = withDomainApi(mapKnowledgeError, async (request, context) => {
  const input = await parseJsonBody(request, knowledgeCreateSchema);
  const services = await getDomainServiceContext(context, knowledgeServiceFactory);
  const entry = await services.service.createEntry(services.identity, input);
  return domainSuccess(mapKnowledgeEntry(entry as unknown as Record<string, unknown>), context.requestId, { status: 201 });
});

export const OPTIONS = GET;
