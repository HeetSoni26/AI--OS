import { describe, expect, it } from "vitest";

import {
  createGmailContactMatcher,
  normalizeGmailMessage,
  planGmailMessageIngestion,
} from "./index";

const connectedAccount = { email: "owner@example.com" };

function normalizedMessage(
  id: string,
  from: string,
  to: string,
  cc?: string,
) {
  return normalizeGmailMessage({
    id,
    threadId: `thread-${id}`,
    payload: {
      headers: [
        { name: "From", value: from },
        { name: "To", value: to },
        ...(cc === undefined ? [] : [{ name: "Cc", value: cc }]),
      ],
    },
  }, connectedAccount);
}

describe("deterministic Gmail contact matching", () => {
  it("matches multiple contacts under one client in stable order", () => {
    const matcher = createGmailContactMatcher([
      { clientId: "client-a", contactId: "contact-2", emails: ["two@example.net"] },
      {
        clientId: "client-a",
        contactId: "contact-1",
        emails: ["One+Sales@Example.net", "one.backup@example.net"],
        isPrimary: true,
      },
    ]);
    const matches = matcher.match(normalizedMessage(
      "m-1",
      "one+sales@example.net",
      "owner@example.com",
      "Two@Example.net",
    ));

    expect(matches.ambiguousAcrossClients).toBe(false);
    expect(matches.clients).toEqual([{
      clientId: "client-a",
      matchedEmails: ["one+sales@example.net", "two@example.net"],
      contacts: [
        {
          contactId: "contact-1",
          isPrimary: true,
          matchedEmails: ["one+sales@example.net"],
          participantFields: ["from"],
        },
        {
          contactId: "contact-2",
          isPrimary: false,
          matchedEmails: ["two@example.net"],
          participantFields: ["cc"],
        },
      ],
    }]);
  });

  it("returns every client when an address is shared across multiple clients", () => {
    const matcher = createGmailContactMatcher([
      { clientId: "client-z", contactId: "contact-z", emails: ["shared@example.net"] },
      { clientId: "client-a", contactId: "contact-b", emails: ["other@example.net"] },
      { clientId: "client-a", contactId: "contact-a", emails: ["shared@example.net"] },
    ]);

    const matches = matcher.match(normalizedMessage(
      "m-shared",
      "shared@example.net",
      "owner@example.com",
    ));

    expect(matches.ambiguousAcrossClients).toBe(true);
    expect(matches.clients.map((client) => client.clientId)).toEqual(["client-a", "client-z"]);
    expect(matches.clients[0]?.contacts.map((contact) => contact.contactId)).toEqual(["contact-a"]);
    expect(matches.clients[1]?.contacts.map((contact) => contact.contactId)).toEqual(["contact-z"]);
  });

  it("merges duplicate declarations for the same contact and does not collapse aliases", () => {
    const matcher = createGmailContactMatcher([
      { clientId: "client-a", contactId: "contact-a", emails: ["a.b@example.net"] },
      { clientId: "client-a", contactId: "contact-a", emails: ["ab@example.net"] },
      { clientId: "client-a", contactId: "contact-b", emails: ["person@example.net"] },
    ]);

    expect(matcher.contactCount).toBe(2);
    expect(matcher.indexedEmailCount).toBe(3);
    expect(matcher.match(normalizedMessage("m-dot", "a.b@example.net", "owner@example.com"))
      .clients[0]?.contacts.map((contact) => contact.contactId)).toEqual(["contact-a"]);
    expect(matcher.match(normalizedMessage("m-no-match", "a+b@example.net", "owner@example.com"))
      .clients).toEqual([]);
  });

  it("produces equivalent results regardless of contact input order", () => {
    const contacts = [
      { clientId: "b", contactId: "2", emails: ["two@example.net"] },
      { clientId: "a", contactId: "1", emails: ["one@example.net"] },
    ];
    const message = normalizedMessage(
      "m-order",
      "one@example.net",
      "owner@example.com",
      "two@example.net",
    );

    expect(createGmailContactMatcher(contacts).match(message)).toEqual(
      createGmailContactMatcher([...contacts].reverse()).match(message),
    );
  });
});

describe("Gmail provider message duplicate planning", () => {
  const candidates = [
    { providerMessageId: "m-2", candidateId: "delivery-c", value: { event: 3 } },
    { providerMessageId: "m-1", candidateId: "delivery-b", value: { event: 2 } },
    { providerMessageId: "m-1", candidateId: "delivery-a", value: { event: 1 } },
    { providerMessageId: "m-0", candidateId: "delivery-d", value: { event: 4 } },
  ];

  it("uses persisted IDs and stable candidate IDs to identify duplicates", () => {
    const plan = planGmailMessageIngestion(candidates, new Set(["m-2"]));

    expect(plan.accepted.map((candidate) => candidate.candidateId)).toEqual([
      "delivery-d",
      "delivery-a",
    ]);
    expect(plan.duplicates).toEqual([
      expect.objectContaining({
        candidateId: "delivery-b",
        reason: "duplicate_in_batch",
        canonicalCandidateId: "delivery-a",
      }),
      expect.objectContaining({
        candidateId: "delivery-c",
        reason: "already_ingested",
      }),
    ]);
  });

  it("is deterministic when delivery order changes", () => {
    expect(planGmailMessageIngestion(candidates)).toEqual(
      planGmailMessageIngestion([...candidates].reverse()),
    );
  });
});
