import { contentStatusUpdateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { contentServiceFactory, mapArtifactDetail, mapContentError } from "@/lib/api/content-routes";

type RouteContext = { params: Promise<{ artifactId: string }> };

export const POST = withDomainApi<RouteContext>(mapContentError, async (request, context, routeContext) => {
  const { artifactId } = await routeContext.params;
  const input = await parseJsonBody(request, contentStatusUpdateSchema);
  const services = await getDomainServiceContext(context, contentServiceFactory);
  const updated = await services.service.updateArtifactStatus(services.identity, artifactId, input);
  const detail = await services.service.getArtifactDetail(services.identity, updated.id);
  return domainSuccess(mapArtifactDetail(detail as unknown as Record<string, unknown>), context.requestId);
});

export const OPTIONS = POST;
