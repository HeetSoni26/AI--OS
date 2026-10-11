import { createHmac, timingSafeEqual } from "node:crypto";
import { workflowEventSchema } from "@aios/contracts";
import { PrismaWorkflowService, getDatabaseClient } from "@aios/data";
import { errorResponse } from "@/lib/api/response";
import { getRequestId } from "@/lib/api/request-id";

const SIGNATURE_HEADER = "x-webhook-signature";

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.WORKFLOW_SIGNING_SECRET;
  if (!secret) return true; // Degraded dev mode: unsigned events accepted when no secret is configured.
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const provided = signature.replace(/^sha256=/, "");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * Provider execution-event ingress (n8n/Make). HMAC-verified when
 * WORKFLOW_SIGNING_SECRET is set, deduplicated by the execution unique keys.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const rawBody = await request.text();
    if (!verifySignature(rawBody, request.headers.get(SIGNATURE_HEADER))) {
      return errorResponse(
        { code: "WEBHOOK_SIGNATURE_INVALID", message: "The webhook signature is invalid." },
        { requestId, status: 401 },
      );
    }
    const input = workflowEventSchema.parse(JSON.parse(rawBody));
    const service = new PrismaWorkflowService(getDatabaseClient());
    const result = await service.recordProviderEvent(input);
    return Response.json(
      { data: result, error: null },
      { status: result.recorded ? 201 : 202, headers: { "x-request-id": requestId } },
    );
  } catch {
    return errorResponse(
      { code: "INVALID_JSON", message: "The webhook body must be a valid workflow event." },
      { requestId, status: 400 },
    );
  }
}

export async function GET(): Promise<Response> {
  return Response.json(
    {
      data: {
        endpoint: "/api/v1/webhooks/n8n",
        signature: process.env.WORKFLOW_SIGNING_SECRET ? "required (HMAC-SHA256 via x-webhook-signature)" : "not required (no secret configured)",
        events: ["execution_complete", "execution_failed"],
      },
      error: null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
