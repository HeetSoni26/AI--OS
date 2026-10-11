import { z } from "zod";

import { classifyGmailFailure, GmailProviderError, normalizeGmailProviderError } from "./errors";
import {
  gmailHistoryPageRequestSchema,
  normalizeGmailHistoryPage,
  type GmailHistoryMessageReference,
  type GmailHistoryPage,
  type GmailHistoryPageRequestInput,
} from "./history";
import { gmailApiMessageMetadataSchema, type GmailApiMessageMetadata } from "./messages";
import type { GmailFetch } from "./oauth";

export const GMAIL_API_ENDPOINT = "https://gmail.googleapis.com/gmail/v1" as const;
export const GMAIL_METADATA_HEADERS = [
  "From",
  "Sender",
  "Reply-To",
  "To",
  "Cc",
  "Bcc",
  "Subject",
  "Message-ID",
] as const;

const gmailProfileSchema = z.object({
  emailAddress: z.string().trim().email(),
  historyId: z.string().regex(/^\d+$/u),
});

export type GmailProfile = z.infer<typeof gmailProfileSchema>;

export interface GmailApiClientOptions {
  readonly accessToken: string;
  readonly apiEndpoint?: string;
  readonly requestTimeoutMs?: number;
  readonly fetch?: GmailFetch;
}

export interface GmailApiRequestOptions {
  readonly signal?: AbortSignal;
}

export interface GmailHistoryReadInput extends GmailApiRequestOptions {
  readonly startHistoryId: string;
  readonly maxResults?: number;
  readonly maximumPages?: number;
}

export interface GmailHistoryReadResult {
  readonly pages: readonly GmailHistoryPage[];
  readonly addedMessages: readonly GmailHistoryMessageReference[];
  readonly checkpointValue: string;
}

interface ProviderErrorMetadata {
  readonly reason?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

async function providerErrorMetadata(response: Response): Promise<ProviderErrorMetadata> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {};
  }
  const record = asRecord(body);
  const error = asRecord(record?.error);
  const errors = Array.isArray(error?.errors) ? error.errors : [];
  const first = asRecord(errors[0]);
  return { reason: typeof first?.reason === "string" ? first.reason : undefined };
}

function retryAfterMilliseconds(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : Math.max(0, timestamp - Date.now());
}

function safeMessageId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 255 || /[/?#]/u.test(normalized)) {
    throw new GmailProviderError("Gmail message identifier is invalid.", {
      kind: "validation",
      retryable: false,
      providerCode: "invalid_message_id",
    });
  }
  return normalized;
}

export class GmailApiClient {
  readonly #accessToken: string;
  readonly #apiEndpoint: string;
  readonly #requestTimeoutMs: number;
  readonly #fetch: GmailFetch;

