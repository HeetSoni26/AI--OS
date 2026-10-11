import { parseJsonBody, successResponse } from "@/lib/api";
import { executeIdempotent, getClientApiServiceContext, idempotentSuccessResponse, manualTimeEntryUpdateSchema, mapTimeEntryDto, parseDateTime, parseEntityId, requireNestedEntity, requireProjectForClient, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string; projectId: string; timeEntryId: string }> };

async function contextAndTimeEntry(context: Parameters<typeof getClientApiServiceContext>[0], params: { clientId: string; projectId: string; timeEntryId: string }) {
  const clientId = parseEntityId(params.clientId, "clientId");
  const projectId = parseEntityId(params.projectId, "projectId");
  const timeEntryId = parseEntityId(params.timeEntryId, "timeEntryId");
  const services = await getClientApiServiceContext(context);
  const project = await requireProjectForClient(services, clientId, projectId);
  return { services, timeEntryId, timeEntry: requireNestedEntity(project, "timeEntries", timeEntryId, "Time entry") };
}

export const GET = withClientApi<RouteContext>(async (_request, context, routeContext) => {
  const result = await contextAndTimeEntry(context, await routeContext.params);
  return successResponse(mapTimeEntryDto(result.timeEntry), { requestId: context.requestId });
});

export const PATCH = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const input = await parseJsonBody(request, manualTimeEntryUpdateSchema);
  const { services, timeEntryId } = await contextAndTimeEntry(context, await routeContext.params);
  const result = await executeIdempotent(request, services, `clients.projects.time.update:${timeEntryId}`, input, async () => mapTimeEntryDto(
    await services.service.work.updateManualTimeEntry(services.identity, timeEntryId, {
      taskId: input.taskId,
      assignmentId: input.assignmentId,
      description: input.description,
      startedAt: parseDateTime(input.startedAt) ?? undefined,
      endedAt: parseDateTime(input.endedAt) ?? undefined,
      minutes: input.minutes,
      hourlyRate: input.hourlyRate,
    }) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId);
});

export const DELETE = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const { services, timeEntryId } = await contextAndTimeEntry(context, await routeContext.params);
  const result = await executeIdempotent(request, services, `clients.projects.time.delete:${timeEntryId}`, {}, async () => mapTimeEntryDto(
    await services.service.work.deleteManualTimeEntry(services.identity, timeEntryId) as unknown as Record<string, unknown>,
  ));
  return idempotentSuccessResponse(result, context.requestId);
});

export const OPTIONS = GET;
