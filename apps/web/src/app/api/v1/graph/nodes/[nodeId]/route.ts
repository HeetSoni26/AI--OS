import { graphNodeDetailSchema, graphNodeIdSchema } from "@aios/contracts";
import { successResponse } from "@/lib/api";
import { getGraphApiServiceContext, graphEmptyQuerySchema, parseGraphPath, parseGraphQuery, withGraphApi } from "@/lib/api/graph-routes";

type RouteContext = { params: Promise<{ nodeId: string }> };

export const GET = withGraphApi<RouteContext>(async (request, context, routeContext) => {
  parseGraphQuery(graphEmptyQuerySchema, request);
  const { nodeId: rawNodeId } = await routeContext.params;
  const nodeId = parseGraphPath(graphNodeIdSchema, rawNodeId, "nodeId");
  const services = await getGraphApiServiceContext(context);
  const detail = await services.service.getNodeDetail(services.identity, nodeId);
  return successResponse(detail, { requestId: context.requestId, schema: graphNodeDetailSchema });
}, ["GET", "OPTIONS"]);

export const OPTIONS = GET;
