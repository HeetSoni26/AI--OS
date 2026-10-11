import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { chatbotServiceFactory, mapChatbotError } from "@/lib/api/chatbot-routes";
import { mapChatbotDetail } from "@/lib/api/chatbot-mappers";

type RouteContext = { params: Promise<{ chatbotId: string; sourceId: string }> };

export const POST = withDomainApi<RouteContext>(mapChatbotError, async (_request, context, routeContext) => {
  const { chatbotId, sourceId } = await routeContext.params;
  const services = await getDomainServiceContext(context, chatbotServiceFactory);
  const detail = await services.service.approveSource(services.identity, chatbotId, sourceId);
  return domainSuccess(mapChatbotDetail(detail as unknown as Record<string, unknown>), context.requestId);
});

export const OPTIONS = POST;
