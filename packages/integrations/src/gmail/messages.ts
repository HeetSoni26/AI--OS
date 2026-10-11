import { z } from "zod";

import {
  normalizeEmailAddress,
  parseEmailAddressHeader,
  type NormalizedEmailAddress,
} from "./addresses";
import { GmailProviderError } from "./errors";

export const gmailApiHeaderSchema = z.object({
  name: z.string(),
  value: z.string(),
});

/** Only Gmail message metadata used by this package is accepted; body data is omitted. */
export const gmailApiMessageMetadataSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  labelIds: z.array(z.string()).optional(),
  historyId: z.string().regex(/^\d+$/u).optional(),
  internalDate: z.string().regex(/^\d+$/u).optional(),
  payload: z.object({
    mimeType: z.string().optional(),
    headers: z.array(gmailApiHeaderSchema).optional(),
  }).optional(),
});

export type GmailApiMessageMetadata = z.infer<typeof gmailApiMessageMetadataSchema>;

export const gmailMessageDirections = ["incoming", "outgoing", "internal", "unknown"] as const;
export type GmailMessageDirection = (typeof gmailMessageDirections)[number];

export interface GmailConnectedAccount {
  readonly email: string;
  readonly aliases?: readonly string[];
}

export interface GmailMessageParticipants {
  readonly from: readonly NormalizedEmailAddress[];
  readonly sender: readonly NormalizedEmailAddress[];
  readonly replyTo: readonly NormalizedEmailAddress[];
  readonly to: readonly NormalizedEmailAddress[];
  readonly cc: readonly NormalizedEmailAddress[];
  readonly bcc: readonly NormalizedEmailAddress[];
}

export interface NormalizedGmailMessage {
  readonly provider: "gmail";
  readonly providerMessageId: string;
  readonly providerThreadId: string;
  readonly historyId?: string;
  readonly internalDate?: string;
  readonly rfcMessageId?: string;
  readonly subject?: string;
  readonly mimeType?: string;
  readonly labelIds: readonly string[];
  readonly participants: GmailMessageParticipants;
  readonly direction: GmailMessageDirection;
  readonly malformedHeaders: readonly string[];
}

const ADDRESS_HEADER_NAMES = ["from", "sender", "reply-to", "to", "cc", "bcc"] as const;
type AddressHeaderName = (typeof ADDRESS_HEADER_NAMES)[number];

