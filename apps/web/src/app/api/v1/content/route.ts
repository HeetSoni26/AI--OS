import { contentArtifactCreateSchema, contentListQuerySchema } from "@aios/contracts";
import { parseJsonBody, parseQuery } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { contentServiceFactory, mapArtifactDetail, mapArtifactListRow, mapContentError } from "@/lib/api/content-routes";

export const GET = withDomainApi(mapContentError, async (request, context) => {
  const query = parseQuery(contentListQuerySchema, request);
  const services = await getDomainServiceContext(context, contentServiceFactory);
  const result = await services.service.listArtifacts(services.identity, {
    limit: query.limit,
    cursor: query.cursor,
    scope: query.scope,
    clientId: query.clientId,
    types: query.types,
    statuses: query.statuses,
    search: query.search,
  });
  return domainSuccess({
    items: result.items.map((row) => mapArtifactListRow(row as unknown as Record<string, unknown>)),
    total: result.total,
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  }, context.requestId);
});

export const POST = withDomainApi(mapContentError, async (request, context) => {
  const input = await parseJsonBody(request, contentArtifactCreateSchema);
  const services = await getDomainServiceContext(context, contentServiceFactory);
  const created = await services.service.createArtifact(services.identity, input);
  const detail = await services.service.getArtifactDetail(services.identity, created.id);
  return domainSuccess(mapArtifactDetail(detail as unknown as Record<string, unknown>), context.requestId, { status: 201 });
});

export const OPTIONS = GET;
