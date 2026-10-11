import { graphNodeListQuerySchema, graphNodeListResponseSchema } from "@aios/contracts";
import { successResponse } from "@/lib/api";
import { getGraphApiServiceContext, parseGraphQuery, withGraphApi } from "@/lib/api/graph-routes";

export const GET = withGraphApi(async (request, context) => {
  const query = parseGraphQuery(graphNodeListQuerySchema, request, ["types", "hubs", "actions"]);
  const services = await getGraphApiServiceContext(context);
  const result = await services.service.listNodes(services.identity, query);
  return successResponse(result, {
    requestId: context.requestId,
    schema: graphNodeListResponseSchema,
    meta: result.meta,
  });
}, ["GET", "OPTIONS"]);

export const OPTIONS = GET;