  constructor(options: GmailApiClientOptions) {
    if (!options.accessToken) {
      throw new GmailProviderError("Gmail access credential is required.", {
        kind: "validation",
        retryable: false,
        providerCode: "missing_access_credential",
      });
    }
    this.#accessToken = options.accessToken;
    this.#apiEndpoint = (options.apiEndpoint ?? GMAIL_API_ENDPOINT).replace(/\/$/u, "");
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.#fetch = options.fetch ?? globalThis.fetch;
    if (!Number.isInteger(this.#requestTimeoutMs) || this.#requestTimeoutMs <= 0 || this.#requestTimeoutMs > 120_000) {
      throw new GmailProviderError("Gmail API request timeout is invalid.", {
        kind: "validation",
        retryable: false,
        providerCode: "invalid_request_timeout",
      });
    }
  }

  async getProfile(options: GmailApiRequestOptions = {}): Promise<GmailProfile> {
    const body = await this.#request("/users/me/profile", new URLSearchParams(), options);
    const parsed = gmailProfileSchema.safeParse(body);
    if (!parsed.success) throw this.#invalidResponse("invalid_profile_response");
    return { ...parsed.data, emailAddress: parsed.data.emailAddress.toLowerCase() };
  }

  async getHistoryPage(
    input: GmailHistoryPageRequestInput,
    options: GmailApiRequestOptions = {},
  ): Promise<GmailHistoryPage> {
    const request = gmailHistoryPageRequestSchema.safeParse(input);
    if (!request.success) {
      throw new GmailProviderError("Gmail history request is invalid.", {
        kind: "validation",
        retryable: false,
        providerCode: "invalid_history_request",
      });
    }
    const query = new URLSearchParams({
      startHistoryId: request.data.startHistoryId,
      maxResults: String(request.data.maxResults),
      historyTypes: "messageAdded",
    });
    if (request.data.pageToken !== undefined) query.set("pageToken", request.data.pageToken);
    const body = await this.#request("/users/me/history", query, options);
    return normalizeGmailHistoryPage(body, request.data);
  }

  async readHistory(input: GmailHistoryReadInput): Promise<GmailHistoryReadResult> {
    const maximumPages = input.maximumPages ?? 1_000;
    if (!Number.isInteger(maximumPages) || maximumPages <= 0 || maximumPages > 10_000) {
      throw new GmailProviderError("Gmail history page limit is invalid.", {
        kind: "validation",
        retryable: false,
        providerCode: "invalid_history_page_limit",
      });
    }

    const pages: GmailHistoryPage[] = [];
    const addedById = new Map<string, GmailHistoryMessageReference>();
    const seenPageTokens = new Set<string>();
    let pageToken: string | undefined;
    for (let pageNumber = 0; pageNumber < maximumPages; pageNumber += 1) {
      const page = await this.getHistoryPage({
        startHistoryId: input.startHistoryId,
        maxResults: input.maxResults ?? 100,
        ...(pageToken === undefined ? {} : { pageToken }),
      }, input.signal === undefined ? {} : { signal: input.signal });
      pages.push(page);
      for (const change of page.changes) {
        for (const reference of change.added) addedById.set(reference.providerMessageId, reference);
      }
      if (page.nextPageToken === undefined) {
        if (page.checkpointCandidate === undefined) throw this.#invalidResponse("missing_history_checkpoint");
        return {
          pages,
          addedMessages: [...addedById.values()].sort((left, right) =>
            left.providerMessageId.localeCompare(right.providerMessageId) ||
            left.providerThreadId.localeCompare(right.providerThreadId)),
          checkpointValue: page.checkpointCandidate,
        };
      }
      if (seenPageTokens.has(page.nextPageToken)) {
        throw this.#invalidResponse("repeated_history_page_token");
      }
      seenPageTokens.add(page.nextPageToken);
      pageToken = page.nextPageToken;
    }
    throw new GmailProviderError("Gmail history exceeded the configured page limit.", {
      kind: "transient",
      retryable: true,
      providerCode: "history_page_limit_exceeded",
    });
  }

  async getMessageMetadata(
    providerMessageId: string,
    options: GmailApiRequestOptions = {},
  ): Promise<GmailApiMessageMetadata> {
    const id = safeMessageId(providerMessageId);
    const query = new URLSearchParams({ format: "metadata" });
    for (const header of GMAIL_METADATA_HEADERS) query.append("metadataHeaders", header);
    const body = await this.#request(`/users/me/messages/${encodeURIComponent(id)}`, query, options);
    const parsed = gmailApiMessageMetadataSchema.safeParse(body);
    if (!parsed.success || parsed.data.id !== id) throw this.#invalidResponse("invalid_message_metadata");
    return parsed.data;
  }

  async #request(
    pathname: string,
    query: URLSearchParams,
    options: GmailApiRequestOptions,
  ): Promise<unknown> {
    const url = `${this.#apiEndpoint}${pathname}${query.size === 0 ? "" : `?${query.toString()}`}`;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#requestTimeoutMs);
    const abortFromCaller = (): void => controller.abort();
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (options.signal?.aborted) controller.abort();

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "GET",
        headers: { accept: "application/json", authorization: `Bearer ${this.#accessToken}` },
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) {
        throw new GmailProviderError("Gmail request timed out.", { kind: "timeout", retryable: true });
      }
      if (options.signal?.aborted) {
        throw new GmailProviderError("Gmail request was cancelled.", { kind: "cancelled", retryable: false });
      }
      if (error instanceof TypeError) {
        throw new GmailProviderError("Gmail network request failed.", { kind: "transient", retryable: true });
      }
      throw normalizeGmailProviderError(error);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }

    if (!response.ok) {
      const metadata = await providerErrorMetadata(response);
      const classification = classifyGmailFailure({
        status: response.status,
        reason: metadata.reason,
        retryAfterMs: retryAfterMilliseconds(response),
      });
      throw new GmailProviderError(classification.message, classification);
    }

    try {
      return await response.json();
    } catch {
      throw this.#invalidResponse("invalid_json_response");
    }
  }

  #invalidResponse(providerCode: string): GmailProviderError {
    return new GmailProviderError("Gmail returned an invalid API response.", {
      kind: "transient",
      retryable: true,
      providerCode,
    });
  }
}
