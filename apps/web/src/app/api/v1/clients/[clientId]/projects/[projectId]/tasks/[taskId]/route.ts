import { taskUpdateSchema } from "@aios/contracts";
import { parseJsonBody, successResponse } from "@/lib/api";
import { executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, mapTaskDto, parseDateTime, parseEntityId, requireNestedEntity, requireProjectForClient, toDatabaseTaskPriority, toDatabaseTaskStatus, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string; projectId: string; taskId: string }> };

async function contextAndTask(context: Parameters<typeof getClientApiServiceContext>[0], params: { clientId: string; projectId: string; taskId: string }) {
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const taskId = parseEntityId(params.taskId, "taskId");
  const services = await getClientApiServiceContext(context);
  const project = await requireProjectForClient(services, clientId, projectId);
  return { services, taskId, task: requireNestedEntity(project, "tasks", taskId, "Task") };
}

export const GET = withClientApi<RouteContext>(async (_request, context, routeContext) => {
  const result = await contextAndTask(context, await routeContext.params);
  return successResponse(mapTaskDto(result.task), { requestId: context.requestId });
});

export const PATCH = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const input = await parseJsonBody(request, taskUpdateSchema);
  const { services, taskId } = await contextAndTask(context, await routeContext.params);
  const result = await executeIdempotent(request, services, `clients.projects.tasks.update:${taskId}`, input, async () => mapTaskDto(
    await services.service.work.updateTask(services.identity, taskId, {
      ...input,
      status: input.status === undefined ? undefined : toDatabaseTaskStatus(input.status),
      priority: input.priority === undefined ? undefined : toDatabaseTaskPriority(input.priority),
      dueAt: parseDateTime(input.dueAt),
      completedAt: parseDateTime(input.completedAt),
    }) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId);
});

export const DELETE = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const { services, taskId } = await contextAndTask(context, await routeContext.params);
  const result = await executeIdempotent(request, services, `clients.projects.tasks.delete:${taskId}`, {}, async () => mapTaskDto(
    await services.service.work.deleteTask(services.identity, taskId) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId);
});

export const OPTIONS = GET;
