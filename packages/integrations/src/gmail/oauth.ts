import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import {
  classifyGmailFailure,
  GmailProviderError,
  normalizeGmailProviderError,
} from "./errors";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly" as const;
export const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth" as const;
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token" as const;
export const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke" as const;

export const gmailOAuthConfigurationSchema = z.object({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.url(),
  stateSigningSecret: z.string().min(32),
  authorizationEndpoint: z.url().default(GOOGLE_AUTHORIZATION_ENDPOINT),
  tokenEndpoint: z.url().default(GOOGLE_TOKEN_ENDPOINT),
  revokeEndpoint: z.url().default(GOOGLE_REVOKE_ENDPOINT),
  requestTimeoutMs: z.number().int().positive().max(120_000).default(10_000),
  stateTtlSeconds: z.number().int().positive().max(15 * 60).default(10 * 60),
});

export type GmailOAuthConfiguration = z.infer<typeof gmailOAuthConfigurationSchema>;
export type GmailOAuthConfigurationInput = z.input<typeof gmailOAuthConfigurationSchema>;

export function parseGmailOAuthConfiguration(
  input: GmailOAuthConfigurationInput,
): GmailOAuthConfiguration {
  const parsed = gmailOAuthConfigurationSchema.safeParse(input);
  if (!parsed.success) {
    throw new GmailProviderError("Gmail OAuth configuration is invalid.", {
      kind: "validation",
      retryable: false,
      providerCode: "invalid_oauth_configuration",
    });
  }
  return parsed.data;
}

const oauthStatePayloadSchema = z.object({
  version: z.literal(1),
  ownerId: z.string().min(1).max(256),
  sessionId: z.string().min(1).max(256),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
});

export type GmailOAuthStatePayload = z.infer<typeof oauthStatePayloadSchema>;

export interface GmailOAuthStateContext {
  readonly ownerId: string;
  readonly sessionId: string;
}

export interface OAuthStateNonceRecord extends GmailOAuthStateContext {
  readonly nonce: string;
  readonly expiresAt: number;
}

export type OAuthStateNonceConsumeResult =
  | "consumed"
  | "not_found"
  | "already_consumed"
  | "binding_mismatch";

/**
 * Persistence contract for one-time OAuth state nonces. `consume` must be an
 * atomic compare-and-consume operation so two callbacks cannot both succeed.
 * Consumed records should be retained until `expiresAt` to identify replays.
 */
export interface OAuthStateNonceStore {
  register(record: OAuthStateNonceRecord): Promise<void>;
  consume(record: OAuthStateNonceRecord): Promise<OAuthStateNonceConsumeResult>;
}

interface StoredNonce extends OAuthStateNonceRecord {
  consumed: boolean;
}

/** Suitable for one-process development/tests; production should use shared storage. */
export class InMemoryOAuthStateNonceStore implements OAuthStateNonceStore {
  readonly #records = new Map<string, StoredNonce>();

  async register(record: OAuthStateNonceRecord): Promise<void> {
    this.#prune(Math.floor(Date.now() / 1000));
    if (this.#records.has(record.nonce)) {
      throw new GmailProviderError("OAuth state nonce collision.", {
        kind: "conflict",
        retryable: true,
        providerCode: "state_nonce_collision",
      });
    }
    this.#records.set(record.nonce, { ...record, consumed: false });
  }

  async consume(record: OAuthStateNonceRecord): Promise<OAuthStateNonceConsumeResult> {
    const stored = this.#records.get(record.nonce);
    if (stored === undefined) return "not_found";
    if (
      stored.ownerId !== record.ownerId ||
      stored.sessionId !== record.sessionId ||
      stored.expiresAt !== record.expiresAt
    ) {
      return "binding_mismatch";
    }
    if (stored.consumed) return "already_consumed";
    stored.consumed = true;
    return "consumed";
  }

  #prune(nowEpochSeconds: number): void {
    for (const [nonce, record] of this.#records) {
      if (record.expiresAt < nowEpochSeconds) this.#records.delete(nonce);
    }
  }
}

export interface CreateGmailOAuthStateInput extends GmailOAuthStateContext {
  readonly now?: Date;
  readonly nonce?: string;
  readonly ttlSeconds?: number;
}

export interface CreatedGmailOAuthState {
  readonly state: string;
  readonly expiresAt: Date;
}

