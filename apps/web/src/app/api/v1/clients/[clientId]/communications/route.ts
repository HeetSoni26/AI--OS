import { communicationCreateSchema, communicationListQuerySchema } from "@aios/contracts";
import { parseJsonBody, parseQuery, successResponse } from "@/lib/api";
import { assertPathId, executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, mapCommunicationDto, parseEntityId, toDatabaseCommunicationDirection, toDatabaseCommunicationType, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string }> };

export const GET = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const { clientId: rawClientId } = await routeContext.params;
  const clientId = parseEntityId(rawClientId, "clientId");
  const query = parseQuery(communicationListQuerySchema, request);
  const services = await getClientApiServiceContext(context);
  const result = await services.service.communications.listCommunications(services.identity, clientId, {
    cursor: query.cursor,
    limit: query.limit,
    type: query.type === undefined ? undefined : toDatabaseCommunicationType(query.type),
    direction: query.direction === undefined ? undefined : toDatabaseCommunicationDirection(query.direction),
    order: query.order,
  });
  const items = result.items.map((communication) => mapCommunicationDto(communication as unknown as Record<string, unknown>));
  return successResponse(items, {
    requestId: context.requestId,
    meta: { total: items.length, cursor: result.nextCursor, hasMore: result.hasMore },
  });
});

export const POST = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const { clientId: rawClientId } = await routeContext.params;
  const clientId = parseEntityId(rawClientId, "clientId");
  const input = await parseJsonBody(request, communicationCreateSchema);
  assertPathId(input.clientId, clientId, "clientId");
  const services = await getClientApiServiceContext(context);
  const result = await executeIdempotent(request, services, `clients.communications.create:${clientId}`, input, async () => mapCommunicationDto(
    await services.service.communications.createCommunication(services.identity, clientId, {
      ...input,
      type: toDatabaseCommunicationType(input.type),
      direction: toDatabaseCommunicationDirection(input.direction),
      occurredAt: new Date(input.occurredAt),
    }) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId, { status: result.replayed ? 200 : 201 });
});

export const OPTIONS = GET;
