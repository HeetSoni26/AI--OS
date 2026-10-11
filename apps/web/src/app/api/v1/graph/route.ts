import { graphResponseSchema } from "@aios/contracts";
import { successResponse } from "@/lib/api";
import { getGraphApiServiceContext, graphEmptyQuerySchema, parseGraphQuery, withGraphApi } from "@/lib/api/graph-routes";

export const GET = withGraphApi(async (request, context) => {
  parseGraphQuery(graphEmptyQuerySchema, request);
  const services = await getGraphApiServiceContext(context);
  const graph = await services.service.getGraph(services.identity);
  return successResponse(graph, {
    requestId: context.requestId,
    schema: graphResponseSchema,
    meta: { total: graph.nodes.length },
  });
}, ["GET", "OPTIONS"]);

export const OPTIONS = GET;
