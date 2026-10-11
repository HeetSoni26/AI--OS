import {
  gmailMessageMatchResultSchema,
  gmailNormalizedMessageSchema,
  normalizedEmailSchema,
  type GmailContactMatch,
  type GmailMessageMatchResult,
  type GmailNormalizedMessage,
} from "@aios/contracts";
import { normalizeEmailAddresses } from "./policies";

export interface ContactEmailReference {
  clientId: string;
  contactId: string;
  email: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
}

export interface GmailMatchEvaluation {
  message: unknown;
  contacts: readonly ContactEmailReference[];
  duplicateProviderMessageIds?: ReadonlySet<string>;
  connectionStatus?: "connected" | "degraded" | "revoked" | "disabled";
}

function providerMessageIdFromUnknown(message: unknown): string | null {
  if (!message || typeof message !== "object" || !("providerMessageId" in message)) return null;
  const value = (message as { providerMessageId?: unknown }).providerMessageId;
  return typeof value === "string" && value.length <= 255 ? value : null;
}

export function messageParticipantEmails(message: GmailNormalizedMessage): readonly string[] {
  return normalizeEmailAddresses([message.from, ...message.to, ...message.cc, ...message.bcc]);
}

export function matchNormalizedGmailMessage(
  message: GmailNormalizedMessage,
  contacts: readonly ContactEmailReference[],
): GmailContactMatch[] {
  const parsed = gmailNormalizedMessageSchema.parse(message);
  const participants = new Set(messageParticipantEmails(parsed));
  const matchKeys = new Set<string>();
  const matches: GmailContactMatch[] = [];

  for (const contact of contacts) {
    if (!contact.email || contact.archivedAt || contact.deletedAt) continue;
    const parsedEmail = normalizedEmailSchema.safeParse(contact.email);
    if (!parsedEmail.success || !participants.has(parsedEmail.data)) continue;
    const key = `${contact.clientId}:${contact.contactId}`;
    if (matchKeys.has(key)) continue;
    matchKeys.add(key);
    matches.push({ clientId: contact.clientId, contactId: contact.contactId });
  }

  return matches.sort((left, right) =>
    left.clientId === right.clientId
      ? left.contactId.localeCompare(right.contactId)
      : left.clientId.localeCompare(right.clientId),
  );
}

/** Evaluates matching without retaining or returning message content or participant addresses. */
export function evaluateGmailMessageMatch(input: GmailMatchEvaluation): GmailMessageMatchResult {
  const providerMessageId = providerMessageIdFromUnknown(input.message);
  if (input.connectionStatus === "revoked" || input.connectionStatus === "disabled") {
    return gmailMessageMatchResultSchema.parse({
      status: "revoked",
      providerMessageId,
      matches: [],
      retryable: false,
    });
  }

  const parsed = gmailNormalizedMessageSchema.safeParse(input.message);
  if (!parsed.success) {
    return gmailMessageMatchResultSchema.parse({
      status: "malformed",
      providerMessageId,
      matches: [],
      retryable: false,
    });
  }
  if (input.duplicateProviderMessageIds?.has(parsed.data.providerMessageId)) {
    return gmailMessageMatchResultSchema.parse({
      status: "duplicate",
      providerMessageId: parsed.data.providerMessageId,
      matches: [],
      retryable: false,
    });
  }

  const matches = matchNormalizedGmailMessage(parsed.data, input.contacts);
  return matches.length > 0
    ? gmailMessageMatchResultSchema.parse({
        status: "matched",
        providerMessageId: parsed.data.providerMessageId,
        matches,
        retryable: false,
      })
    : gmailMessageMatchResultSchema.parse({
        status: "no_match",
        providerMessageId: parsed.data.providerMessageId,
        matches: [],
        retryable: false,
      });
}

export function createGmailRetryResult(
  status: "rate_limited" | "retry",
  retryAt: Date,
  providerMessageId: string | null = null,
): GmailMessageMatchResult {
  return gmailMessageMatchResultSchema.parse({
    status,
    providerMessageId,
    matches: [],
    retryable: true,
    retryAt: retryAt.toISOString(),
  });
}
