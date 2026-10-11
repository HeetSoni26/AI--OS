import {
  edgeDataSchema,
  graphEdgeCreateInputSchema,
  graphEdgeListQuerySchema,
  graphEdgeListResponseSchema,
} from "@aios/contracts";
import { parseJsonBody, successResponse } from "@/lib/api";
import {
  executeGraphIdempotent,
  getGraphApiServiceContext,
  graphEmptyQuerySchema,
  graphIdempotentSuccessResponse,
  parseGraphQuery,
  withGraphApi,
} from "@/lib/api/graph-routes";

export const GET = withGraphApi(async (request, context) => {
  const query = parseGraphQuery(graphEdgeListQuerySchema, request, ["types"]);
  const services = await getGraphApiServiceContext(context);
  const result = await services.service.listEdges(services.identity, query);
  return successResponse(result, {
    requestId: context.requestId,
    schema: graphEdgeListResponseSchema,
    meta: result.meta,
  });
}, ["GET", "POST", "OPTIONS"]);

export const POST = withGraphApi(async (request, context) => {
  parseGraphQuery(graphEmptyQuerySchema, request);
  const input = await parseJsonBody(request, graphEdgeCreateInputSchema);
  const services = await getGraphApiServiceContext(context);
  const result = await executeGraphIdempotent(request, services, "graph.edges.create", input, () =>
    services.service.createEdge(services.identity, input));
  return graphIdempotentSuccessResponse(result, context.requestId, {
    status: result.replayed ? 200 : 201,
    schema: edgeDataSchema,
  });
}, ["GET", "POST", "OPTIONS"]);

export const OPTIONS = GET;
