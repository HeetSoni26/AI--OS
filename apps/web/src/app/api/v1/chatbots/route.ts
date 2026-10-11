import { chatbotCreateSchema, chatbotListQuerySchema } from "@aios/contracts";
import { parseJsonBody, parseQuery } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { chatbotServiceFactory, mapChatbotError } from "@/lib/api/chatbot-routes";
import { mapChatbotDetail, mapChatbotListRow } from "@/lib/api/chatbot-mappers";

export const GET = withDomainApi(mapChatbotError, async (request, context) => {
  const query = parseQuery(chatbotListQuerySchema, request);
  const services = await getDomainServiceContext(context, chatbotServiceFactory);
  const result = await services.service.listChatbots(services.identity, {
    limit: query.limit,
    cursor: query.cursor,
    clientId: query.clientId,
    statuses: query.statuses,
    search: query.search,
  });
  return domainSuccess({
    items: result.items.map((row) => mapChatbotListRow(row as unknown as Record<string, unknown>)),
    total: result.total,
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  }, context.requestId);
});

export const POST = withDomainApi(mapChatbotError, async (request, context) => {
  const input = await parseJsonBody(request, chatbotCreateSchema);
  const services = await getDomainServiceContext(context, chatbotServiceFactory);
  const created = await services.service.createChatbot(services.identity, input);
  const detail = await services.service.getChatbotDetail(services.identity, created.chatbotId);
  return domainSuccess(mapChatbotDetail(detail as unknown as Record<string, unknown>), context.requestId, { status: 201 });
});

export const OPTIONS = GET;
