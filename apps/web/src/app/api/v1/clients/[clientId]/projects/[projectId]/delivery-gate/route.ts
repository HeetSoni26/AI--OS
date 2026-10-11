import { deliveryGateResultSchema } from "@aios/contracts";
import { successResponse } from "@/lib/api";
import { getClientApiServiceContext, parseEntityId, requireProjectForClient, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string; projectId: string }> };

export const GET = withClientApi<RouteContext>(async (_request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const services = await getClientApiServiceContext(context);
  await requireProjectForClient(services, clientId, projectId);
  const incomplete = await services.database.deliverable.findMany({
    where: { projectId, isRequired: true, completedAt: null, archivedAt: null, deletedAt: null },
    select: { id: true, title: true },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
  const result = deliveryGateResultSchema.parse(incomplete.length === 0
    ? { allowed: true, blockers: [] }
    : { allowed: false, blockers: incomplete.map((deliverable) => ({ deliverableId: deliverable.id, title: deliverable.title, reason: "required_incomplete" as const })) });
  return successResponse(result, { requestId: context.requestId });
});

export const OPTIONS = GET;
