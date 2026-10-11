import {
 agentBudgetStatusSchema } from "@aios/contracts";
import { agentSuccessResponse, getAgentApiServiceContext, withAgentApi } from "@/lib/agents/agent-routes";

type RouteContext = { params: Promise<{ agentId: string }> };

export const GET = withAgentApi<RouteContext>(async (_request, context, routeContext) => {
  const { agentId } = await routeContext.params;
  const services = await getAgentApiServiceContext(context);
  const budget = await services.service.getBudgetStatus(agentId);
  const data = agentBudgetStatusSchema.parse({
    agentId: budget.agentId,
    dailyTokenBudget: budget.dailyTokenBudget,
    tokensUsedToday: budget.tokensUsedToday,
    tokensRemaining: budget.tokensRemaining ?? 0,
    budgetExceeded: budget.budgetExceeded,
    lastResetAt: null,
  });
  return agentSuccessResponse(data, context.requestId);
});

export const OPTIONS = GET;
