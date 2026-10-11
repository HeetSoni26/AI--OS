import { z } from "zod";

import { normalizeEmailAddress } from "./addresses";
import { GmailProviderError } from "./errors";
import type { NormalizedGmailMessage } from "./messages";

export const gmailContactIdentitySchema = z.object({
  clientId: z.string().min(1),
  contactId: z.string().min(1),
  emails: z.array(z.string().min(1)).min(1),
  isPrimary: z.boolean().optional(),
});

export type GmailContactIdentity = z.infer<typeof gmailContactIdentitySchema>;

export type GmailParticipantField = "from" | "sender" | "replyTo" | "to" | "cc" | "bcc";

export interface GmailContactMatch {
  readonly contactId: string;
  readonly isPrimary: boolean;
  readonly matchedEmails: readonly string[];
  readonly participantFields: readonly GmailParticipantField[];
}

export interface GmailClientContactGroup {
  readonly clientId: string;
  readonly contacts: readonly GmailContactMatch[];
  readonly matchedEmails: readonly string[];
}

export interface GmailMessageContactMatches {
  readonly providerMessageId: string;
  /** All matches are retained; callers must not silently choose one client. */
  readonly clients: readonly GmailClientContactGroup[];
  readonly ambiguousAcrossClients: boolean;
}

export interface GmailContactMatcher {
  readonly contactCount: number;
  readonly indexedEmailCount: number;
  match(message: NormalizedGmailMessage): GmailMessageContactMatches;
}

interface IndexedContact {
  readonly clientId: string;
  readonly contactId: string;
  readonly isPrimary: boolean;
  readonly emails: readonly string[];
}

interface MutableContactMatch {
  readonly contact: IndexedContact;
  readonly emails: Set<string>;
  readonly fields: Set<GmailParticipantField>;
}

const PARTICIPANT_FIELDS = ["from", "sender", "replyTo", "to", "cc", "bcc"] as const;

