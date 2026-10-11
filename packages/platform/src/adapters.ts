import { z } from "zod";

export type ProviderErrorKind = "authentication" | "authorization" | "validation" | "rate_limit" | "timeout" | "unavailable" | "conflict" | "unknown";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly kind: ProviderErrorKind,
    readonly retryable: boolean,
    readonly safeDetails?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export const vaultReferenceSchema = z.object({
  provider: z.string().min(1),
  vaultKey: z.string().regex(/^[a-zA-Z0-9/_-]+$/),
  version: z.number().int().positive().optional(),
});
export type VaultReference = z.infer<typeof vaultReferenceSchema>;

export interface IntegrationHealth {
  status: "connected" | "degraded" | "disconnected" | "not_configured";
  checkedAt: string;
  latencyMs?: number;
  message?: string;
}

export interface IntegrationAdapter<TRequest, TResponse> {
  readonly provider: AdapterProvider;
  testConnection(signal?: AbortSignal): Promise<IntegrationHealth>;
  execute(request: TRequest, context: { correlationId: string; credential: VaultReference | null; idempotencyKey?: string; signal?: AbortSignal }): Promise<TResponse>;
}

export const adapterProviders = [
  "openai", "anthropic", "n8n", "make", "stripe", "gmail", "google", "slack", "linkedin", "x", "wordpress", "mailchimp", "sendgrid", "resend", "smtp", "twilio", "instagram", "calendly", "cal_com", "notion", "github", "apollo", "crunchbase", "google_maps", "storage", "malware_scan", "other",
] as const;
export type AdapterProvider = (typeof adapterProviders)[number];
export const adapterProviderSchema = z.enum(adapterProviders);

export interface VaultAdapter {
  put(reference: VaultReference, value: string): Promise<void>;
  read(reference: VaultReference): Promise<string>;
  remove(reference: VaultReference): Promise<void>;
}

export function normalizeProviderError(provider: string, error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  return new ProviderError("Provider request failed.", provider, "unknown", false);
}
