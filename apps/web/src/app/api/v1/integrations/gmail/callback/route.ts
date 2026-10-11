import { verifyGmailOAuthState } from "@aios/integrations/gmail";
import { ApiRequestError, withAuthenticatedApi } from "@/lib/api";
import { isGmailConfigured } from "@/lib/config/env";
import { connectGmail } from "@/lib/gmail/connection";
import { getGmailOAuthConfiguration } from "@/lib/gmail/configuration";
import { PrismaOAuthStateNonceStore } from "@/lib/gmail/oauth-state-store";

export const GET = withAuthenticatedApi(async (request, context) => {
  if (!isGmailConfigured()) throw new ApiRequestError("GMAIL_NOT_CONFIGURED", "Gmail OAuth credentials are not configured.", { status: 503 });
  const url = new URL(request.url);
  const providerError = url.searchParams.get("error");
  if (providerError) throw new ApiRequestError("GMAIL_AUTHORIZATION_REJECTED", "Gmail authorization was not completed.", { status: 400 });
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) throw new ApiRequestError("GMAIL_CALLBACK_INVALID", "Gmail callback parameters are incomplete.", { status: 400 });
  const configuration = getGmailOAuthConfiguration();
  await verifyGmailOAuthState(configuration, new PrismaOAuthStateNonceStore(), {
    state,
    ownerId: context.ownerId,
    sessionId: context.sessionId,
  });
  await connectGmail(code, context.ownerId, context.requestId);
  return Response.redirect(new URL("/clients?gmail=connected", request.url), 303);
});
