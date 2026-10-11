import { edgeDataSchema } from "@aios/contracts";
import {
  executeGraphIdempotent,
  getGraphApiServiceContext,
  graphEmptyQuerySchema,
  graphIdempotentSuccessResponse,
  parseGraphEdgeId,
  parseGraphQuery,
  withGraphApi,
} from "@/lib/api/graph-routes";

type RouteContext = { params: Promise<{ edgeId: string }> };

export const DELETE = withGraphApi<RouteContext>(async (request, context, routeContext) => {
  parseGraphQuery(graphEmptyQuerySchema, request);
  const { edgeId: rawEdgeId } = await routeContext.params;
  const edgeId = parseGraphEdgeId(rawEdgeId);
  const services = await getGraphApiServiceContext(context);
  const input = { id: edgeId };
  const result = await executeGraphIdempotent(request, services, `graph.edges.delete:${edgeId}`, input, () =>
    services.service.deleteEdge(services.identity, input));
  return graphIdempotentSuccessResponse(result, context.requestId, { schema: edgeDataSchema });
}, ["DELETE", "OPTIONS"]);

export const OPTIONS = DELETE;
