import { describe, expect, it } from "vitest";
import {
  clientDomainEventSchema,
  communicationEventSchema,
  contactEventSchema,
  gmailMessageMatchResultSchema,
  type ClientDto,
  type CommunicationDto,
  type ContactDto,
  type ProjectDto,
} from "@aios/contracts";
import {
  CLIENT_DELETION_RECOVERY_WINDOW_DAYS,
  ClientDeletionImpactRegistry,
  LifecyclePolicyError,
  archiveClient,
  assertClientDeletionCanExecute,
  cancelClientDeletion,
  createClientDeletionPlan,
  createGmailRetryResult,
  createSafeClientEvent,
  createSafeCommunicationEvent,
  createSafeContactEvent,
  createSafeProjectEvent,
  evaluateGmailMessageMatch,
  matchNormalizedGmailMessage,
  recoverClient,
} from "./index";

const ids = {
  client: "11111111-1111-4111-8111-111111111111",
  contact: "22222222-2222-4222-8222-222222222222",
  contactTwo: "33333333-3333-4333-8333-333333333333",
  project: "44444444-4444-4444-8444-444444444444",
  communication: "55555555-5555-4555-8555-555555555555",
  owner: "66666666-6666-4666-8666-666666666666",
  event: "77777777-7777-4777-8777-777777777777",
  plan: "88888888-8888-4888-8888-888888888888",
  connection: "99999999-9999-4999-8999-999999999999",
};
const now = new Date("2026-08-01T00:00:00.000Z");
const eventContext = {
  eventId: ids.event,
  ownerId: ids.owner,
  correlationId: "req_client_1",
  occurredAt: now.toISOString(),
};

function deletionImpact(overrides: { legalHold?: boolean; blockers?: string[] } = {}) {
  return {
    clientId: ids.client,
    items: [{ resourceType: "contacts", count: 2, deletionMode: "cascade" as const }],
    legalHold: overrides.legalHold ?? false,
    blockers: overrides.blockers ?? [],
  };
}

function deletionRequest() {
  return {
    clientId: ids.client,
    confirmation: `DELETE ${ids.client}`,
    impactAcknowledged: true as const,
  };
}

