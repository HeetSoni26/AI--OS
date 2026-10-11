import { parseJsonBody, successResponse } from "@/lib/api";
import { assignmentUpdateSchema, executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, mapAssignmentDto, parseDateTime, parseEntityId, requireNestedEntity, requireProjectForClient, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string; projectId: string; assignmentId: string }> };

async function contextAndAssignment(context: Parameters<typeof getClientApiServiceContext>[0], params: { clientId: string; projectId: string; assignmentId: string }) {
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const assignmentId = parseEntityId(params.assignmentId, "assignmentId");
  const services = await getClientApiServiceContext(context);
  const project = await requireProjectForClient(services, clientId, projectId);
  return { services, assignmentId, assignment: requireNestedEntity(project, "assignments", assignmentId, "Assignment") };
}

export const GET = withClientApi<RouteContext>(async (_request, context, routeContext) => {
  const result = await contextAndAssignment(context, await routeContext.params);
  return successResponse(mapAssignmentDto(result.assignment), { requestId: context.requestId });
});

export const PATCH = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const input = await parseJsonBody(request, assignmentUpdateSchema);
  const { services, assignmentId } = await contextAndAssignment(context, await routeContext.params);
  const result = await executeIdempotent(request, services, `clients.projects.assignments.update:${assignmentId}`, input, async () => mapAssignmentDto(
    await services.service.work.updateAssignment(services.identity, assignmentId, {
      role: input.role,
      completedAt: parseDateTime(input.completedAt),
    }) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId);
});

export const DELETE = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const { services, assignmentId } = await contextAndAssignment(context, await routeContext.params);
  const result = await executeIdempotent(request, services, `clients.projects.assignments.delete:${assignmentId}`, {}, async () => mapAssignmentDto(
    await services.service.work.deleteAssignment(services.identity, assignmentId) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId);
});

export const OPTIONS = GET;
