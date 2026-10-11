import { errorResponse, getRequestId, successResponse } from "@/lib/api";
import { isTrustedMutationOrigin } from "@/lib/security/csrf";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  if (!isTrustedMutationOrigin(request)) {
    return errorResponse(
      { code: "CSRF_REJECTED", message: "The request origin is not trusted." },
      { status: 403, requestId },
    );
  }
  const client = await createSupabaseServerClient();
  if (client) await client.auth.signOut();
  return successResponse({ signedOut: true }, { requestId });
}