function encodeBase64Url(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function signStatePayload(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(encodedPayload, "utf8").digest();
}

function stateFailure(
  message: string,
  providerCode: string,
  kind: "validation" | "authorization" | "conflict" = "authorization",
): GmailProviderError {
  return new GmailProviderError(message, {
    kind,
    retryable: false,
    providerCode,
  });
}

export async function createGmailOAuthState(
  configuration: GmailOAuthConfiguration,
  nonceStore: OAuthStateNonceStore,
  input: CreateGmailOAuthStateInput,
): Promise<CreatedGmailOAuthState> {
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const ttlSeconds = input.ttlSeconds ?? configuration.stateTtlSeconds;
  if (!Number.isInteger(now) || now < 0 || !Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 15 * 60) {
    throw stateFailure("OAuth state lifetime is invalid.", "invalid_state_lifetime", "validation");
  }

  const payload = oauthStatePayloadSchema.safeParse({
    version: 1,
    ownerId: input.ownerId,
    sessionId: input.sessionId,
    nonce: input.nonce ?? randomBytes(32).toString("base64url"),
    issuedAt: now,
    expiresAt: now + ttlSeconds,
  });
  if (!payload.success) {
    throw stateFailure("OAuth state context is invalid.", "invalid_state_context", "validation");
  }

  await nonceStore.register({
    ownerId: payload.data.ownerId,
    sessionId: payload.data.sessionId,
    nonce: payload.data.nonce,
    expiresAt: payload.data.expiresAt,
  });

  const encodedPayload = encodeBase64Url(JSON.stringify(payload.data));
  const signature = encodeBase64Url(signStatePayload(encodedPayload, configuration.stateSigningSecret));
  return {
    state: `${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.data.expiresAt * 1000),
  };
}

export interface VerifyGmailOAuthStateInput extends GmailOAuthStateContext {
  readonly state: string;
  readonly now?: Date;
}

export async function verifyGmailOAuthState(
  configuration: GmailOAuthConfiguration,
  nonceStore: OAuthStateNonceStore,
  input: VerifyGmailOAuthStateInput,
): Promise<GmailOAuthStatePayload> {
  const segments = input.state.split(".");
  if (segments.length !== 2 || segments.some((segment) => segment.length === 0)) {
    throw stateFailure("OAuth state is malformed.", "malformed_state");
  }

  const [encodedPayload, encodedSignature] = segments as [string, string];
  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    throw stateFailure("OAuth state signature is invalid.", "invalid_state_signature");
  }
  const expectedSignature = signStatePayload(encodedPayload, configuration.stateSigningSecret);
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw stateFailure("OAuth state signature is invalid.", "invalid_state_signature");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw stateFailure("OAuth state payload is invalid.", "invalid_state_payload");
  }
  const payload = oauthStatePayloadSchema.safeParse(decoded);
  if (!payload.success || payload.data.expiresAt <= payload.data.issuedAt) {
    throw stateFailure("OAuth state payload is invalid.", "invalid_state_payload");
  }

  if (payload.data.ownerId !== input.ownerId || payload.data.sessionId !== input.sessionId) {
    throw stateFailure("OAuth state does not match this session.", "state_binding_mismatch");
  }

  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (!Number.isInteger(now) || payload.data.expiresAt <= now) {
    throw stateFailure("OAuth state has expired.", "state_expired");
  }
  if (payload.data.issuedAt > now + 60) {
    throw stateFailure("OAuth state issue time is invalid.", "state_issued_in_future");
  }

  const consumeResult = await nonceStore.consume({
    ownerId: payload.data.ownerId,
    sessionId: payload.data.sessionId,
    nonce: payload.data.nonce,
    expiresAt: payload.data.expiresAt,
  });
  if (consumeResult === "already_consumed") {
    throw stateFailure("OAuth state has already been used.", "state_replayed", "conflict");
  }
  if (consumeResult !== "consumed") {
    throw stateFailure("OAuth state nonce is invalid.", "invalid_state_nonce");
  }

  return payload.data;
}

export interface GmailAuthorizationUrlInput {
  readonly state: string;
  readonly loginHint?: string;
}

/** Generates an offline-consent URL with the single read-only Gmail scope. */
export function createGmailAuthorizationUrl(
  configuration: GmailOAuthConfiguration,
  input: GmailAuthorizationUrlInput,
): URL {
  if (input.state.length === 0) {
    throw stateFailure("OAuth state is required.", "missing_state", "validation");
  }
  const url = new URL(configuration.authorizationEndpoint);
  url.search = new URLSearchParams({
    client_id: configuration.clientId,
    redirect_uri: configuration.redirectUri,
    response_type: "code",
    scope: GMAIL_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state: input.state,
  }).toString();
  if (input.loginHint !== undefined && input.loginHint.trim().length > 0) {
    url.searchParams.set("login_hint", input.loginHint.trim());
  }
  return url;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().min(1),
});

export interface GmailOAuthTokens {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly tokenType: string;
  readonly scopes: readonly string[];
  readonly expiresAt: Date;
}

export type GmailFetch = typeof fetch;

export interface GmailOAuthRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly fetch?: GmailFetch;
  readonly now?: Date;
}

interface ProviderErrorMetadata {
  readonly oauthError?: string;
  readonly reason?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

async function readProviderErrorMetadata(response: Response): Promise<ProviderErrorMetadata> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {};
  }
  const record = asRecord(body);
  if (record === undefined) return {};
  const error = record.error;
  if (typeof error === "string") return { oauthError: error };
  const errorRecord = asRecord(error);
  const errors = errorRecord === undefined || !Array.isArray(errorRecord.errors)
    ? []
    : errorRecord.errors;
  const firstError = asRecord(errors[0]);
  return {
    oauthError: typeof record.error === "string" ? record.error : undefined,
    reason: typeof firstError?.reason === "string" ? firstError.reason : undefined,
  };
}

function parseRetryAfter(response: Response, now: Date): number | undefined {
  const value = response.headers.get("retry-after");
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now.getTime());
}

async function fetchWithTimeout(
  fetchImplementation: GmailFetch,
  url: string,
  init: RequestInit,
  options: { signal?: AbortSignal; timeoutMs: number },
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);
  const abortFromCaller = (): void => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (options.signal?.aborted) controller.abort();

  try {
    return await fetchImplementation(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new GmailProviderError("Gmail request timed out.", {
        kind: "timeout",
        retryable: true,
      });
    }
    if (options.signal?.aborted) {
      throw new GmailProviderError("Gmail request was cancelled.", {
        kind: "cancelled",
        retryable: false,
      });
    }
    if (error instanceof TypeError) {
      throw new GmailProviderError("Gmail network request failed.", {
        kind: "transient",
        retryable: true,
      });
    }
    throw normalizeGmailProviderError(error);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

async function requestTokens(
  configuration: GmailOAuthConfiguration,
  parameters: URLSearchParams,
  options: GmailOAuthRequestOptions,
): Promise<GmailOAuthTokens> {
  const now = options.now ?? new Date();
  const response = await fetchWithTimeout(
    options.fetch ?? globalThis.fetch,
    configuration.tokenEndpoint,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: parameters,
      cache: "no-store",
    },
    {
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? configuration.requestTimeoutMs,
    },
  );

  if (!response.ok) {
    const metadata = await readProviderErrorMetadata(response);
    const classification = classifyGmailFailure({
      status: response.status,
      oauthError: metadata.oauthError,
      reason: metadata.reason,
      retryAfterMs: parseRetryAfter(response, now),
    });
    throw new GmailProviderError(classification.message, classification);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GmailProviderError("Gmail returned an invalid token response.", {
      kind: "transient",
      retryable: true,
      status: response.status,
      providerCode: "invalid_token_response",
    });
  }
  const parsed = tokenResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new GmailProviderError("Gmail returned an invalid token response.", {
      kind: "transient",
      retryable: true,
      status: response.status,
      providerCode: "invalid_token_response",
    });
  }

  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    tokenType: parsed.data.token_type,
    scopes: parsed.data.scope?.split(/\s+/u).filter(Boolean) ?? [],
    expiresAt: new Date(now.getTime() + parsed.data.expires_in * 1000),
  };
}

export interface ExchangeGmailAuthorizationCodeInput extends GmailOAuthRequestOptions {
  readonly code: string;
}

export function exchangeGmailAuthorizationCode(
  configuration: GmailOAuthConfiguration,
  input: ExchangeGmailAuthorizationCodeInput,
): Promise<GmailOAuthTokens> {
  if (input.code.trim().length === 0) {
    throw new GmailProviderError("Gmail authorization code is required.", {
      kind: "validation",
      retryable: false,
      providerCode: "missing_authorization_code",
    });
  }
  return requestTokens(configuration, new URLSearchParams({
    client_id: configuration.clientId,
    client_secret: configuration.clientSecret,
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: configuration.redirectUri,
  }), input);
}

export interface RefreshGmailAccessTokenInput extends GmailOAuthRequestOptions {
  readonly refreshToken: string;
}

export function refreshGmailAccessToken(
  configuration: GmailOAuthConfiguration,
  input: RefreshGmailAccessTokenInput,
): Promise<GmailOAuthTokens> {
  if (input.refreshToken.length === 0) {
    throw new GmailProviderError("Gmail refresh credential is required.", {
      kind: "validation",
      retryable: false,
      providerCode: "missing_refresh_credential",
    });
  }
  return requestTokens(configuration, new URLSearchParams({
    client_id: configuration.clientId,
    client_secret: configuration.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: "refresh_token",
  }), input);
}

export interface RevokeGmailTokenInput extends GmailOAuthRequestOptions {
  readonly token: string;
}

export async function revokeGmailToken(
  configuration: GmailOAuthConfiguration,
  input: RevokeGmailTokenInput,
): Promise<void> {
  if (input.token.length === 0) {
    throw new GmailProviderError("Gmail credential is required for revocation.", {
      kind: "validation",
      retryable: false,
      providerCode: "missing_revoke_credential",
    });
  }
  const now = input.now ?? new Date();
  const response = await fetchWithTimeout(
    input.fetch ?? globalThis.fetch,
    configuration.revokeEndpoint,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: input.token }),
      cache: "no-store",
    },
    {
      signal: input.signal,
      timeoutMs: input.timeoutMs ?? configuration.requestTimeoutMs,
    },
  );
  if (!response.ok) {
    const metadata = await readProviderErrorMetadata(response);
    const classification = classifyGmailFailure({
      status: response.status,
      oauthError: metadata.oauthError,
      reason: metadata.reason,
      retryAfterMs: parseRetryAfter(response, now),
    });
    throw new GmailProviderError(classification.message, classification);
  }
}
