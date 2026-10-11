import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_TYPE_LABELS,
  CLIENT_STATUS_LABELS,
  COMMUNICATION_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  assignmentCreateSchema,
  clientCreateSchema,
  clientCursorPayloadSchema,
  clientDeletionRequestSchema,
  clientInvoicesRelationSchema,
  clientListQuerySchema,
  clientStatuses,
  clientUpdateSchema,
  communicationCreateSchema,
  contactCreateSchema,
  deliverableReorderSchema,
  gmailNormalizedMessageSchema,
  invoiceRelationDtoSchema,
  projectCreateSchema,
  projectStatuses,
  projectTypes,
  taskCreateSchema,
  timeEntryCreateSchema,
  websiteSchema,
} from "@aios/contracts";

const ids = {
  client: "11111111-1111-4111-8111-111111111111",
  contact: "22222222-2222-4222-8222-222222222222",
  project: "33333333-3333-4333-8333-333333333333",
  task: "44444444-4444-4444-8444-444444444444",
  agent: "55555555-5555-4555-8555-555555555555",
  run: "66666666-6666-4666-8666-666666666666",
};

const timestamp = "2026-08-01T10:00:00.000Z";

describe("client DTO contracts", () => {
  it("exposes every specified client, project, task, and accessibility-safe status label", () => {
    expect(clientStatuses).toEqual(["prospect", "onboarding", "active", "paused", "churned"]);
    expect(projectTypes).toEqual(["chatbot", "workflow", "content", "lead_gen", "custom"]);
    expect(projectStatuses).toEqual(["planning", "in_progress", "review", "delivered", "revision", "complete"]);
    expect(CLIENT_STATUS_LABELS).toEqual({ prospect: "Prospect", onboarding: "Onboarding", active: "Active", paused: "Paused", churned: "Churned" });
    expect(PROJECT_TYPE_LABELS.workflow).toBe("Workflow Automation");
    expect(PROJECT_STATUS_LABELS.in_progress).toBe("In Progress");
    expect(TASK_STATUS_LABELS.cancelled).toBe("Cancelled");
    expect(TASK_PRIORITY_LABELS.critical).toBe("Critical");
    expect(ASSIGNMENT_TYPE_LABELS.agent).toBe("AI Agent");
    expect(COMMUNICATION_TYPE_LABELS.call_summary).toBe("Call Summary");
    expect(INVOICE_STATUS_LABELS.overdue).toBe("Overdue");
  });

  it("normalizes email case but preserves dots and plus addressing", () => {
    const client = clientCreateSchema.parse({
      name: " Acme ",
      contactEmail: " Sales.Team+North@Example.COM ",
      website: "https://example.com/client",
    });
    expect(client.name).toBe("Acme");
    expect(client.contactEmail).toBe("sales.team+north@example.com");
    expect(client.status).toBe("prospect");
    expect(client.mrr).toBe(0);
    expect(client.totalRevenue).toBe(0);
  });

  it("accepts only HTTP(S) websites and rejects unsafe or malformed schemes", () => {
    expect(websiteSchema.parse("https://example.com")).toBe("https://example.com");
    expect(websiteSchema.safeParse("ftp://example.com").success).toBe(false);
    expect(websiteSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(websiteSchema.safeParse("example.com").success).toBe(false);
  });

  it("requires nonempty updates and rejects unknown mutable fields", () => {
    expect(clientUpdateSchema.safeParse({}).success).toBe(false);
    expect(clientUpdateSchema.safeParse({ name: "Updated" }).success).toBe(true);
    expect(clientUpdateSchema.safeParse({ name: "Updated", ownerId: ids.client }).success).toBe(false);
  });

  it("coerces bounded list pagination and validates stable cursor tuples", () => {
    expect(clientListQuerySchema.parse({})).toMatchObject({ limit: 25, archiveScope: "active", sort: "name", direction: "asc", view: "list" });
    expect(clientListQuerySchema.parse({ limit: "100", status: ["active", "paused"], sort: "mrr", direction: "desc" })).toMatchObject({ limit: 100, sort: "mrr" });
    expect(clientListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(clientCursorPayloadSchema.parse({ version: 1, sort: "mrr", direction: "desc", value: 2000, id: ids.client })).toBeTruthy();
    expect(clientCursorPayloadSchema.safeParse({ version: 2, sort: "mrr", direction: "desc", value: 2000, id: ids.client }).success).toBe(false);
  });
});

describe("related client resource contracts", () => {
  it("validates contacts and normalizes contact email without provider-specific rewriting", () => {
    const contact = contactCreateSchema.parse({ clientId: ids.client, name: "Ada", email: "Ada.Lovelace+Agency@EXAMPLE.com", isPrimary: true });
    expect(contact.email).toBe("ada.lovelace+agency@example.com");
    expect(contact.isPrimary).toBe(true);
    expect(contactCreateSchema.safeParse({ ...contact, phone: "555-CALL-NOW" }).success).toBe(false);
  });

  it("rejects project due dates before start dates", () => {
    expect(projectCreateSchema.safeParse({ clientId: ids.client, name: "Build", type: "chatbot", startDate: "2026-08-10", dueDate: "2026-08-09" }).success).toBe(false);
    expect(projectCreateSchema.parse({ clientId: ids.client, name: "Build", type: "chatbot", startDate: "2026-08-09", dueDate: "2026-08-10" }).status).toBe("planning");
  });

  it("validates tasks and discriminated agent/human assignment relationships", () => {
    expect(taskCreateSchema.parse({ projectId: ids.project, title: "Review", dueAt: timestamp })).toMatchObject({ status: "todo", priority: "medium" });
    expect(assignmentCreateSchema.safeParse({ projectId: ids.project, assigneeType: "agent", agentId: ids.agent }).success).toBe(true);
    expect(assignmentCreateSchema.safeParse({ projectId: ids.project, taskId: ids.task, assigneeType: "human" }).success).toBe(true);
    expect(assignmentCreateSchema.safeParse({ projectId: ids.project, assigneeType: "human" }).success).toBe(false);
    expect(assignmentCreateSchema.safeParse({ projectId: ids.project, taskId: ids.task, assigneeType: "human", ownerSubject: "attacker" }).success).toBe(false);
  });

  it("enforces positive time and source attribution", () => {
    const base = { projectId: ids.project, source: "manual", startedAt: timestamp, endedAt: "2026-08-01T11:00:00.000Z", minutes: 60 };
    expect(timeEntryCreateSchema.safeParse(base).success).toBe(true);
    expect(timeEntryCreateSchema.safeParse({ ...base, minutes: 0 }).success).toBe(false);
    expect(timeEntryCreateSchema.safeParse({ ...base, endedAt: "2026-08-01T09:00:00.000Z" }).success).toBe(false);
    expect(timeEntryCreateSchema.safeParse({ ...base, agentRunId: ids.run }).success).toBe(false);
    expect(timeEntryCreateSchema.safeParse({ ...base, source: "agent_run", agentRunId: ids.run }).success).toBe(true);
    expect(timeEntryCreateSchema.safeParse({ ...base, source: "agent_run" }).success).toBe(false);
  });

  it("requires unique deliverable reorder IDs", () => {
    expect(deliverableReorderSchema.safeParse({ projectId: ids.project, orderedDeliverableIds: [ids.task, ids.agent] }).success).toBe(true);
    expect(deliverableReorderSchema.safeParse({ projectId: ids.project, orderedDeliverableIds: [ids.task, ids.task] }).success).toBe(false);
  });

  it("supports content-bearing owner communication DTOs while requiring chronology fields", () => {
    const communication = communicationCreateSchema.parse({
      clientId: ids.client,
      contactId: ids.contact,
      type: "email",
      direction: "inbound",
      occurredAt: timestamp,
      summary: "Requested revised launch date",
      body: "Private owner-visible body",
      nextAction: "Respond tomorrow",
      source: "gmail",
      providerMessageId: "gmail-1",
    });
    expect(communication.body).toBe("Private owner-visible body");
    expect(communicationCreateSchema.safeParse({ ...communication, occurredAt: "not-a-date" }).success).toBe(false);
  });

  it("requires exact deletion confirmation and impact acknowledgement", () => {
    const request = { clientId: ids.client, confirmation: `DELETE ${ids.client}`, impactAcknowledged: true };
    expect(clientDeletionRequestSchema.safeParse(request).success).toBe(true);
    expect(clientDeletionRequestSchema.safeParse({ ...request, confirmation: "delete client" }).success).toBe(false);
    expect(clientDeletionRequestSchema.safeParse({ ...request, impactAcknowledged: false }).success).toBe(false);
  });

  it("represents an honest empty invoice relation and validates populated invoice summaries", () => {
    expect(clientInvoicesRelationSchema.parse({ clientId: ids.client, items: [], total: 0, nextCursor: null, hasMore: false }).items).toEqual([]);
    expect(invoiceRelationDtoSchema.safeParse({
      id: ids.task,
      clientId: ids.client,
      type: "one_time",
      status: "sent",
      amount: 1000,
      currency: "usd",
      dueDate: "2026-08-31",
      paidAt: null,
      sentAt: timestamp,
      hostedInvoiceUrl: "https://billing.example.com/invoice/1",
      createdAt: timestamp,
    }).success).toBe(true);
  });

  it("accepts only versioned, normalized Gmail message envelopes without content", () => {
    const parsed = gmailNormalizedMessageSchema.parse({
      schemaVersion: 1,
      provider: "gmail",
      connectionId: ids.agent,
      providerMessageId: "message-1",
      occurredAt: timestamp,
      from: "OWNER@EXAMPLE.COM",
      to: ["Client+Billing@Example.com"],
    });
    expect(parsed.from).toBe("owner@example.com");
    expect(parsed.to).toEqual(["client+billing@example.com"]);
    expect(gmailNormalizedMessageSchema.safeParse({ ...parsed, subject: "Not part of the matching contract" }).success).toBe(false);
  });
});
