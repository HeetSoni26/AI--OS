import { approvalDecisionSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import {  executeIdempotent,
  getAgentApiServiceContext,
  idempotentSuccessResponse,
  mapApprovalDto,
  withAgentApi,
} from "@/lib/agents/agent-routes";
import { getAgentRuntime } from "@/lib/agents/runtime-singleton";
import { z } from "zod";

type RouteContext = { params: Promise<{ approvalId: string }> };

const decisionBodySchema = approvalDecisionSchema.extend({
  payloadHash: z.string().trim().min(1).max(128),
});

export const POST = withAgentApi<RouteContext>(async (request, context, routeContext) => {
  const { approvalId } = await routeContext.params;
  const input = await parseJsonBody(request, decisionBodySchema);
  const services = await getAgentApiServiceContext(context);
  const result = await executeIdempotent(request, services, "agents.approval.decide", input, async () => {
    const decision = await services.service.decideRunApproval(
      services.identity,
      approvalId,
      { decision: input.decision, note: input.note ?? null },
      input.payloadHash,
    );
    if (input.decision === "approve" && decision.runId) {
      getAgentRuntime()?.kick(decision.runId);
    }
    return mapApprovalDto(decision.approval);
  });
  return idempotentSuccessResponse(result, context.requestId, { status: 200 });
});

export const OPTIONS = POST;
