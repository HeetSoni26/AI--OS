import type { ApiErrorEnvelope, ApiSuccessEnvelope } from "@aios/contracts";

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<ApiSuccessEnvelope<T>> {
  const response = await fetch(input, {
    ...init,
    headers: { accept: "application/json", ...init?.headers },
    credentials: "same-origin",
  });
  const body = await response.json() as ApiSuccessEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || "error" in body) {
    const error = "error" in body ? body.error : { code: "HTTP_ERROR", message: "The request failed." };
    throw new ApiClientError(error.code, error.message, response.status, body.meta?.requestId, error.details);
  }
  return body;
}
