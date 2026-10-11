import { z } from "zod";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { knowledgeServiceFactory, mapKnowledgeError, mapNotification } from "@/lib/api/knowledge-routes";

const markAllSchema = z.strictObject({ action: z.literal("mark_all_read") });

export const GET = withDomainApi(mapKnowledgeError, async (request, context) => {
  const unreadOnly = new URL(request.url).searchParams.get("unread") === "true";
  const services = await getDomainServiceContext(context, knowledgeServiceFactory);
  const result = await services.service.listNotifications(services.identity, unreadOnly);
  return domainSuccess({
    items: result.items.map((notification) => mapNotification(notification as unknown as Record<string, unknown>)),
    unreadCount: result.unreadCount,
  }, context.requestId);
});

export const POST = withDomainApi(mapKnowledgeError, async (request, context) => {
  const body = await parseJsonBody(request, markAllSchema);
  void body;
  const services = await getDomainServiceContext(context, knowledgeServiceFactory);
  const result = await services.service.markAllNotificationsRead(services.identity);
  return domainSuccess({
    items: result.items.map((notification) => mapNotification(notification as unknown as Record<string, unknown>)),
    unreadCount: result.unreadCount,
  }, context.requestId);
});

export const OPTIONS = GET;
