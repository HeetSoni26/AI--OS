import { graphSearchQuerySchema, graphSearchResponseSchema } from "@aios/contracts";
import { successResponse } from "@/lib/api";
import { getGraphApiServiceContext, parseGraphQuery, withGraphApi } from "@/lib/api/graph-routes";

export const GET = withGraphApi(async (request, context) => {
  const query = parseGraphQuery(graphSearchQuerySchema, request, ["types"]);
  const services = await getGraphApiServiceContext(context);
  const result = await services.service.search(services.identity, query);
  return successResponse(result, {
    requestId: context.requestId,
    schema: graphSearchResponseSchema,
    meta: { total: result.total },
  });
}, ["GET", "OPTIONS"]);

export const OPTIONS = GET;
