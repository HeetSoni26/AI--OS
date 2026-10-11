import { isGmailConfigured } from "@/lib/config/env";
import { successResponse, withAuthenticatedApi } from "@/lib/api";
import { gmailConnectionStatus } from "@/lib/gmail/connection";

export const GET = withAuthenticatedApi(async (_request, context) => {
  const configured = isGmailConfigured();
  const connection = configured ? await gmailConnectionStatus() : null;
  return successResponse({
    configured,
    connection: connection ? {
      id: connection.id,
      name: connection.name,
      status: connection.status.toLowerCase(),
      account: connection.externalAccountId,
      scopes: connection.scopes,
      connectedAt: connection.connectedAt?.toISOString() ?? null,
      sync: connection.syncStates[0] ? {
        status: connection.syncStates[0].status.toLowerCase(),
        lastSyncedAt: connection.syncStates[0].lastSyncedAt?.toISOString() ?? null,
        nextRetryAt: connection.syncStates[0].nextRetryAt?.toISOString() ?? null,
        lastErrorCode: connection.syncStates[0].lastErrorCode,
      } : null,
    } : null,
  }, { requestId: context.requestId });
});

export const OPTIONS = GET;
