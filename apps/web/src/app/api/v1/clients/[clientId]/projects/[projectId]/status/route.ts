import { parseJsonBody, successResponse } from "@/lib/api";
import { executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, mapProjectDto, parseEntityId, projectStatusUpdateSchema, requireProjectForClient, toDatabaseProjectStatus, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string; projectId: string }> };

export const GET = withClientApi<RouteContext>(async (_request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const services = await getClientApiServiceContext(context);
  const project = await requireProjectForClient(services, clientId, projectId);
  return successResponse({ projectId, status: String(project.status).toLowerCase() }, { requestId: context.requestId });
});

export const PATCH = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const input = await parseJsonBody(request, projectStatusUpdateSchema);
  const services = await getClientApiServiceContext(context);
  await requireProjectForClient(services, clientId, projectId);
  const result = await executeIdempotent(request, services, `clients.projects.status:${projectId}`, input, async () => mapProjectDto(
    await services.service.work.updateProject(services.identity, projectId, { status: toDatabaseProjectStatus(input.status), statusReason: input.reason }) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId);
});

export const OPTIONS = GET;
