import { contactCreateSchema } from "@aios/contracts";
import { parseJsonBody, successResponse } from "@/lib/api";
import { assertPathId, executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, mapContactDto, parseDateTime, parseEntityId, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string }> };

export const GET = withClientApi<RouteContext>(async (_request, context, routeContext) => {
  const { clientId: rawClientId } = await routeContext.params;
  const clientId = parseEntityId(rawClientId, "clientId");
  const services = await getClientApiServiceContext(context);
  const detail = await services.service.clients.getClientDetail(services.identity, clientId);
  const items = detail.contacts.map((contact) => mapContactDto(contact as unknown as Record<string, unknown>));
  return successResponse(items, { requestId: context.requestId, meta: { total: items.length } });
});

export const POST = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const { clientId: rawClientId } = await routeContext.params;
  const clientId = parseEntityId(rawClientId, "clientId");
  const input = await parseJsonBody(request, contactCreateSchema);
  assertPathId(input.clientId, clientId, "clientId");
  const services = await getClientApiServiceContext(context);
  const result = await executeIdempotent(request, services, `clients.contacts.create:${clientId}`, input, async () => mapContactDto(
    await services.service.clients.createContact(services.identity, clientId, {
      ...input,
      lastContactAt: parseDateTime(input.lastContactAt),
    }) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId, { status: result.replayed ? 200 : 201 });
});

export const OPTIONS = GET;