describe("archive, recovery, and delayed deletion policies", () => {
  it("archives an active client and permits ordinary recovery", () => {
    const archived = archiveClient({ archivedAt: null, deletedAt: null }, now);
    expect(archived.archivedAt).toBe(now.toISOString());
    expect(recoverClient({ ...archived, deletionPlan: null }, new Date("2026-08-02T00:00:00Z"))).toEqual({
      archivedAt: null,
      deletedAt: null,
      deletionPlan: null,
    });
    expect(() => archiveClient(archived, now)).toThrow(/already archived/);
  });

  it("creates a confirmed deletion plan with exactly seven days of undo", () => {
    const plan = createClientDeletionPlan({
      id: ids.plan,
      clientId: ids.client,
      currentState: { archivedAt: now.toISOString(), deletedAt: null },
      request: deletionRequest(),
      impact: deletionImpact(),
      requestedAt: now,
    });
    expect(CLIENT_DELETION_RECOVERY_WINDOW_DAYS).toBe(7);
    expect(plan.notBefore).toBe("2026-08-08T00:00:00.000Z");
    expect(() => assertClientDeletionCanExecute(plan, new Date("2026-08-07T23:59:59.999Z"))).toThrow(/has not expired/);
    expect(() => assertClientDeletionCanExecute(plan, new Date("2026-08-08T00:00:00.000Z"))).not.toThrow();
  });

  it("cancels or recovers a pending plan only inside the undo window", () => {
    const plan = createClientDeletionPlan({
      id: ids.plan,
      clientId: ids.client,
      currentState: { archivedAt: now.toISOString(), deletedAt: null },
      request: deletionRequest(),
      impact: deletionImpact(),
      requestedAt: now,
    });
    expect(cancelClientDeletion(plan, new Date("2026-08-07T00:00:00.000Z"))).toMatchObject({ status: "cancelled", version: 2 });
    expect(recoverClient({ archivedAt: now.toISOString(), deletedAt: null, deletionPlan: plan }, new Date("2026-08-07T00:00:00.000Z"))).toMatchObject({
      archivedAt: null,
      deletionPlan: { status: "recovered" },
    });
    expect(() => recoverClient({ archivedAt: now.toISOString(), deletedAt: null, deletionPlan: plan }, new Date("2026-08-08T00:00:00.000Z"))).toThrow(LifecyclePolicyError);
  });

  it("blocks scheduling when IDs mismatch, the client is active, or impact has a hold", () => {
    const base = {
      id: ids.plan,
      clientId: ids.client,
      currentState: { archivedAt: now.toISOString(), deletedAt: null },
      request: deletionRequest(),
      impact: deletionImpact(),
      requestedAt: now,
    };
    expect(() => createClientDeletionPlan({ ...base, currentState: { archivedAt: null, deletedAt: null } })).toThrow(/must be archived/);
    expect(() => createClientDeletionPlan({ ...base, impact: deletionImpact({ legalHold: true }) })).toThrow(/blocked/);
    expect(() => createClientDeletionPlan({ ...base, impact: deletionImpact({ blockers: ["Open dispute"] }) })).toThrow(/blocked/);
  });

  it("aggregates extensible deletion impacts from later-domain contributors", async () => {
    const registry = new ClientDeletionImpactRegistry();
    const unregisterContacts = registry.register({
      key: "contacts",
      assess: () => ({ items: [{ resourceType: "contacts", count: 2, deletionMode: "cascade" }] }),
    });
    registry.register({
      key: "billing",
      assess: () => ({ items: [{ resourceType: "invoices", count: 1, deletionMode: "retain" }], blockers: ["Invoice retention policy"] }),
    });
    expect(registry.contributorKeys).toEqual(["billing", "contacts"]);
    await expect(registry.assess(ids.client)).resolves.toMatchObject({
      clientId: ids.client,
      items: [{ resourceType: "contacts", count: 2 }, { resourceType: "invoices", count: 1 }],
      blockers: ["Invoice retention policy"],
    });
    expect(() => registry.register({ key: "contacts", assess: () => ({}) })).toThrow(/already registered/);
    unregisterContacts();
    expect(registry.contributorKeys).toEqual(["billing"]);
  });
});

describe("Gmail normalized-message matching contracts", () => {
  const message = {
    schemaVersion: 1 as const,
    provider: "gmail" as const,
    connectionId: ids.connection,
    providerMessageId: "gmail-message-1",
    providerThreadId: "thread-1",
    occurredAt: "2026-08-01T10:00:00.000Z",
    from: "Owner@Agency.example",
    to: ["Person.One+Sales@Example.COM"],
    cc: ["second@example.com"],
    bcc: [],
  };
  const contacts = [
    { clientId: ids.client, contactId: ids.contact, email: "person.one+sales@example.com" },
    { clientId: ids.client, contactId: ids.contactTwo, email: "SECOND@EXAMPLE.COM" },
  ];

  it("matches normalized senders and recipients to multiple contacts without exposing addresses", () => {
    const matches = matchNormalizedGmailMessage(message, contacts);
    expect(matches).toEqual([
      { clientId: ids.client, contactId: ids.contact },
      { clientId: ids.client, contactId: ids.contactTwo },
    ]);
    const result = evaluateGmailMessageMatch({ message, contacts });
    expect(result.status).toBe("matched");
    expect(JSON.stringify(result)).not.toContain("example.com");
  });

  it("does not conflate plus aliases or dotted local parts", () => {
    expect(matchNormalizedGmailMessage(message, [{ clientId: ids.client, contactId: ids.contact, email: "personone@example.com" }])).toEqual([]);
    expect(matchNormalizedGmailMessage(message, [{ clientId: ids.client, contactId: ids.contact, email: "person.one@example.com" }])).toEqual([]);
  });

  it("handles no-match, duplicate, malformed, revoked, rate-limit, and retry outcomes", () => {
    expect(evaluateGmailMessageMatch({ message, contacts: [] }).status).toBe("no_match");
    expect(evaluateGmailMessageMatch({ message, contacts, duplicateProviderMessageIds: new Set(["gmail-message-1"]) }).status).toBe("duplicate");
    expect(evaluateGmailMessageMatch({ message: { providerMessageId: "bad" }, contacts }).status).toBe("malformed");
    expect(evaluateGmailMessageMatch({ message, contacts, connectionStatus: "revoked" }).status).toBe("revoked");
    expect(createGmailRetryResult("rate_limited", new Date("2026-08-01T10:05:00Z"), "gmail-message-1")).toMatchObject({ status: "rate_limited", retryable: true });
    expect(createGmailRetryResult("retry", new Date("2026-08-01T10:01:00Z"))).toMatchObject({ status: "retry", providerMessageId: null });
    expect(gmailMessageMatchResultSchema.safeParse({ status: "retry", retryable: false, matches: [] }).success).toBe(false);
  });

  it("ignores archived/deleted contacts and malformed stored emails", () => {
    expect(matchNormalizedGmailMessage(message, [
      { ...contacts[0]!, archivedAt: now.toISOString() },
      { ...contacts[1]!, deletedAt: now.toISOString() },
      { clientId: ids.client, contactId: ids.contact, email: "not-an-email" },
    ])).toEqual([]);
  });
});