function invalidContact(providerCode: string): GmailProviderError {
  return new GmailProviderError("Gmail contact matching input is invalid.", {
    kind: "validation",
    retryable: false,
    providerCode,
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeContacts(input: readonly GmailContactIdentity[]): IndexedContact[] {
  const contacts = new Map<string, { clientId: string; contactId: string; isPrimary: boolean; emails: Set<string> }>();

  for (const rawContact of input) {
    const parsed = gmailContactIdentitySchema.safeParse(rawContact);
    if (!parsed.success) throw invalidContact("invalid_contact_identity");
    const key = `${parsed.data.clientId}\u0000${parsed.data.contactId}`;
    const existing = contacts.get(key);
    if (existing !== undefined && existing.isPrimary !== Boolean(parsed.data.isPrimary)) {
      throw invalidContact("conflicting_duplicate_contact");
    }
    const contact = existing ?? {
      clientId: parsed.data.clientId,
      contactId: parsed.data.contactId,
      isPrimary: Boolean(parsed.data.isPrimary),
      emails: new Set<string>(),
    };
    for (const rawEmail of parsed.data.emails) {
      const normalized = normalizeEmailAddress(rawEmail);
      if (normalized === null) throw invalidContact("invalid_contact_email");
      contact.emails.add(normalized);
    }
    contacts.set(key, contact);
  }

  return [...contacts.values()]
    .map((contact) => ({ ...contact, emails: [...contact.emails].sort(compareText) }))
    .sort((left, right) =>
      compareText(left.clientId, right.clientId) || compareText(left.contactId, right.contactId),
    );
}

/**
 * Builds an immutable, deterministic index. Shared addresses intentionally map
 * to every contact and every client that owns them; no information is lost.
 */
export function createGmailContactMatcher(
  input: readonly GmailContactIdentity[],
): GmailContactMatcher {
  const contacts = normalizeContacts(input);
  const byEmail = new Map<string, IndexedContact[]>();
  for (const contact of contacts) {
    for (const email of contact.emails) {
      const matches = byEmail.get(email) ?? [];
      matches.push(contact);
      byEmail.set(email, matches);
    }
  }

  return Object.freeze({
    contactCount: contacts.length,
    indexedEmailCount: byEmail.size,
    match(message: NormalizedGmailMessage): GmailMessageContactMatches {
      const contactMatches = new Map<string, MutableContactMatch>();
      for (const field of PARTICIPANT_FIELDS) {
        for (const participant of message.participants[field]) {
          for (const contact of byEmail.get(participant.normalized) ?? []) {
            const key = `${contact.clientId}\u0000${contact.contactId}`;
            const match = contactMatches.get(key) ?? {
              contact,
              emails: new Set<string>(),
              fields: new Set<GmailParticipantField>(),
            };
            match.emails.add(participant.normalized);
            match.fields.add(field);
            contactMatches.set(key, match);
          }
        }
      }

      const grouped = new Map<string, MutableContactMatch[]>();
      for (const match of contactMatches.values()) {
        const clientMatches = grouped.get(match.contact.clientId) ?? [];
        clientMatches.push(match);
        grouped.set(match.contact.clientId, clientMatches);
      }

      const clients = [...grouped.entries()]
        .sort(([left], [right]) => compareText(left, right))
        .map(([clientId, matches]): GmailClientContactGroup => {
          const contactsForClient = matches
            .sort((left, right) => compareText(left.contact.contactId, right.contact.contactId))
            .map((match): GmailContactMatch => ({
              contactId: match.contact.contactId,
              isPrimary: match.contact.isPrimary,
              matchedEmails: [...match.emails].sort(compareText),
              participantFields: PARTICIPANT_FIELDS.filter((field) => match.fields.has(field)),
            }));
          return {
            clientId,
            contacts: contactsForClient,
            matchedEmails: [...new Set(contactsForClient.flatMap((contact) => contact.matchedEmails))]
              .sort(compareText),
          };
        });

      return {
        providerMessageId: message.providerMessageId,
        clients,
        ambiguousAcrossClients: clients.length > 1,
      };
    },
  });
}

export interface GmailMessageIngestionCandidate<T> {
  readonly providerMessageId: string;
  /** Stable, unique ID for this delivery/record; it must not contain message content. */
  readonly candidateId: string;
  readonly value: T;
}

export type GmailMessageDuplicateReason = "already_ingested" | "duplicate_in_batch";

export interface GmailMessageDuplicate<T> extends GmailMessageIngestionCandidate<T> {
  readonly reason: GmailMessageDuplicateReason;
  readonly canonicalCandidateId?: string;
}

export interface GmailMessageIngestionPlan<T> {
  readonly accepted: readonly GmailMessageIngestionCandidate<T>[];
  readonly duplicates: readonly GmailMessageDuplicate<T>[];
}

/**
 * Deterministically selects one candidate per Gmail provider message ID.
 * Persisted IDs supersede every candidate; otherwise the lowest candidate ID
 * wins. A database unique key on provider + providerMessageId remains required.
 */
export function planGmailMessageIngestion<T>(
  candidates: readonly GmailMessageIngestionCandidate<T>[],
  alreadyIngestedProviderMessageIds: ReadonlySet<string> = new Set(),
): GmailMessageIngestionPlan<T> {
  const sorted = [...candidates].sort((left, right) =>
    compareText(left.providerMessageId, right.providerMessageId) ||
    compareText(left.candidateId, right.candidateId),
  );
  const seenCandidateIds = new Set<string>();
  for (const candidate of sorted) {
    if (candidate.providerMessageId.length === 0 || candidate.candidateId.length === 0) {
      throw invalidContact("invalid_ingestion_candidate");
    }
    if (seenCandidateIds.has(candidate.candidateId)) {
      throw invalidContact("duplicate_candidate_id");
    }
    seenCandidateIds.add(candidate.candidateId);
  }

  const accepted: GmailMessageIngestionCandidate<T>[] = [];
  const duplicates: GmailMessageDuplicate<T>[] = [];
  for (let index = 0; index < sorted.length;) {
    const groupStart = index;
    const providerMessageId = sorted[index]!.providerMessageId;
    while (index < sorted.length && sorted[index]!.providerMessageId === providerMessageId) index += 1;
    const group = sorted.slice(groupStart, index);
    if (alreadyIngestedProviderMessageIds.has(providerMessageId)) {
      duplicates.push(...group.map((candidate) => ({ ...candidate, reason: "already_ingested" as const })));
      continue;
    }
    const [canonical, ...batchDuplicates] = group;
    accepted.push(canonical!);
    duplicates.push(...batchDuplicates.map((candidate) => ({
      ...candidate,
      reason: "duplicate_in_batch" as const,
      canonicalCandidateId: canonical!.candidateId,
    })));
  }

  return { accepted, duplicates };
}
