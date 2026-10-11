import { projectCreateSchema } from "@aios/contracts";
import { parseJsonBody, successResponse } from "@/lib/api";
import { assertPathId, executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, mapProjectDto, parseDateOnly, parseEntityId, toDatabaseProjectStatus, toDatabaseProjectType, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string }> };

export const GET = withClientApi<RouteContext>(async (_request, context, routeContext) => {
  const { clientId: rawClientId } = await routeContext.params;
  const clientId = parseEntityId(rawClientId, "clientId");
  const services = await getClientApiServiceContext(context);
  const rows = await services.service.work.listProjects(services.identity, clientId);
  const items = rows.map((project) => mapProjectDto(project as unknown as Record<string, unknown>));
  return successResponse(items, { requestId: context.requestId, meta: { total: items.length } });
});

export const POST = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const { clientId: rawClientId } = await routeContext.params;
  const clientId = parseEntityId(rawClientId, "clientId");
  const input = await parseJsonBody(request, projectCreateSchema);
  assertPathId(input.clientId, clientId, "clientId");
  const services = await getClientApiServiceContext(context);
  const result = await executeIdempotent(request, services, `clients.projects.create:${clientId}`, input, async () => {
    const created = await services.service.work.createProject(services.identity, clientId, {
      ...input,
      type: toDatabaseProjectType(input.type),
      status: toDatabaseProjectStatus(input.status),
      startDate: parseDateOnly(input.startDate),
      dueDate: parseDateOnly(input.dueDate),
    });
    return mapProjectDto(created as unknown as Record<string, unknown>);
  });
  return idempotentSuccessResponse(result, context.requestId, { status: result.replayed ? 200 : 201 });
});

export const OPTIONS = GET;
