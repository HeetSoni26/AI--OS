import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { knowledgeServiceFactory, mapKnowledgeError, mapNotification } from "@/lib/api/knowledge-routes";

type RouteContext = { params: Promise<{ notificationId: string }> };

export const POST = withDomainApi<RouteContext>(mapKnowledgeError, async (_request, context, routeContext) => {
  const { notificationId } = await routeContext.params;
  const services = await getDomainServiceContext(context, knowledgeServiceFactory);
  const result = await services.service.markNotificationRead(services.identity, notificationId);
  return domainSuccess({
    items: result.items.map((notification) => mapNotification(notification as unknown as Record<string, unknown>)),
    unreadCount: result.unreadCount,
  }, context.requestId);
});

export const OPTIONS = POST;
