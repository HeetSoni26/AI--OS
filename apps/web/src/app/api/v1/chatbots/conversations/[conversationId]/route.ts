import { z } from "zod";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { chatbotServiceFactory, mapChatbotError } from "@/lib/api/chatbot-routes";
import { mapMessage } from "@/lib/api/chatbot-mappers";

type RouteContext = { params: Promise<{ conversationId: string }> };

const resolveBodySchema = z.strictObject({ action: z.literal("resolve") });

export const GET = withDomainApi<RouteContext>(mapChatbotError, async (_request, context, routeContext) => {
  const { conversationId } = await routeContext.params;
  const services = await getDomainServiceContext(context, chatbotServiceFactory);
  const conversation = await services.service.getConversation(services.identity, conversationId);
  const row = conversation as unknown as Record<string, unknown>;
  return domainSuccess({
    ...row,
    messages: (Array.isArray(row.messages) ? row.messages : []).map((message) => mapMessage(message as Record<string, unknown>)),
  }, context.requestId);
});

export const POST = withDomainApi<RouteContext>(mapChatbotError, async (request, context, routeContext) => {
  const { conversationId } = await routeContext.params;
  const input = await parseJsonBody(request, resolveBodySchema);
  void input;
  const services = await getDomainServiceContext(context, chatbotServiceFactory);
  const conversation = await services.service.resolveConversation(services.identity, conversationId);
  const row = conversation as unknown as Record<string, unknown>;
  return domainSuccess({
    ...row,
    messages: (Array.isArray(row.messages) ? row.messages : []).map((message) => mapMessage(message as Record<string, unknown>)),
  }, context.requestId);
});

export const OPTIONS = GET;
