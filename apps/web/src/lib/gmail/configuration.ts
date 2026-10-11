import "server-only";

import { parseGmailOAuthConfiguration } from "@aios/integrations/gmail";
import { getServerEnv } from "@/lib/config/env";

export function getGmailOAuthConfiguration() {
  const env = getServerEnv();
  return parseGmailOAuthConfiguration({
    clientId: env.GOOGLE_GMAIL_CLIENT_ID ?? "",
    clientSecret: env.GOOGLE_GMAIL_CLIENT_SECRET ?? "",
    redirectUri: env.GOOGLE_GMAIL_REDIRECT_URI ?? "",
    stateSigningSecret: env.GMAIL_OAUTH_STATE_SECRET ?? "",
  });
}
