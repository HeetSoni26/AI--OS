import { conversationListQuerySchema } from "@aios/contracts";
import { parseQuery } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { chatbotServiceFactory, mapChatbotError } from "@/lib/api/chatbot-routes";
import { mapConversationRow } from "@/lib/api/chatbot-mappers";

export const GET = withDomainApi(mapChatbotError, async (request, context) => {
  const query = parseQuery(conversationListQuerySchema, request);
  const services = await getDomainServiceContext(context, chatbotServiceFactory);
  const result = await services.service.listConversations(services.identity, {
    limit: query.limit,
    cursor: query.cursor,
    chatbotId: query.chatbotId,
    clientId: query.clientId,
    statuses: query.statuses,
    lowConfidenceOnly: query.lowConfidenceOnly,
  });
  return domainSuccess({
    items: result.items.map((row) => mapConversationRow(row as unknown as Record<string, unknown>)),
    total: result.total,
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  }, context.requestId);
});

export const OPTIONS = GET;
