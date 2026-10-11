import { invoiceStatusUpdateSchema, paymentRecordSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { z } from "zod";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { financeServiceFactory, mapFinanceError, mapInvoice } from "@/lib/api/finance-routes";

type RouteContext = { params: Promise<{ invoiceId: string }> };

const bodySchema = z.union([
  z.strictObject({ action: z.literal("status"), status: invoiceStatusUpdateSchema.shape.status, note: z.string().trim().max(500).nullable().optional() }),
  z.strictObject({ action: z.literal("record_payment"), amount: paymentRecordSchema.shape.amount, paidAt: z.string().datetime({ offset: true }).optional() }),
]);

export const POST = withDomainApi<RouteContext>(mapFinanceError, async (request, context, routeContext) => {
  const { invoiceId } = await routeContext.params;
  const input = await parseJsonBody(request, bodySchema);
  const services = await getDomainServiceContext(context, financeServiceFactory);
  if (input.action === "status") {
    await services.service.updateInvoiceStatus(services.identity, invoiceId, { status: input.status, note: input.note ?? null });
  } else {
    await services.service.recordPayment(services.identity, invoiceId, { amount: input.amount, paidAt: input.paidAt });
  }
  const detail = await services.service.listInvoices(services.identity, { limit: 200 });
  const matched = detail.items.find((entry) => entry.id === invoiceId);
  if (!matched) throw new Error("Invoice disappeared after update.");
  return domainSuccess(mapInvoice(matched as unknown as Record<string, unknown>), context.requestId);
});

export const OPTIONS = POST;
