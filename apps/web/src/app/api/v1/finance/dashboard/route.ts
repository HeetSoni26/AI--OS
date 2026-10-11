import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { financeServiceFactory, mapFinanceError } from "@/lib/api/finance-routes";

export const GET = withDomainApi(mapFinanceError, async (_request, context) => {
  const services = await getDomainServiceContext(context, financeServiceFactory);
  const [dashboard, profitability] = await Promise.all([
    services.service.getDashboard(services.identity),
    services.service.getClientProfitability(services.identity),
  ]);
  return domainSuccess({ dashboard, profitability }, context.requestId);
});

export const OPTIONS = GET;
