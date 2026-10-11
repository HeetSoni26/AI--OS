import { deliverableUpdateSchema } from "@aios/contracts";
import { parseJsonBody, successResponse } from "@/lib/api";
import { executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, mapDeliverableDto, parseDateTime, parseEntityId, requireNestedEntity, requireProjectForClient, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string; projectId: string; deliverableId: string }> };

async function contextAndDeliverable(context: Parameters<typeof getClientApiServiceContext>[0], params: { clientId: string; projectId: string; deliverableId: string }) {
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const deliverableId = parseEntityId(params.deliverableId, "deliverableId");
  const services = await getClientApiServiceContext(context);
  const project = await requireProjectForClient(services, clientId, projectId);
  return { services, deliverableId, deliverable: requireNestedEntity(project, "deliverables", deliverableId, "Deliverable") };
}

export const GET = withClientApi<RouteContext>(async (_request, context, routeContext) => {
  const result = await contextAndDeliverable(context, await routeContext.params);
  return successResponse(mapDeliverableDto(result.deliverable), { requestId: context.requestId });
});

export const PATCH = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const input = await parseJsonBody(request, deliverableUpdateSchema);
  const { services, deliverableId } = await contextAndDeliverable(context, await routeContext.params);
  const result = await executeIdempotent(request, services, `clients.projects.deliverables.update:${deliverableId}`, input, async () => mapDeliverableDto(
    await services.service.work.updateDeliverable(services.identity, deliverableId, {
      ...input,
      completedAt: parseDateTime(input.completedAt),
    }) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId);
});

export const DELETE = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const { services, deliverableId } = await contextAndDeliverable(context, await routeContext.params);
  const result = await executeIdempotent(request, services, `clients.projects.deliverables.delete:${deliverableId}`, {}, async () => mapDeliverableDto(
    await services.service.work.deleteDeliverable(services.identity, deliverableId) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId);
});

export const OPTIONS = GET;
