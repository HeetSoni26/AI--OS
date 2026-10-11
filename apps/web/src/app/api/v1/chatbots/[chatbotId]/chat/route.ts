import { chatbotChatSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { chatbotServiceFactory, mapChatbotError } from "@/lib/api/chatbot-routes";
import { mapMessage } from "@/lib/api/chatbot-mappers";

type RouteContext = { params: Promise<{ chatbotId: string }> };

export const POST = withDomainApi<RouteContext>(mapChatbotError, async (request, context, routeContext) => {
  const { chatbotId } = await routeContext.params;
  const input = await parseJsonBody(request, chatbotChatSchema);
  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");
  const services = await getDomainServiceContext(context, chatbotServiceFactory);
  const result = await services.service.chat(services.identity, chatbotId, conversationId, input);
  return domainSuccess({
    conversationId: result.conversationId,
    message: mapMessage(result.message as unknown as Record<string, unknown>),
    grounded: result.grounded,
    escalated: result.escalated,
    citations: result.citations,
  }, context.requestId, { status: 201 });
});

export const OPTIONS = POST;
