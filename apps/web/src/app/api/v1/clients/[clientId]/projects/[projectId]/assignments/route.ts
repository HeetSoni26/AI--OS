import { assignmentCreateSchema } from "@aios/contracts";
import { parseJsonBody, successResponse } from "@/lib/api";
import { assertPathId, assignmentTypeForService, executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, mapAssignmentDto, parseDateTime, parseEntityId, requireProjectForClient, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string; projectId: string }> };

export const GET = withClientApi<RouteContext>(async (_request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const services = await getClientApiServiceContext(context);
  const project = await requireProjectForClient(services, clientId, projectId);
  const items = (project.assignments as Record<string, unknown>[]).map(mapAssignmentDto);
  return successResponse(items, { requestId: context.requestId, meta: { total: items.length } });
});

export const POST = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const input = await parseJsonBody(request, assignmentCreateSchema);
  assertPathId(input.projectId, projectId, "projectId");
  const services = await getClientApiServiceContext(context);
  await requireProjectForClient(services, clientId, projectId);
  if (input.assigneeType === "human" && !input.taskId) {
    throw new (await import("@/lib/api")).ApiRequestError("VALIDATION_FAILED", "Human assignments require a taskId.", {
      status: 422,
      details: [{ code: "custom", path: "taskId", message: "Human assignments require a taskId." }],
    });
  }
  const result = await executeIdempotent(request, services, `clients.projects.assignments.create:${projectId}`, input, async () => {
    if (input.assigneeType === "agent") {
      const created = await services.service.work.createAssignment(services.identity, projectId, {
        assigneeType: assignmentTypeForService.agent,
        agentId: input.agentId,
        taskId: input.taskId,
        role: input.role,
        assignedAt: parseDateTime(input.assignedAt) ?? undefined,
      });
      return mapAssignmentDto(created as unknown as Record<string, unknown>);
    }
    const taskId = input.taskId;
    if (!taskId) {
      throw new (await import("@/lib/api")).ApiRequestError("VALIDATION_FAILED", "Human assignments require a taskId.", { status: 422 });
    }
    const created = await services.service.work.createAssignment(services.identity, projectId, {
      assigneeType: assignmentTypeForService.human,
      taskId,
      role: input.role,
      assignedAt: parseDateTime(input.assignedAt) ?? undefined,
    });
    return mapAssignmentDto(created as unknown as Record<string, unknown>);
  });
  return idempotentSuccessResponse(result, context.requestId, { status: result.replayed ? 200 : 201 });
});

export const OPTIONS = GET;
