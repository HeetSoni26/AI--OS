import { agentRunCreateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import {  executeIdempotent,
  getAgentApiServiceContext,
  idempotentSuccessResponse,
  mapRunDto,
  withAgentApi,
} from "@/lib/agents/agent-routes";
import { getAgentRuntime } from "@/lib/agents/runtime-singleton";

type RouteContext = { params: Promise<{ agentId: string }> };

export const POST = withAgentApi<RouteContext>(async (request, context, routeContext) => {
  const { agentId } = await routeContext.params;
  const input = await parseJsonBody(request, agentRunCreateSchema);
  const services = await getAgentApiServiceContext(context);
  const result = await executeIdempotent(request, services, "agents.run", input, async () => {
    const run = await services.service.dispatchRun(services.identity, agentId, {
      inputText: input.inputText ?? null,
      triggerType: input.triggerType,
      idempotencyKey: input.idempotencyKey ?? null,
    });
    getAgentRuntime()?.kick(run.id);
    return mapRunDto(run);
  });
  return idempotentSuccessResponse(result, context.requestId, { status: result.replayed ? 200 : 202 });
});

export const OPTIONS = POST;
