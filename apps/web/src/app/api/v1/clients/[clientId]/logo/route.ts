import { successResponse, withAuthenticatedApi } from "@/lib/api";
import { readBodyBytes } from "@/lib/api/body";
import { getClientApiServiceContext } from "@/lib/api/client-routes";
import { CLIENT_LOGO_LIMIT_BYTES, validateClientLogo } from "@/lib/storage/image-validation";
import { createClientLogoDownload, removeClientLogo, saveClientLogo } from "@/lib/storage/client-logos";

type RouteContext = { params: Promise<{ clientId: string }> };

export const GET = withAuthenticatedApi<RouteContext>(async (_request, context, routeContext) => {
  const { clientId } = await routeContext.params;
  const logo = await createClientLogoDownload(clientId);
  return new Response(null, {
    status: 307,
    headers: {
      location: logo.signedUrl,
      "cache-control": "private, no-store",
      etag: `"${logo.etag}"`,
      "x-content-type-options": "nosniff",
      "x-request-id": context.requestId,
    },
  });
}, { bodyMode: "stream" });

export const POST = withAuthenticatedApi<RouteContext>(async (request, context, routeContext) => {
  const { clientId } = await routeContext.params;
  const bytes = await readBodyBytes(request, { limitBytes: CLIENT_LOGO_LIMIT_BYTES });
  const image = validateClientLogo(bytes, request.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? null);
  const services = await getClientApiServiceContext(context);
  await saveClientLogo(clientId, image, { subject: services.identity.ownerSubject, correlationId: context.requestId });
  return successResponse({ logoUrl: `/api/v1/clients/${clientId}/logo`, width: image.width, height: image.height }, {
    status: 201,
    requestId: context.requestId,
  });
}, { bodyMode: "stream" });

export const DELETE = withAuthenticatedApi<RouteContext>(async (_request, context, routeContext) => {
  const { clientId } = await routeContext.params;
  const services = await getClientApiServiceContext(context);
  await removeClientLogo(clientId, { subject: services.identity.ownerSubject, correlationId: context.requestId });
  return successResponse({ removed: true }, { requestId: context.requestId });
});

export const OPTIONS = GET;