describe("safe versioned graph/realtime events", () => {
  const client: ClientDto = {
    id: ids.client,
    name: "Acme",
    industry: "Automation",
    status: "active",
    website: "https://acme.example",
    logoFileId: null,
    mrr: 2500,
    totalRevenue: 10_000,
    startDate: "2026-01-01",
    primaryContactId: ids.contact,
    primaryContactName: "Private Person",
    projectCount: 1,
    contactCount: 2,
    archivedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    contactName: "Private Person",
    contactEmail: "private@example.com",
    contactPhone: "+15555550100",
    notes: "Sensitive notes",
    deletedAt: null,
  };
  const contact: ContactDto = {
    id: ids.contact,
    clientId: ids.client,
    name: "Private Person",
    role: "CEO",
    email: "private@example.com",
    phone: "+15555550100",
    notes: "Sensitive contact notes",
    isPrimary: true,
    lastContactAt: now.toISOString(),
    archivedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const project: ProjectDto = {
    id: ids.project,
    clientId: ids.client,
    name: "Chatbot Build",
    type: "chatbot",
    status: "planning",
    description: "Private scope",
    startDate: "2026-08-01",
    dueDate: null,
    price: 5000,
    hoursSpent: 0,
    taskCount: 0,
    deliverableCount: 0,
    archivedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const communication: CommunicationDto = {
    id: ids.communication,
    clientId: ids.client,
    contactId: ids.contact,
    type: "email",
    direction: "inbound",
    occurredAt: now.toISOString(),
    summary: "Sensitive summary",
    body: "Sensitive body",
    nextAction: "Sensitive next action",
    source: "gmail",
    providerMessageId: "message-1",
    archivedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  it("builds version 1 client/contact/project/communication events with only allowlisted fields", () => {
    const events = [
      createSafeClientEvent("client.created", client, eventContext),
      createSafeContactEvent("contact.created", contact, eventContext),
      createSafeProjectEvent("project.created", project, eventContext),
      createSafeCommunicationEvent("communication.created", communication, eventContext),
    ];
    for (const event of events) {
      expect(clientDomainEventSchema.safeParse(event).success).toBe(true);
      expect(event.schemaVersion).toBe(1);
    }
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("Sensitive");
    expect(serialized).not.toContain("Private Person");
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("+15555550100");
    expect(serialized).not.toContain("message-1");
  });

  it("strictly rejects PII and message content added to safe payloads", () => {
    const safeContact = createSafeContactEvent("contact.updated", contact, eventContext);
    expect(contactEventSchema.safeParse({ ...safeContact, payload: { ...safeContact.payload, email: "private@example.com" } }).success).toBe(false);
    const safeCommunication = createSafeCommunicationEvent("communication.updated", communication, eventContext);
    expect(communicationEventSchema.safeParse({ ...safeCommunication, payload: { ...safeCommunication.payload, body: "private" } }).success).toBe(false);
  });

  it("covers archive, recovery, schedule, cancellation, and deletion event names", () => {
    const clientEvents = ["client.archived", "client.recovered", "client.deletion_scheduled", "client.deletion_cancelled", "client.deleted"] as const;
    for (const eventType of clientEvents) {
      expect(createSafeClientEvent(eventType, client, eventContext).eventType).toBe(eventType);
    }
  });
});
