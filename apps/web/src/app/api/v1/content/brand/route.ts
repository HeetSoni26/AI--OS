import { brandProfileUpsertSchema } from "@aios/contracts";
import { parseJsonBody, parseQuery } from "@/lib/api";
import { z } from "zod";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";
import { contentServiceFactory, mapBrandProfile, mapContentError } from "@/lib/api/content-routes";

const brandQuerySchema = z.strictObject({
  scope: z.enum(["client", "agency"]).optional(),
  clientId: z.string().uuid().optional(),
});

export const GET = withDomainApi(mapContentError, async (request, context) => {
  const query = parseQuery(brandQuerySchema, request);
  const services = await getDomainServiceContext(context, contentServiceFactory);
  const profiles = await services.service.listBrandProfiles(services.identity, query.scope, query.clientId);
  return domainSuccess({ items: profiles.map((profile) => mapBrandProfile(profile as unknown as Record<string, unknown>)) }, context.requestId);
});

export const POST = withDomainApi(mapContentError, async (request, context) => {
  const input = await parseJsonBody(request, brandProfileUpsertSchema);
  const services = await getDomainServiceContext(context, contentServiceFactory);
  const profile = await services.service.upsertBrandProfile(services.identity, input);
  return domainSuccess(mapBrandProfile(profile as unknown as Record<string, unknown>), context.requestId, { status: 201 });
});

export const OPTIONS = GET;
