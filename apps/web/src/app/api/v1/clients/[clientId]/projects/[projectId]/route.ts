import { projectUpdateSchema } from "@aios/contracts";
import { parseJsonBody, successResponse } from "@/lib/api";
import { executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, mapProjectDetailDto, mapProjectDto, parseDateOnly, parseEntityId, requireProjectForClient, toDatabaseProjectStatus, toDatabaseProjectType, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string; projectId: string }> };

export const GET = withClientApi<RouteContext>(async (_request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const services = await getClientApiServiceContext(context);
  return successResponse(mapProjectDetailDto(await requireProjectForClient(services, clientId, projectId)), { requestId: context.requestId });
});

export const PATCH = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const input = await parseJsonBody(request, projectUpdateSchema);
  const services = await getClientApiServiceContext(context);
  await requireProjectForClient(services, clientId, projectId);
  const result = await executeIdempotent(request, services, `clients.projects.update:${projectId}`, input, async () => mapProjectDto(
    await services.service.work.updateProject(services.identity, projectId, {
      ...input,
      type: input.type === undefined ? undefined : toDatabaseProjectType(input.type),
      status: input.status === undefined ? undefined : toDatabaseProjectStatus(input.status),
      startDate: parseDateOnly(input.startDate),
      dueDate: parseDateOnly(input.dueDate),
    }) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId);
});

export const DELETE = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const services = await getClientApiServiceContext(context);
  await requireProjectForClient(services, clientId, projectId);
  const result = await executeIdempotent(request, services, `clients.projects.delete:${projectId}`, {}, async () => mapProjectDto(
    await services.service.work.deleteProject(services.identity, projectId) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId);
});

export const OPTIONS = GET;
