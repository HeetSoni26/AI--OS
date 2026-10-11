export const gmailProviderErrorKinds = [
  "revoked",
  "authentication",
  "authorization",
  "validation",
  "rate_limit",
  "timeout",
  "cancelled",
  "transient",
  "conflict",
  "unknown",
] as const;

export type GmailProviderErrorKind = (typeof gmailProviderErrorKinds)[number];

export interface GmailProviderErrorOptions {
  readonly kind: GmailProviderErrorKind;
  readonly retryable: boolean;
  readonly status?: number;
  readonly providerCode?: string;
  readonly retryAfterMs?: number;
}

/**
 * A safe, ProviderError-like boundary error. It intentionally never stores a
 * response body, request body, credential, token, or arbitrary upstream error.
 */
export class GmailProviderError extends Error {
  readonly provider = "gmail" as const;
  readonly kind: GmailProviderErrorKind;
  readonly retryable: boolean;
  readonly status?: number;
  readonly providerCode?: string;
  readonly retryAfterMs?: number;

  constructor(message: string, options: GmailProviderErrorOptions) {
    super(message);
    this.name = "GmailProviderError";
    this.kind = options.kind;
    this.retryable = options.retryable;
    this.status = options.status;
    this.providerCode = options.providerCode;
    this.retryAfterMs = options.retryAfterMs;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      provider: this.provider,
      kind: this.kind,
      retryable: this.retryable,
      ...(this.status === undefined ? {} : { status: this.status }),
      ...(this.providerCode === undefined ? {} : { providerCode: this.providerCode }),
      ...(this.retryAfterMs === undefined ? {} : { retryAfterMs: this.retryAfterMs }),
    };
  }
}

export interface GmailFailureInput {
  readonly status?: number;
  readonly reason?: string;
  readonly oauthError?: string;
  readonly retryAfterMs?: number;
}

export interface GmailFailureClassification extends GmailProviderErrorOptions {
  readonly message: string;
}

const RATE_LIMIT_REASONS = new Set([
  "dailyLimitExceeded",
  "quotaExceeded",
  "rateLimitExceeded",
  "userRateLimitExceeded",
]);
const TRANSIENT_REASONS = new Set(["backendError", "internalError"]);
const SAFE_OAUTH_ERRORS = new Set([
  "access_denied",
  "invalid_client",
  "invalid_grant",
  "invalid_request",
  "server_error",
  "temporarily_unavailable",
  "unauthorized_client",
  "unsupported_grant_type",
]);
const SAFE_GMAIL_REASONS = new Set([
  ...RATE_LIMIT_REASONS,
  ...TRANSIENT_REASONS,
  "authError",
  "badRequest",
  "forbidden",
  "notFound",
]);

/** Classifies only allow-listed provider metadata; provider descriptions are ignored. */
export function classifyGmailFailure(input: GmailFailureInput): GmailFailureClassification {
  const providerCode =
    input.oauthError !== undefined && SAFE_OAUTH_ERRORS.has(input.oauthError)
      ? input.oauthError
      : input.reason !== undefined && SAFE_GMAIL_REASONS.has(input.reason)
        ? input.reason
        : undefined;

  if (input.oauthError === "invalid_client" || input.oauthError === "unauthorized_client") {
    return {
      message: "Gmail OAuth client authentication failed.",
      kind: "authentication",
      retryable: false,
      status: input.status,
      providerCode,
    };
  }

  if (input.oauthError === "invalid_grant" || input.status === 401) {
    return {
      message: "Gmail authorization is no longer valid.",
      kind: "revoked",
      retryable: false,
      status: input.status,
      providerCode,
    };
  }

  if (input.status === 429 || (input.reason !== undefined && RATE_LIMIT_REASONS.has(input.reason))) {
    return {
      message: "Gmail rate limit exceeded.",
      kind: "rate_limit",
      retryable: true,
      status: input.status,
      providerCode,
      retryAfterMs: input.retryAfterMs,
    };
  }

  if (
    input.status === 408 ||
    input.status === 425 ||
    input.oauthError === "server_error" ||
    input.oauthError === "temporarily_unavailable" ||
    (input.status !== undefined && input.status >= 500) ||
    (input.reason !== undefined && TRANSIENT_REASONS.has(input.reason))
  ) {
    return {
      message: "Gmail is temporarily unavailable.",
      kind: "transient",
      retryable: true,
      status: input.status,
      providerCode,
      retryAfterMs: input.retryAfterMs,
    };
  }

  if (input.status === 409) {
    return {
      message: "Gmail request conflicted with provider state.",
      kind: "conflict",
      retryable: true,
      status: input.status,
      providerCode,
    };
  }

  if (input.status === 403 || input.oauthError === "access_denied") {
    return {
      message: "Gmail request is not authorized.",
      kind: "authorization",
      retryable: false,
      status: input.status,
      providerCode,
    };
  }

  if (input.status !== undefined && input.status >= 400 && input.status < 500) {
    return {
      message: "Gmail rejected the request.",
      kind: "validation",
      retryable: false,
      status: input.status,
      providerCode,
    };
  }

  return {
    message: "Gmail provider request failed.",
    kind: "unknown",
    retryable: false,
    status: input.status,
    providerCode,
  };
}

export function normalizeGmailProviderError(error: unknown): GmailProviderError {
  if (error instanceof GmailProviderError) return error;

  if (error instanceof DOMException && error.name === "AbortError") {
    return new GmailProviderError("Gmail request was cancelled.", {
      kind: "cancelled",
      retryable: false,
    });
  }

  return new GmailProviderError("Gmail provider request failed.", {
    kind: "unknown",
    retryable: false,
  });
}
