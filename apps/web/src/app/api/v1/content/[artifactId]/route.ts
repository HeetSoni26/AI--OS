import { contentArtifactUpdateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { contentServiceFactory, mapArtifactDetail, mapContentError } from "@/lib/api/content-routes";

type RouteContext = { params: Promise<{ artifactId: string }> };

export const GET = withDomainApi<RouteContext>(mapContentError, async (_request, context, routeContext) => {
  const { artifactId } = await routeContext.params;
  const services = await getDomainServiceContext(context, contentServiceFactory);
  const detail = await services.service.getArtifactDetail(services.identity, artifactId);
  return domainSuccess(mapArtifactDetail(detail as unknown as Record<string, unknown>), context.requestId);
});

export const PATCH = withDomainApi<RouteContext>(mapContentError, async (request, context, routeContext) => {
  const { artifactId } = await routeContext.params;
  const input = await parseJsonBody(request, contentArtifactUpdateSchema);
  const services = await getDomainServiceContext(context, contentServiceFactory);
  const updated = await services.service.updateArtifact(services.identity, artifactId, input);
  const detail = await services.service.getArtifactDetail(services.identity, updated.id);
  return domainSuccess(mapArtifactDetail(detail as unknown as Record<string, unknown>), context.requestId);
});

export const OPTIONS = GET;
