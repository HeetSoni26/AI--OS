import { ApiRequestError, successResponse, withAuthenticatedApi } from "@/lib/api";
import { isGmailConfigured } from "@/lib/config/env";
import { gmailConnectionStatus, requestManualGmailSync } from "@/lib/gmail/connection";

export const POST = withAuthenticatedApi(async (_request, context) => {
  if (!isGmailConfigured()) throw new ApiRequestError("GMAIL_NOT_CONFIGURED", "Gmail OAuth credentials are not configured.", { status: 503 });
  const connection = await gmailConnectionStatus();
  if (!connection) throw new ApiRequestError("GMAIL_NOT_CONNECTED", "Connect Gmail before requesting synchronization.", { status: 409 });
  const job = await requestManualGmailSync(connection.id, context.ownerId, context.requestId);
  return successResponse({
    accepted: true,
    connectionId: connection.id,
    jobId: job.id,
    status: "queued",
  }, { status: 202, requestId: context.requestId });
});

export const OPTIONS = POST;
