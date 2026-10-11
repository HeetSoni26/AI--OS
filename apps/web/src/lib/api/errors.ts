import type { z } from "zod";

export interface ApiRequestErrorOptions {
  status?: number;
  details?: unknown;
  headers?: HeadersInit;
  cause?: unknown;
}

/** A safe, client-facing error. Unknown errors are never exposed by the API wrapper. */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly headers?: HeadersInit;

  constructor(code: string, message: string, options: ApiRequestErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ApiRequestError";
    this.code = code;
    this.status = options.status ?? 400;
    this.details = options.details;
    this.headers = options.headers;
  }
}

export function formatZodIssues(error: z.ZodError): Array<{ code: string; path: string; message: string }> {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.join("."),
    message: issue.message,
  }));
}
