import { invoiceCreateSchema, invoiceListQuerySchema } from "@aios/contracts";
import { parseJsonBody, parseQuery } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { financeServiceFactory, mapFinanceError, mapInvoice } from "@/lib/api/finance-routes";

export const GET = withDomainApi(mapFinanceError, async (request, context) => {
  const query = parseQuery(invoiceListQuerySchema, request);
  const services = await getDomainServiceContext(context, financeServiceFactory);
  const result = await services.service.listInvoices(services.identity, {
    limit: query.limit,
    cursor: query.cursor,
    clientId: query.clientId,
    statuses: query.statuses,
  });
  return domainSuccess({
    items: result.items.map((invoice) => mapInvoice(invoice as unknown as Record<string, unknown>)),
    total: result.total,
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  }, context.requestId);
});

export const POST = withDomainApi(mapFinanceError, async (request, context) => {
  const input = await parseJsonBody(request, invoiceCreateSchema);
  const services = await getDomainServiceContext(context, financeServiceFactory);
  const invoice = await services.service.createInvoice(services.identity, input);
  const detail = await services.service.listInvoices(services.identity, { limit: 200 });
  void invoice;
  const matched = detail.items.find((entry) => entry.id === invoice.id);
  return domainSuccess(mapInvoice((matched ?? invoice) as unknown as Record<string, unknown>), context.requestId, { status: 201 });
});

export const OPTIONS = GET;
