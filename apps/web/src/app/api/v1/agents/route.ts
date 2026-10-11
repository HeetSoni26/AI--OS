import {
 agentCreateSchema, agentListQuerySchema } from "@aios/contracts";
import { parseJsonBody, parseQuery } from "@/lib/api";
import { agentSuccessResponse,
  executeIdempotent,
  getAgentApiServiceContext,
  idempotentSuccessResponse,
  mapAgentDto,
  mapAgentSummary,
  withAgentApi,
} from "@/lib/agents/agent-routes";

export const GET = withAgentApi(async (request, context) => {
  const query = parseQuery(agentListQuerySchema, request);
  const services = await getAgentApiServiceContext(context);
  const result = await services.service.listAgents(services.identity, {
    q: query.search,
    types: query.types,
    statuses: query.statuses,
    clientId: query.clientId,
    lifecycle: query.archiveScope === "archived" ? "archived" : query.archiveScope === "all" ? "all" : "active",
    cursor: query.cursor,
    limit: query.limit,
  });
  const items = result.items.map(mapAgentSummary);
  return agentSuccessResponse({ items, nextCursor: result.nextCursor, hasMore: result.hasMore, total: result.total }, context.requestId);
});

export const POST = withAgentApi(async (request, context) => {
  const input = await parseJsonBody(request, agentCreateSchema);
  const services = await getAgentApiServiceContext(context);
  const result = await executeIdempotent(request, services, "agents.create", input, async () => {
    const created = await services.service.createAgent(services.identity, {
      name: input.name,
      description: input.description ?? null,
      type: input.type,
      model: input.modelParameters.model,
      systemPrompt: input.systemPrompt,
      temperature: input.modelParameters.temperature,
      maxTokens: input.modelParameters.maxTokens,
      topP: input.modelParameters.topP,
      frequencyPenalty: input.modelParameters.frequencyPenalty,
      tools: input.tools,
      trigger: input.trigger,
      dailyTokenBudget: input.dailyTokenBudget ?? null,
      clientIds: input.clientIds,
      approvalRequired: input.approvalRequired === true,
      memoryEnabled: input.memoryEnabled !== false,
    });
    return mapAgentDto(created);
  });
  return idempotentSuccessResponse(result, context.requestId, { status: result.replayed ? 200 : 201 });
});

export const OPTIONS = GET;
