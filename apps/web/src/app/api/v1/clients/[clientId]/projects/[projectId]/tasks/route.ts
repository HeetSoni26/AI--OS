import { taskCreateSchema } from "@aios/contracts";
import { parseJsonBody, successResponse } from "@/lib/api";
import { assertPathId, executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, mapTaskDto, parseDateTime, parseEntityId, requireProjectForClient, toDatabaseTaskPriority, toDatabaseTaskStatus, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string; projectId: string }> };

export const GET = withClientApi<RouteContext>(async (_request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const services = await getClientApiServiceContext(context);
  const project = await requireProjectForClient(services, clientId, projectId);
  const items = (project.tasks as Record<string, unknown>[]).map(mapTaskDto);
  return successResponse(items, { requestId: context.requestId, meta: { total: items.length } });
});

export const POST = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const input = await parseJsonBody(request, taskCreateSchema);
  assertPathId(input.projectId, projectId, "projectId");
  const services = await getClientApiServiceContext(context);
  await requireProjectForClient(services, clientId, projectId);
  const result = await executeIdempotent(request, services, `clients.projects.tasks.create:${projectId}`, input, async () => mapTaskDto(
    await services.service.work.createTask(services.identity, projectId, {
      ...input,
      status: toDatabaseTaskStatus(input.status),
      priority: toDatabaseTaskPriority(input.priority),
      dueAt: parseDateTime(input.dueAt),
    }) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId, { status: result.replayed ? 200 : 201 });
});

export const OPTIONS = GET;
