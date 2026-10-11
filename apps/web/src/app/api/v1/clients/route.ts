import { clientCreateSchema, clientListDtoSchema, clientListQuerySchema } from "@aios/contracts";
import { parseJsonBody, parseQuery, successResponse } from "@/lib/api";
import {
  executeIdempotent,
  getClientApiServiceContext,
  idempotentSuccessResponse,
  mapClientDto,
  mapClientSummary,
  parseDateOnly,
  toDatabaseClientStatus,
  withClientApi,
} from "@/lib/api/client-routes";

export const GET = withClientApi(async (request, context) => {
  const query = parseQuery(clientListQuerySchema, request);
  const services = await getClientApiServiceContext(context);
  const lifecycle = query.archiveScope === "active" ? "active" : query.archiveScope === "archived" ? "archived" : "all";
  const result = await services.service.clients.listClients(services.identity, {
    q: query.search,
    status: query.status
      ? (Array.isArray(query.status) ? query.status : [query.status]).map(toDatabaseClientStatus)
      : undefined,
    lifecycle,
    sort: query.sort,
    order: query.direction,
    cursor: query.cursor,
    limit: query.limit,
  });
  let rows = result.items;
  if (query.industry) {
    rows = rows.filter((row) => row.industry?.localeCompare(query.industry!, undefined, { sensitivity: "accent" }) === 0);
  }
  const ids = rows.map((row) => row.id);
  const primaryContacts = ids.length ? await services.database.contact.findMany({
    where: { clientId: { in: ids }, isPrimary: true, archivedAt: null, deletedAt: null },
    select: { id: true, clientId: true, name: true },
  }) : [];
  const primaryByClient = new Map(primaryContacts.map((contact) => [contact.clientId, contact]));
  const items = rows.map((row) => mapClientSummary(row as unknown as Record<string, unknown>, primaryByClient.get(row.id) as unknown as Record<string, unknown> | undefined));
  const total = await services.database.client.count({
    where: {
      ...(query.archiveScope === "active" ? { archivedAt: null, deletedAt: null } : {}),
      ...(query.archiveScope === "archived" ? { archivedAt: { not: null }, deletedAt: null } : {}),
      ...(query.archiveScope === "all" ? { deletedAt: null } : {}),
      ...(query.industry ? { industry: { equals: query.industry, mode: "insensitive" } } : {}),
      ...(query.status ? { status: { in: (Array.isArray(query.status) ? query.status : [query.status]).map(toDatabaseClientStatus) } } : {}),
      ...(query.search ? { OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { industry: { contains: query.search, mode: "insensitive" } },
        { contactName: { contains: query.search, mode: "insensitive" } },
        { contactEmail: { contains: query.search, mode: "insensitive" } },
        { contacts: { some: { deletedAt: null, OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { normalizedEmail: { contains: query.search.toLowerCase(), mode: "insensitive" } },
        ] } } },
      ] } : {}),
    },
  });
  const data = clientListDtoSchema.parse({ items, nextCursor: result.nextCursor, hasMore: result.hasMore, total });
  return successResponse(data, {
    requestId: context.requestId,
    meta: { total, cursor: result.nextCursor, hasMore: result.hasMore },
  });
});

export const POST = withClientApi(async (request, context) => {
  const input = await parseJsonBody(request, clientCreateSchema);
  const services = await getClientApiServiceContext(context);
  const result = await executeIdempotent(request, services, "clients.create", input, async () => {
    const created = await services.service.clients.createClient(services.identity, {
      ...input,
      status: toDatabaseClientStatus(input.status),
      startDate: parseDateOnly(input.startDate),
    });
    return mapClientDto(await services.service.clients.getClientDetail(services.identity, created.id) as unknown as Record<string, unknown>);
  });
  return idempotentSuccessResponse(result, context.requestId, { status: result.replayed ? 200 : 201 });
});

export const OPTIONS = GET;
