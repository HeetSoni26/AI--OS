import { clientRecoverRequestSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, mapClientDto, parseEntityId, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string }> };

export const POST = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const { clientId: rawClientId } = await routeContext.params;
  const clientId = parseEntityId(rawClientId, "clientId");
  const input = await parseJsonBody(request, clientRecoverRequestSchema);
  const services = await getClientApiServiceContext(context);
  const result = await executeIdempotent(request, services, `clients.recover:${clientId}`, input, async () => {
    await services.service.clients.recoverClient(services.identity, clientId, input.reason);
    return mapClientDto(await services.service.clients.getClientDetail(services.identity, clientId) as unknown as Record<string, unknown>);
  });
  return idempotentSuccessResponse(result, context.requestId);
});

export const OPTIONS = POST;
