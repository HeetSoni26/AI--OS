import { contactUpdateSchema } from "@aios/contracts";
import { parseJsonBody, successResponse } from "@/lib/api";
import { executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, mapContactDto, parseDateTime, parseEntityId, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string; contactId: string }> };

async function requireContact(services: Awaited<ReturnType<typeof getClientApiServiceContext>>, clientId: string, contactId: string) {
  const detail = await services.service.clients.getClientDetail(services.identity, clientId);
  const contact = detail.contacts.find((candidate) => candidate.id === contactId);
  if (!contact) throw new (await import("@aios/data")).ClientOperationsError("NOT_FOUND", "Contact not found for this client.");
  return contact;
}

export const GET = withClientApi<RouteContext>(async (_request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const contactId = parseEntityId(params.contactId, "contactId");
  const services = await getClientApiServiceContext(context);
  return successResponse(mapContactDto(await requireContact(services, clientId, contactId) as unknown as Record<string, unknown>), { requestId: context.requestId });
});

export const PATCH = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const contactId = parseEntityId(params.contactId, "contactId");
  const input = await parseJsonBody(request, contactUpdateSchema);
  const services = await getClientApiServiceContext(context);
  await requireContact(services, clientId, contactId);
  const result = await executeIdempotent(request, services, `clients.contacts.update:${contactId}`, input, async () => mapContactDto(
    await services.service.clients.updateContact(services.identity, contactId, {
      ...input,
      lastContactAt: parseDateTime(input.lastContactAt),
    }) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId);
});

export const DELETE = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const contactId = parseEntityId(params.contactId, "contactId");
  const services = await getClientApiServiceContext(context);
  await requireContact(services, clientId, contactId);
  const result = await executeIdempotent(request, services, `clients.contacts.delete:${contactId}`, {}, async () => mapContactDto(
    await services.service.clients.deleteContact(services.identity, contactId) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId);
});

export const OPTIONS = GET;
