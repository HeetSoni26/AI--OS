import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { contentServiceFactory, mapCalendarEntry, mapContentError } from "@/lib/api/content-routes";

export const GET = withDomainApi(mapContentError, async (request, context) => {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? undefined;
  const clientId = url.searchParams.get("clientId") ?? undefined;
  const services = await getDomainServiceContext(context, contentServiceFactory);
  const entries = await services.service.listCalendar(services.identity, scope, clientId);
  return domainSuccess({ items: entries.map((entry) => mapCalendarEntry(entry as unknown as Record<string, unknown>)) }, context.requestId);
});

export const OPTIONS = GET;
