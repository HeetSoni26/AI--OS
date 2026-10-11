import { chatbotSourceCreateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { chatbotServiceFactory, mapChatbotError } from "@/lib/api/chatbot-routes";

type RouteContext = { params: Promise<{ chatbotId: string }> };

export const POST = withDomainApi<RouteContext>(mapChatbotError, async (request, context, routeContext) => {
  const { chatbotId } = await routeContext.params;
  const input = await parseJsonBody(request, chatbotSourceCreateSchema);
  const services = await getDomainServiceContext(context, chatbotServiceFactory);
  const result = await services.service.ingestSource(services.identity, chatbotId, input);
  return domainSuccess(result, context.requestId, { status: 201 });
});

export const OPTIONS = POST;
