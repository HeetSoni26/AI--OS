import { chatbotUpdateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { chatbotServiceFactory, mapChatbotError } from "@/lib/api/chatbot-routes";
import { mapChatbotDetail } from "@/lib/api/chatbot-mappers";

type RouteContext = { params: Promise<{ chatbotId: string }> };

export const GET = withDomainApi<RouteContext>(mapChatbotError, async (_request, context, routeContext) => {
  const { chatbotId } = await routeContext.params;
  const services = await getDomainServiceContext(context, chatbotServiceFactory);
  const detail = await services.service.getChatbotDetail(services.identity, chatbotId);
  return domainSuccess(mapChatbotDetail(detail as unknown as Record<string, unknown>), context.requestId);
});

export const PATCH = withDomainApi<RouteContext>(mapChatbotError, async (request, context, routeContext) => {
  const { chatbotId } = await routeContext.params;
  const input = await parseJsonBody(request, chatbotUpdateSchema);
  const services = await getDomainServiceContext(context, chatbotServiceFactory);
  const detail = await services.service.updateChatbot(services.identity, chatbotId, input);
  return domainSuccess(mapChatbotDetail(detail as unknown as Record<string, unknown>), context.requestId);
});

export const OPTIONS = GET;
