import { clientArchiveRequestSchema, clientUpdateSchema } from "@aios/contracts";
import { parseJsonBody, successResponse } from "@/lib/api";
import {
  executeIdempotent,
  getClientApiServiceContext,
  idempotentSuccessResponse,
  mapClientDto,
  parseDateOnly,
  parseEntityId,
  toDatabaseClientStatus,
  withClientApi,
} from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string }> };

export const GET = withClientApi<RouteContext>(async (_request, context, routeContext) => {
  const { clientId: rawClientId } = await routeContext.params;
  const clientId = parseEntityId(rawClientId, "clientId");
  const services = await getClientApiServiceContext(context);
  const client = await services.service.clients.getClientDetail(services.identity, clientId);
  return successResponse(mapClientDto(client as unknown as Record<string, unknown>), { requestId: context.requestId });
});

export const PATCH = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const { clientId: rawClientId } = await routeContext.params;
  const clientId = parseEntityId(rawClientId, "clientId");
  const input = await parseJsonBody(request, clientUpdateSchema);
  const services = await getClientApiServiceContext(context);
  const result = await executeIdempotent(request, services, `clients.update:${clientId}`, input, async () => {
    await services.service.clients.updateClient(services.identity, clientId, {
      ...input,
      status: input.status === undefined ? undefined : toDatabaseClientStatus(input.status),
      startDate: parseDateOnly(input.startDate),
    });
    return mapClientDto(await services.service.clients.getClientDetail(services.identity, clientId) as unknown as Record<string, unknown>);
  });
  return idempotentSuccessResponse(result, context.requestId);
});

export const DELETE = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const { clientId: rawClientId } = await routeContext.params;
  const clientId = parseEntityId(rawClientId, "clientId");
  const input = await parseJsonBody(request, clientArchiveRequestSchema);
  const services = await getClientApiServiceContext(context);
  const result = await executeIdempotent(request, services, `clients.archive:${clientId}`, input, async () => {
    await services.service.clients.archiveClient(services.identity, clientId, input.reason);
    return mapClientDto(await services.service.clients.getClientDetail(services.identity, clientId) as unknown as Record<string, unknown>);
  });
  return idempotentSuccessResponse(result, context.requestId);
});

export const OPTIONS = GET;
