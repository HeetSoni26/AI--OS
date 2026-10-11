import type { GraphRealtimeEvent } from "@aios/contracts";

import type { EventPublishContext } from "../outbox/contracts";
import type {
  OwnerScopedRealtimeBroadcast,
  RealtimeBroadcastSink,
} from "./contracts";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_DEDUPLICATION_CAPACITY = 10_000;
const AUTH_SUBJECT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface SupabaseRealtimeBroadcastConfiguration {
  readonly url: string;
  /** This credential is server-only and is never included in errors or log records. */
  readonly serviceRoleKey: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly deduplicationCapacity?: number;
}

function configuredUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("Supabase Realtime URL must use HTTPS outside localhost.");
  }
  return new URL("realtime/v1/api/broadcast", `${parsed.href.replace(/\/$/u, "")}/`).href;
}

function boundedInteger(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

/**
 * Topics include the authenticated Supabase subject as an authorization boundary.
 * Clients must subscribe with a private channel and matching Realtime RLS policy.
 */
export function privateRealtimeTopic(
  ownerAuthSubject: string,
  channel: GraphRealtimeEvent["channel"],
): string {
  const subject = ownerAuthSubject.trim();
  if (!AUTH_SUBJECT_PATTERN.test(subject)) {
    throw new Error("A valid owner authentication subject is required for private Realtime broadcast.");
  }
  return `owner:${subject}:${channel}`;
}

function abortReason(controller: AbortController, timedOut: () => boolean, upstreamAborted: () => boolean): Error {
  if (timedOut()) return new Error("Supabase Realtime broadcast timed out.");
  if (upstreamAborted()) return new Error("Supabase Realtime broadcast was aborted.");
  return new Error("Supabase Realtime broadcast request failed.");
}

/** REST Broadcast adapter using the contract bundled with the installed Supabase client. */
export class SupabaseRealtimeBroadcastSink implements RealtimeBroadcastSink {
  private readonly endpoint: string;
  private readonly serviceRoleKey: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;
  private readonly deduplicationCapacity: number;
  private readonly delivered = new Set<string>();

  constructor(configuration: SupabaseRealtimeBroadcastConfiguration) {
    this.endpoint = configuredUrl(configuration.url);
    this.serviceRoleKey = configuration.serviceRoleKey.trim();
    if (!this.serviceRoleKey) throw new Error("Supabase Realtime service-role key is required.");
    this.fetchImplementation = configuration.fetch ?? globalThis.fetch;
    this.timeoutMs = boundedInteger(
      configuration.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      "Supabase Realtime timeout",
      100,
      MAX_TIMEOUT_MS,
    );
    this.deduplicationCapacity = boundedInteger(
      configuration.deduplicationCapacity ?? DEFAULT_DEDUPLICATION_CAPACITY,
      "Supabase Realtime deduplication capacity",
      1,
      100_000,
    );
  }

  async broadcast(
    message: OwnerScopedRealtimeBroadcast,
    context: EventPublishContext,
  ): Promise<void> {
    const deduplicationKey = `${context.idempotencyKey}:${message.event.eventId}`;
    if (this.delivered.has(deduplicationKey)) return;
    if (context.signal?.aborted) throw new Error("Supabase Realtime broadcast was aborted.");

    const controller = new AbortController();
    let timedOut = false;
    let upstreamAborted = false;
    const abortFromUpstream = () => {
      upstreamAborted = true;
      controller.abort();
    };
    context.signal?.addEventListener("abort", abortFromUpstream, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchImplementation(this.endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          apikey: this.serviceRoleKey,
          authorization: `Bearer ${this.serviceRoleKey}`,
          "content-type": "application/json",
          "idempotency-key": context.idempotencyKey,
          "x-correlation-id": context.correlationId,
        },
        body: JSON.stringify({
          messages: [{
            topic: privateRealtimeTopic(message.ownerAuthSubject, message.event.channel),
            event: message.event.event,
            payload: message.event,
            private: true,
          }],
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Supabase Realtime broadcast failed with HTTP ${response.status}.`);
      }
      this.remember(deduplicationKey);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Supabase Realtime broadcast failed with HTTP ")) {
        throw error;
      }
      throw abortReason(controller, () => timedOut, () => upstreamAborted);
    } finally {
      clearTimeout(timeout);
      context.signal?.removeEventListener("abort", abortFromUpstream);
    }
  }

  private remember(key: string): void {
    if (this.delivered.size >= this.deduplicationCapacity) {
      const oldest = this.delivered.values().next().value as string | undefined;
      if (oldest !== undefined) this.delivered.delete(oldest);
    }
    this.delivered.add(key);
  }
}
