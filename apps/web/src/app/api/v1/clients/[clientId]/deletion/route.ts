import { clientDeletionCancellationSchema, clientDeletionRequestSchema } from "@aios/contracts";
import { parseJsonBody, successResponse } from "@/lib/api";
import { assertPathId, executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, mapDeletionPlan, parseEntityId, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string }> };

export const GET = withClientApi<RouteContext>(async (_request, context, routeContext) => {
  const { clientId: rawClientId } = await routeContext.params;
  const clientId = parseEntityId(rawClientId, "clientId");
  const services = await getClientApiServiceContext(context);
  const impact = await services.service.clients.getDeletionImpact(services.identity, clientId);
  const request = await services.database.deletionRequest.findFirst({
    where: { entityType: "client", entityId: clientId, status: { in: ["PENDING", "EXECUTING"] } },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
  });
  const plan = request ? mapDeletionPlan({
    ...request,
    clientId,
    impact,
    version: request.impactRegistryVersion,
  }) : null;
  return successResponse({ impact, plan }, { requestId: context.requestId });
});

export const POST = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const { clientId: rawClientId } = await routeContext.params;
  const clientId = parseEntityId(rawClientId, "clientId");
  const input = await parseJsonBody(request, clientDeletionRequestSchema);
  assertPathId(input.clientId, clientId, "clientId");
  const services = await getClientApiServiceContext(context);
  const result = await executeIdempotent(request, services, `clients.deletion.schedule:${clientId}`, input, async () => mapDeletionPlan(
    await services.service.clients.scheduleClientDeletion(services.identity, clientId, input) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId, { status: result.replayed ? 200 : 202 });
});

export const DELETE = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const { clientId: rawClientId } = await routeContext.params;
  const clientId = parseEntityId(rawClientId, "clientId");
  const input = await parseJsonBody(request, clientDeletionCancellationSchema);
  assertPathId(input.clientId, clientId, "clientId");
  const services = await getClientApiServiceContext(context);
  const result = await executeIdempotent(request, services, `clients.deletion.cancel:${clientId}:${input.deletionPlanId}`, input, async () => {
    await services.service.clients.cancelClientDeletion(services.identity, clientId, input.deletionPlanId, input.reason);
    const requestRow = await services.database.deletionRequest.findUnique({ where: { id: input.deletionPlanId } });
    if (!requestRow) throw new Error("Cancelled deletion request disappeared.");
    const manifest = requestRow.impactManifest as Record<string, unknown>;
    return mapDeletionPlan({
      ...requestRow,
      clientId,
      impact: { clientId, items: manifest.items, legalHold: manifest.legalHold, blockers: manifest.blockers },
      version: requestRow.impactRegistryVersion,
    });
  });
  return idempotentSuccessResponse(result, context.requestId);
});

export const OPTIONS = GET;
