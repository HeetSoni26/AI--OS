import { sopCreateSchema } from "@aios/contracts";
import { parseJsonBody } from "@/lib/api";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { knowledgeServiceFactory, mapKnowledgeError, mapSop } from "@/lib/api/knowledge-routes";

export const GET = withDomainApi(mapKnowledgeError, async (_request, context) => {
  const services = await getDomainServiceContext(context, knowledgeServiceFactory);
  const sops = await services.service.listSops(services.identity);
  return domainSuccess({ items: sops.map((sop) => mapSop(sop as unknown as Record<string, unknown>)) }, context.requestId);
});

export const POST = withDomainApi(mapKnowledgeError, async (request, context) => {
  const input = await parseJsonBody(request, sopCreateSchema);
  const services = await getDomainServiceContext(context, knowledgeServiceFactory);
  const sop = await services.service.createSop(services.identity, input);
  return domainSuccess(mapSop(sop as unknown as Record<string, unknown>), context.requestId, { status: 201 });
});

export const OPTIONS = GET;
