import { createGmailAuthorizationUrl, createGmailOAuthState } from "@aios/integrations/gmail";
import { ApiRequestError, successResponse, withAuthenticatedApi } from "@/lib/api";
import { isGmailConfigured } from "@/lib/config/env";
import { getGmailOAuthConfiguration } from "@/lib/gmail/configuration";
import { PrismaOAuthStateNonceStore } from "@/lib/gmail/oauth-state-store";

export const POST = withAuthenticatedApi(async (_request, context) => {
  if (!isGmailConfigured()) throw new ApiRequestError("GMAIL_NOT_CONFIGURED", "Gmail OAuth credentials are not configured.", { status: 503 });
  const configuration = getGmailOAuthConfiguration();
  const state = await createGmailOAuthState(configuration, new PrismaOAuthStateNonceStore(), {
    ownerId: context.ownerId,
    sessionId: context.sessionId,
  });
  const authorizationUrl = createGmailAuthorizationUrl(configuration, { state: state.state, loginHint: context.owner.email });
  return successResponse({ authorizationUrl: authorizationUrl.toString(), expiresAt: state.expiresAt.toISOString() }, { requestId: context.requestId });
});

export const OPTIONS = POST;
