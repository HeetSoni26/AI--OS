import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER, requestIdSchema } from "@aios/contracts";

function validRequestId(value: string | null): string | null {
  const result = requestIdSchema.safeParse(value);
  return result.success ? result.data : null;
}

/** Reuses a trusted inbound identifier or creates one for the request lifecycle. */
export function getRequestId(requestOrHeaders?: Request | Headers): string {
  const headers = requestOrHeaders instanceof Request ? requestOrHeaders.headers : requestOrHeaders;
  return (
    validRequestId(headers?.get(REQUEST_ID_HEADER) ?? null) ??
    validRequestId(headers?.get(CORRELATION_ID_HEADER) ?? null) ??
    crypto.randomUUID()
  );
}

/** Request ID and correlation ID intentionally match so downstream systems can use either convention. */
export function getCorrelationHeaders(requestId: string): Headers {
  const headers = new Headers();
  headers.set(REQUEST_ID_HEADER, requestId);
  headers.set(CORRELATION_ID_HEADER, requestId);
  return headers;
}