function normalizeHeaderName(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeHeaderText(value: string): string | undefined {
  const normalized = value.replace(/\r?\n[\t ]+/gu, " ").replace(/[\r\n]/gu, " ").trim();
  return normalized.length === 0 ? undefined : normalized;
}

function getHeaderValues(
  headers: readonly z.infer<typeof gmailApiHeaderSchema>[],
  name: string,
): string[] {
  return headers
    .filter((header) => normalizeHeaderName(header.name) === name)
    .map((header) => header.value);
}

function parseAddressHeaders(
  headers: readonly z.infer<typeof gmailApiHeaderSchema>[],
  name: AddressHeaderName,
): { addresses: NormalizedEmailAddress[]; malformed: boolean } {
  const addresses: NormalizedEmailAddress[] = [];
  let malformed = false;
  for (const value of getHeaderValues(headers, name)) {
    const parsed = parseEmailAddressHeader(value);
    addresses.push(...parsed.addresses);
    malformed ||= parsed.malformed;
  }
  return { addresses, malformed };
}

function normalizedAccountAddresses(account: GmailConnectedAccount): Set<string> {
  const result = new Set<string>();
  for (const rawAddress of [account.email, ...(account.aliases ?? [])]) {
    const normalized = normalizeEmailAddress(rawAddress);
    if (normalized === null) {
      throw new GmailProviderError("Connected Gmail account contains an invalid address.", {
        kind: "validation",
        retryable: false,
        providerCode: "invalid_connected_account_address",
      });
    }
    result.add(normalized);
  }
  return result;
}

function uniqueParticipantAddresses(
  groups: readonly (readonly NormalizedEmailAddress[])[],
): Set<string> {
  return new Set(groups.flatMap((group) => group.map((address) => address.normalized)));
}

export function inferGmailMessageDirection(
  participants: GmailMessageParticipants,
  account: GmailConnectedAccount,
): GmailMessageDirection {
  const accountAddresses = normalizedAccountAddresses(account);
  const senderAddresses = uniqueParticipantAddresses([
    participants.sender.length > 0 ? participants.sender : participants.from,
  ]);
  const recipientAddresses = uniqueParticipantAddresses([
    participants.to,
    participants.cc,
    participants.bcc,
  ]);
  const allAddresses = new Set([...senderAddresses, ...recipientAddresses]);
  if (allAddresses.size === 0) return "unknown";

  const ownSender = [...senderAddresses].some((address) => accountAddresses.has(address));
  const externalSender = [...senderAddresses].some((address) => !accountAddresses.has(address));
  const ownRecipient = [...recipientAddresses].some((address) => accountAddresses.has(address));
  const externalRecipient = [...recipientAddresses].some((address) => !accountAddresses.has(address));

  const isOutgoing = ownSender && externalRecipient;
  const isIncoming = externalSender && ownRecipient;
  if (isOutgoing && !isIncoming) return "outgoing";
  if (isIncoming && !isOutgoing) return "incoming";
  if (
    senderAddresses.size > 0 &&
    recipientAddresses.size > 0 &&
    [...allAddresses].every((address) => accountAddresses.has(address))
  ) {
    return "internal";
  }
  return "unknown";
}

export function normalizeGmailMessage(
  input: unknown,
  account: GmailConnectedAccount,
): NormalizedGmailMessage {
  const parsed = gmailApiMessageMetadataSchema.safeParse(input);
  if (!parsed.success) {
    throw new GmailProviderError("Gmail message metadata is invalid.", {
      kind: "validation",
      retryable: false,
      providerCode: "invalid_message_metadata",
    });
  }

  const headers = parsed.data.payload?.headers ?? [];
  const malformedHeaders: string[] = [];
  const parsedAddresses = Object.fromEntries(
    ADDRESS_HEADER_NAMES.map((name) => {
      const result = parseAddressHeaders(headers, name);
      if (result.malformed) malformedHeaders.push(name);
      return [name, result.addresses];
    }),
  ) as Record<AddressHeaderName, NormalizedEmailAddress[]>;
  const participants: GmailMessageParticipants = {
    from: parsedAddresses.from,
    sender: parsedAddresses.sender,
    replyTo: parsedAddresses["reply-to"],
    to: parsedAddresses.to,
    cc: parsedAddresses.cc,
    bcc: parsedAddresses.bcc,
  };

  const internalDateMilliseconds = parsed.data.internalDate === undefined
    ? undefined
    : Number(parsed.data.internalDate);
  const internalDateValue = internalDateMilliseconds !== undefined && Number.isSafeInteger(internalDateMilliseconds)
    ? new Date(internalDateMilliseconds)
    : undefined;
  const internalDate = internalDateValue !== undefined && !Number.isNaN(internalDateValue.getTime())
    ? internalDateValue.toISOString()
    : undefined;
  if (parsed.data.internalDate !== undefined && internalDate === undefined) {
    malformedHeaders.push("internal-date");
  }

  const rawRfcMessageId = getHeaderValues(headers, "message-id")[0];
  const rfcMessageId = rawRfcMessageId === undefined ? undefined : normalizeHeaderText(rawRfcMessageId);
  const rawSubject = getHeaderValues(headers, "subject")[0];
  const subject = rawSubject === undefined ? undefined : normalizeHeaderText(rawSubject);

  return {
    provider: "gmail",
    providerMessageId: parsed.data.id,
    providerThreadId: parsed.data.threadId,
    ...(parsed.data.historyId === undefined ? {} : { historyId: parsed.data.historyId }),
    ...(internalDate === undefined ? {} : { internalDate }),
    ...(rfcMessageId === undefined ? {} : { rfcMessageId }),
    ...(subject === undefined ? {} : { subject }),
    ...(parsed.data.payload?.mimeType === undefined ? {} : { mimeType: parsed.data.payload.mimeType }),
    labelIds: [...new Set(parsed.data.labelIds ?? [])].sort(),
    participants,
    direction: inferGmailMessageDirection(participants, account),
    malformedHeaders: [...new Set(malformedHeaders)].sort(),
  };
}
