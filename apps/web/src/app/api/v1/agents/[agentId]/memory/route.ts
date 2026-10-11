import {
 agentMemoryCreateSchema, agentMemoryListQuerySchema } from "@aios/contracts";
import { parseJsonBody, parseQuery } from "@/lib/api";
import { agentSuccessResponse,
  executeIdempotent,
  getAgentApiServiceContext,
  idempotentSuccessResponse,
  mapMemoryDto,
  withAgentApi,
} from "@/lib/agents/agent-routes";

type RouteContext = { params: Promise<{ agentId: string }> };

export const GET = withAgentApi<RouteContext>(async (request, context, routeContext) => {
  const { agentId } = await routeContext.params;
  const query = parseQuery(agentMemoryListQuerySchema, request);
  const services = await getAgentApiServiceContext(context);
  const result = await services.service.listMemories(services.identity, agentId, {
    clientId: query.clientId,
    kinds: query.kinds,
    cursor: query.cursor,
    limit: query.limit,
  });
  return agentSuccessResponse({ items: result.items.map(mapMemoryDto), nextCursor: result.nextCursor, hasMore: result.hasMore, total: result.total }, context.requestId);
});

export const POST = withAgentApi<RouteContext>(async (request, context, routeContext) => {
  const { agentId } = await routeContext.params;
  const input = await parseJsonBody(request, agentMemoryCreateSchema);
  const services = await getAgentApiServiceContext(context);
  const result = await executeIdempotent(request, services, "agents.memory.create", input, async () => {
    const memory = await services.service.createMemory(services.identity, agentId, input);
    return mapMemoryDto(memory);
  });
  return idempotentSuccessResponse(result, context.requestId, { status: result.replayed ? 200 : 201 });
});

export const OPTIONS = GET;
