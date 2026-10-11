import { clientInvoicesRelationSchema, paginationQuerySchema } from "@aios/contracts";
import { parseQuery, successResponse } from "@/lib/api";
import { getClientApiServiceContext, mapInvoiceDto, parseEntityId, withClientApi } from "@/lib/api/client-routes";

type RouteContext = { params: Promise<{ clientId: string }> };

export const GET = withClientApi<RouteContext>(async (request, context, routeContext) => {
  const { clientId: rawClientId } = await routeContext.params;
  const clientId = parseEntityId(rawClientId, "clientId");
  const query = parseQuery(paginationQuerySchema, request);
  const services = await getClientApiServiceContext(context);
  await services.service.clients.getClientDetail(services.identity, clientId);
  const rows = await services.database.invoice.findMany({
    where: { clientId, deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    cursor: query.cursor ? { id: parseEntityId(query.cursor, "cursor") } : undefined,
    skip: query.cursor ? 1 : 0,
    take: query.limit + 1,
  });
  const hasMore = rows.length > query.limit;
  const visible = hasMore ? rows.slice(0, query.limit) : rows;
  const nextCursor = hasMore ? visible.at(-1)?.id ?? null : null;
  const total = await services.database.invoice.count({ where: { clientId, deletedAt: null } });
  const data = clientInvoicesRelationSchema.parse({
    clientId,
    items: visible.map((invoice) => mapInvoiceDto(invoice as unknown as Record<string, unknown>)),
    total,
    nextCursor,
    hasMore,
  });
  return successResponse(data, { requestId: context.requestId, meta: { total, cursor: nextCursor, hasMore } });
});

export const OPTIONS = GET;
