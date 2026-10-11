import { expenseCreateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { financeServiceFactory, mapExpense, mapFinanceError } from "@/lib/api/finance-routes";

export const GET = withDomainApi(mapFinanceError, async (_request, context) => {
  const services = await getDomainServiceContext(context, financeServiceFactory);
  const expenses = await services.service.listExpenses(services.identity);
  return domainSuccess({ items: expenses.map((expense) => mapExpense(expense as unknown as Record<string, unknown>)) }, context.requestId);
});

export const POST = withDomainApi(mapFinanceError, async (request, context) => {
  const input = await parseJsonBody(request, expenseCreateSchema);
  const services = await getDomainServiceContext(context, financeServiceFactory);
  const expense = await services.service.createExpense(services.identity, input);
  return domainSuccess(mapExpense(expense as unknown as Record<string, unknown>), context.requestId, { status: 201 });
});

export const OPTIONS = GET;
