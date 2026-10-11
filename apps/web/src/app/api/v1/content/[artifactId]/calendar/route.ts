import { calendarEntryCreateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { contentServiceFactory, mapArtifactDetail, mapContentError } from "@/lib/api/content-routes";

type RouteContext = { params: Promise<{ artifactId: string }> };

export const POST = withDomainApi<RouteContext>(mapContentError, async (request, context, routeContext) => {
  const { artifactId } = await routeContext.params;
  const input = await parseJsonBody(request, calendarEntryCreateSchema);
  const services = await getDomainServiceContext(context, contentServiceFactory);
  const entry = await services.service.addCalendarEntry(services.identity, artifactId, input);
  const detail = await services.service.getArtifactDetail(services.identity, artifactId);
  void entry;
  return domainSuccess(mapArtifactDetail(detail as unknown as Record<string, unknown>), context.requestId, { status: 201 });
});

export const OPTIONS = POST;
