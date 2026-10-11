import { deliverableReorderSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { assertPathId, executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, mapDeliverableDto, parseEntityId, requireProjectForClient, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string; projectId: string }> };

export const PATCH = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const input = await parseJsonBody(request, deliverableReorderSchema);
  assertPathId(input.projectId, projectId, "projectId");
  const services = await getClientApiServiceContext(context);
  await requireProjectForClient(services, clientId, projectId);
  const result = await executeIdempotent(request, services, `clients.projects.deliverables.reorder:${projectId}`, input, async () => (
    await services.service.work.reorderDeliverables(services.identity, projectId, input.orderedDeliverableIds)
  ).map((deliverable) => mapDeliverableDto(deliverable as unknown as Record<string, unknown>)));
  return idempotentSuccessResponse(result, context.requestId);
});

export const OPTIONS = PATCH;
