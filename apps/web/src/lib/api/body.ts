import { FILE_UPLOAD_BODY_LIMIT_BYTES, STANDARD_REQUEST_BODY_LIMIT_BYTES } from "@aios/contracts";
import type { z } from "zod";
import { ApiRequestError, formatZodIssues } from "./errors";

export interface ReadBodyOptions {
  limitBytes?: number;
}

function assertDeclaredSize(request: Request, limitBytes: number): void {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return;
  const bytes = Number(contentLength);
  if (Number.isFinite(bytes) && bytes > limitBytes) {
    throw new ApiRequestError("BODY_TOO_LARGE", `Request body exceeds the ${limitBytes}-byte limit.`, { status: 413 });
  }
}

export async function readBodyBytes(request: Request, options: ReadBodyOptions = {}): Promise<Uint8Array> {
  const limitBytes = options.limitBytes ?? STANDARD_REQUEST_BODY_LIMIT_BYTES;
  assertDeclaredSize(request, limitBytes);
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > limitBytes) {
        await reader.cancel();
        throw new ApiRequestError("BODY_TOO_LARGE", `Request body exceeds the ${limitBytes}-byte limit.`, { status: 413 });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function withLimitedBody(request: Request, options: ReadBodyOptions = {}): Promise<Request> {
  if (request.method === "GET" || request.method === "HEAD" || !request.body) {
    assertDeclaredSize(request, options.limitBytes ?? STANDARD_REQUEST_BODY_LIMIT_BYTES);
    return request;
  }
  const bytes = await readBodyBytes(request, options);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
    signal: request.signal,
  });
}

/** Returns a bounded stream for direct upload/scanning without buffering the file in application memory. */
export function limitedUploadBody(
  request: Request,
  limitBytes = FILE_UPLOAD_BODY_LIMIT_BYTES,
): ReadableStream<Uint8Array> {
  assertDeclaredSize(request, limitBytes);
  if (!request.body) throw new ApiRequestError("EMPTY_UPLOAD", "An upload body is required.", { status: 400 });
  let totalBytes = 0;
  return request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      totalBytes += chunk.byteLength;
      if (totalBytes > limitBytes) {
        controller.error(new ApiRequestError("BODY_TOO_LARGE", `Upload exceeds the ${limitBytes}-byte limit.`, { status: 413 }));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
}

export async function readJsonBody(request: Request, options: ReadBodyOptions = {}): Promise<unknown> {
  const bytes = await readBodyBytes(request, options);
  if (bytes.byteLength === 0) throw new ApiRequestError("INVALID_JSON", "A JSON request body is required.", { status: 400 });
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiRequestError("INVALID_JSON", "Request body must be valid JSON.", { status: 400 });
  }
}

export async function parseJsonBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  options: ReadBodyOptions = {},
): Promise<z.output<TSchema>> {
  const result = schema.safeParse(await readJsonBody(request, options));
  if (!result.success) {
    throw new ApiRequestError("VALIDATION_FAILED", "Request body is invalid.", {
      status: 422,
      details: formatZodIssues(result.error),
    });
  }
  return result.data;
}
