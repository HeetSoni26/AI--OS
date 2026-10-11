import { parseJsonBody, successResponse } from "@/lib/api";
import { assertPathId, executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, manualTimeEntryCreateSchema, mapTimeAggregation, mapTimeEntryDto, parseEntityId, requireProjectForClient, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string; projectId: string }> };

export const GET = withClientApi<RouteContext>(async (_request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const services = await getClientApiServiceContext(context);
  const project = await requireProjectForClient(services, clientId, projectId);
  const items = (project.timeEntries as Record<string, unknown>[]).map(mapTimeEntryDto);
  const aggregation = mapTimeAggregation(await services.service.work.aggregateProjectTime(services.identity, projectId) as unknown as Record<string, unknown>);
  return successResponse({ items, aggregation }, { requestId: context.requestId, meta: { total: items.length } });
});

export const POST = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const params = await routeContext.params;
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const input = await parseJsonBody(request, manualTimeEntryCreateSchema);
  assertPathId(input.projectId, projectId, "projectId");
  const services = await getClientApiServiceContext(context);
  await requireProjectForClient(services, clientId, projectId);
  const result = await executeIdempotent(request, services, `clients.projects.time.create:${projectId}`, input, async () => mapTimeEntryDto(
    await services.service.work.createManualTimeEntry(services.identity, projectId, {
      taskId: input.taskId,
      assignmentId: input.assignmentId,
      description: input.description,
      startedAt: new Date(input.startedAt),
      endedAt: new Date(input.endedAt),
      minutes: input.minutes,
      hourlyRate: input.hourlyRate,
    }) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId, { status: result.replayed ? 200 : 201 });
});

export const OPTIONS = GET;
