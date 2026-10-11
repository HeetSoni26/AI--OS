import { z } from "zod";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { chatbotServiceFactory, mapChatbotError } from "@/lib/api/chatbot-routes";
import { mapChatbotDetail } from "@/lib/api/chatbot-mappers";

type RouteContext = { params: Promise<{ chatbotId: string }> };

const statusBodySchema = z.strictObject({ action: z.enum(["deploy", "pause", "archive"]) });

export const POST = withDomainApi<RouteContext>(mapChatbotError, async (request, context, routeContext) => {
  const { chatbotId } = await routeContext.params;
  const input = await parseJsonBody(request, statusBodySchema);
  const services = await getDomainServiceContext(context, chatbotServiceFactory);
  const detail = await services.service.setChatbotStatus(services.identity, chatbotId, input.action);
  return domainSuccess(mapChatbotDetail(detail as unknown as Record<string, unknown>), context.requestId);
});

export const OPTIONS = POST;
