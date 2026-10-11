import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AgentRunStatus,
  AgentTriggerType,
  AgentType,
  AssignmentType,
  ClientStatus,
  CommunicationDirection,
  CommunicationType,
  createClientOperationsService,
  createDatabaseClient,
  IntegrationProvider,
  IntegrationStatus,
  ProjectStatus,
  ProjectType,
  type OwnerIdentity,
} from "./index";

const databaseUrl = process.env.TEST_DATABASE_URL;
const database = databaseUrl ? createDatabaseClient({ connectionString: databaseUrl, connectionLimit: 8 }) : null;
const integration = databaseUrl ? describe.sequential : describe.skip;
const fixtureClientIds = new Set<string>();
const fixtureConnectionIds = new Set<string>();
const fixtureAgentIds = new Set<string>();
let createdOwnerId: string | null = null;
let identity: OwnerIdentity;

function requestIdentity(label: string): OwnerIdentity {
  return { ...identity, correlationId: `part3_${label}_${randomUUID()}` };
}

beforeAll(async () => {
  if (!database) return;
  let owner = await database.ownerAccount.findFirst({ where: { active: true } });
  if (!owner) {
    owner = await database.ownerAccount.create({
      data: { authSubject: randomUUID(), email: `part3-${randomUUID()}@example.invalid`, displayName: "Part 3 integration owner" },
    });
    createdOwnerId = owner.id;
  }
  identity = { ownerAccountId: owner.id, ownerSubject: owner.authSubject, correlationId: "part3_setup" };
});

afterAll(async () => {
  if (!database) return;
  const clientIds = [...fixtureClientIds];
  if (clientIds.length) {
    const graphNodes = await database.graphNode.findMany({ where: { entityId: { in: clientIds } }, select: { id: true } });
    const contactIds = (await database.contact.findMany({ where: { clientId: { in: clientIds } }, select: { id: true } })).map((contact) => contact.id);
    const contactNodes = contactIds.length ? await database.graphNode.findMany({ where: { entityId: { in: contactIds } }, select: { id: true } }) : [];
    const graphNodeIds = [...graphNodes, ...contactNodes].map((node) => node.id);
    if (graphNodeIds.length) {
      await database.graphEdge.deleteMany({ where: { OR: [{ sourceId: { in: graphNodeIds } }, { targetId: { in: graphNodeIds } }] } });
      await database.graphNode.deleteMany({ where: { id: { in: graphNodeIds } } });
    }
    await database.deletionRequest.deleteMany({ where: { entityType: "client", entityId: { in: clientIds } } });
    const projectIds = (await database.project.findMany({ where: { clientId: { in: clientIds } }, select: { id: true } })).map((project) => project.id);
    const taskIds = projectIds.length ? (await database.task.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } })).map((task) => task.id) : [];
    const communicationIds = (await database.communication.findMany({ where: { clientId: { in: clientIds } }, select: { id: true } })).map((communication) => communication.id);
    await database.outboxEvent.deleteMany({ where: { aggregateId: { in: [...clientIds, ...contactIds, ...projectIds, ...taskIds, ...communicationIds] } } });
    await database.project.updateMany({ where: { id: { in: projectIds }, status: "DELIVERED" }, data: { status: "COMPLETE" } });
    if (projectIds.length) {
      await database.deliverable.deleteMany({ where: { projectId: { in: projectIds } } });
      await database.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    await database.client.deleteMany({ where: { id: { in: clientIds } } });
  }
  if (fixtureConnectionIds.size) await database.integrationConnection.deleteMany({ where: { id: { in: [...fixtureConnectionIds] } } });
  if (fixtureAgentIds.size) {
    await database.agentRun.deleteMany({ where: { agentId: { in: [...fixtureAgentIds] } } });
    await database.agent.deleteMany({ where: { id: { in: [...fixtureAgentIds] } } });
  }
  if (createdOwnerId) await database.ownerAccount.delete({ where: { id: createdOwnerId } });
  await database.$disconnect();
});

integration("Part 3 Prisma client operations", () => {
  it("atomically promotes one primary contact and keeps the Client summary synchronized", async () => {
    const operations = createClientOperationsService(database!);
    const client = await operations.clients.createClient(requestIdentity("primary_client"), { name: `Primary ${randomUUID()}` });
    fixtureClientIds.add(client.id);
    const first = await operations.clients.createContact(requestIdentity("primary_first"), client.id, { name: "First Contact", email: "First@Example.Invalid" });
    const second = await operations.clients.createContact(requestIdentity("primary_second"), client.id, { name: "Second Contact", email: "Second@Example.Invalid" });

    await Promise.all([
      operations.clients.promotePrimaryContact(requestIdentity("promote_first"), first.id),
      operations.clients.promotePrimaryContact(requestIdentity("promote_second"), second.id),
    ]);

    const contacts = await database!.contact.findMany({ where: { clientId: client.id, isPrimary: true, deletedAt: null } });
    expect(contacts).toHaveLength(1);
    const storedClient = await database!.client.findUniqueOrThrow({ where: { id: client.id } });
    expect(storedClient.contactName).toBe(contacts[0]!.name);
    expect(storedClient.contactEmail).toBe(contacts[0]!.normalizedEmail);
  });

  it("searches and filters clients while preserving stable sorted cursor pages", async () => {
    const operations = createClientOperationsService(database!);
    const prefix = `Cursor ${randomUUID()}`;
    for (const [suffix, mrr, status] of [
      ["A", 40, ClientStatus.ACTIVE],
      ["B", 20, ClientStatus.ACTIVE],
      ["C", 30, ClientStatus.PAUSED],
      ["D", 10, ClientStatus.ACTIVE],
    ] as const) {
      const client = await operations.clients.createClient(requestIdentity(`list_${suffix}`), {
        name: `${prefix} ${suffix}`,
        industry: suffix === "A" ? "Healthcare" : "Finance",
        notes: suffix === "B" ? "specialized orchestration notes" : null,
        mrr,
        status,
      });
      fixtureClientIds.add(client.id);
    }

    const first = await operations.clients.listClients(requestIdentity("list_page_one"), {
      q: prefix,
      status: ClientStatus.ACTIVE,
      sort: "mrr",
      order: "asc",
      limit: 2,
    });
    const second = await operations.clients.listClients(requestIdentity("list_page_two"), {
      q: prefix,
      status: ClientStatus.ACTIVE,
      sort: "mrr",
      order: "asc",
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(first.hasMore).toBe(true);
    expect(first.total).toBe(3);
    expect([...first.items, ...second.items].map((item) => item.mrr.toNumber())).toEqual([10, 20, 40]);
    expect(new Set([...first.items, ...second.items].map((item) => item.id))).toHaveLength(3);

    const industry = await operations.clients.listClients(requestIdentity("list_industry"), { q: prefix, industry: "healthcare" });
    expect(industry.total).toBe(1);
    expect(industry.items[0]?.industry).toBe("Healthcare");
    const notes = await operations.clients.listClients(requestIdentity("list_notes"), { q: "orchestration" });
    expect(notes.items.some((item) => item.name === `${prefix} B`)).toBe(true);
    const typo = await operations.clients.listClients(requestIdentity("list_fuzzy"), { q: `${prefix.slice(0, -1)}x` });
    expect(typo.items.length).toBeGreaterThan(0);

    const contactMatch = await operations.clients.createContact(requestIdentity("list_contact"), first.items[0]!.id, {
      name: `Searchable ${randomUUID()}`,
      email: `search-${randomUUID()}@example.invalid`,
    });
    const search = await operations.clients.listClients(requestIdentity("list_contact_search"), { q: contactMatch.name, lifecycle: "active" });
    expect(search.items.map((item) => item.id)).toContain(first.items[0]!.id);
  });

  it("records status history and returns deliverable blockers before delivery", async () => {
    const operations = createClientOperationsService(database!);
    const client = await operations.clients.createClient(requestIdentity("project_client"), { name: `Project ${randomUUID()}` });
    fixtureClientIds.add(client.id);
    const project = await operations.work.createProject(requestIdentity("project_create"), client.id, {
      name: "Delivery gate",
      type: ProjectType.CUSTOM,
      status: ProjectStatus.REVIEW,
    });
    const deliverable = await operations.work.createDeliverable(requestIdentity("deliverable_create"), project.id, {
      title: "Required acceptance",
      isRequired: true,
    });

    await expect(operations.work.updateProject(requestIdentity("project_blocked"), project.id, { status: ProjectStatus.DELIVERED }))
      .rejects.toMatchObject({ name: "DeliveryBlockedError", blockers: [{ deliverableId: deliverable.id }] });
    expect(await database!.auditEvent.count({ where: { entityType: "project", entityId: project.id, action: "delivery_blocked" } })).toBe(1);

    await operations.work.updateDeliverable(requestIdentity("deliverable_complete"), deliverable.id, { completedAt: new Date() });
    await operations.work.updateProject(requestIdentity("project_delivered"), project.id, { status: ProjectStatus.DELIVERED, statusReason: "Accepted" });
    const history = await database!.projectStatusHistory.findMany({ where: { projectId: project.id }, orderBy: { changedAt: "asc" } });
    expect(history.map((entry) => entry.toStatus)).toEqual([ProjectStatus.REVIEW, ProjectStatus.DELIVERED]);
    expect(history.at(-1)?.fromStatus).toBe(ProjectStatus.REVIEW);
  });

  it("prevents overlapping manual time and derives project hours and billing", async () => {
    const operations = createClientOperationsService(database!);
    const client = await operations.clients.createClient(requestIdentity("time_client"), { name: `Time ${randomUUID()}` });
    fixtureClientIds.add(client.id);
    const project = await operations.work.createProject(requestIdentity("time_project"), client.id, { name: "Time project", type: ProjectType.WORKFLOW });
    const task = await operations.work.createTask(requestIdentity("time_task"), project.id, { title: "Owned work" });
    const assignment = await operations.work.createAssignment(requestIdentity("time_assignment"), project.id, {
      assigneeType: AssignmentType.HUMAN,
      taskId: task.id,
    });
    const base = new Date(Date.UTC(2080, 0, 1 + Math.floor(Math.random() * 300), Math.floor(Math.random() * 20)));
    const plus = (minutes: number) => new Date(base.getTime() + minutes * 60_000);
    await operations.work.createManualTimeEntry(requestIdentity("time_one"), project.id, {
      taskId: task.id,
      assignmentId: assignment.id,
      startedAt: base,
      endedAt: plus(60),
      hourlyRate: 120,
    });
    await expect(operations.work.createManualTimeEntry(requestIdentity("time_overlap"), project.id, {
      taskId: task.id,
      assignmentId: assignment.id,
      startedAt: plus(30),
      endedAt: plus(90),
    })).rejects.toMatchObject({ code: "CONFLICT" });
    await operations.work.createManualTimeEntry(requestIdentity("time_two"), project.id, {
      taskId: task.id,
      assignmentId: assignment.id,
      startedAt: plus(60),
      endedAt: plus(90),
      hourlyRate: 60,
    });

    const aggregate = await operations.work.aggregateProjectTime(requestIdentity("time_aggregate"), project.id);
    expect(aggregate.totalMinutes).toBe(90);
    expect(aggregate.billableAmount.toNumber()).toBe(150);
    expect((await database!.project.findUniqueOrThrow({ where: { id: project.id } })).hoursSpent.toNumber()).toBe(1.5);
  });

  it("derives agent time from a completed run and rejects cross-client or mismatched attribution", async () => {
    const operations = createClientOperationsService(database!);
    const firstClient = await operations.clients.createClient(requestIdentity("agent_time_client"), { name: `Agent Time ${randomUUID()}` });
    const secondClient = await operations.clients.createClient(requestIdentity("agent_time_other_client"), { name: `Agent Time Other ${randomUUID()}` });
    fixtureClientIds.add(firstClient.id);
    fixtureClientIds.add(secondClient.id);
    const project = await operations.work.createProject(requestIdentity("agent_time_project"), firstClient.id, { name: "Agent time", type: ProjectType.CUSTOM });
    const otherProject = await operations.work.createProject(requestIdentity("agent_time_other_project"), secondClient.id, { name: "Other agent time", type: ProjectType.CUSTOM });
    const task = await operations.work.createTask(requestIdentity("agent_time_task"), project.id, { title: "Automated work" });
    const agent = await database!.agent.create({
      data: { name: `Time Agent ${randomUUID()}`, type: AgentType.CUSTOM, model: "test-model", systemPrompt: "Synthetic integration fixture." },
    });
    fixtureAgentIds.add(agent.id);
    const assignment = await operations.work.createAssignment(requestIdentity("agent_time_assignment"), project.id, {
      assigneeType: AssignmentType.AGENT,
      agentId: agent.id,
      taskId: task.id,
    });
    const humanAssignment = await operations.work.createAssignment(requestIdentity("agent_time_human_assignment"), project.id, {
      assigneeType: AssignmentType.HUMAN,
      taskId: task.id,
    });
    const startedAt = new Date("2085-01-01T00:00:00.000Z");
    const completedAt = new Date("2085-01-01T00:02:01.000Z");
    const run = await database!.agentRun.create({
      data: {
        agentId: agent.id,
        clientId: firstClient.id,
        status: AgentRunStatus.SUCCESS,
        triggerType: AgentTriggerType.MANUAL,
        startedAt,
        completedAt,
        durationMs: 121_000,
      },
    });

    await expect(operations.work.recordAgentRunTime(requestIdentity("agent_time_wrong_client"), otherProject.id, {
      agentRunId: run.id,
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(operations.work.recordAgentRunTime(requestIdentity("agent_time_wrong_assignment"), project.id, {
      agentRunId: run.id,
      taskId: task.id,
      assignmentId: humanAssignment.id,
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const entry = await operations.work.recordAgentRunTime(requestIdentity("agent_time_record"), project.id, {
      agentRunId: run.id,
      taskId: task.id,
      assignmentId: assignment.id,
      minutes: 999,
      startedAt: new Date("2000-01-01T00:00:00.000Z"),
    });
    expect(entry).toMatchObject({ startedAt, endedAt: completedAt, minutes: 3 });
    await expect(operations.work.recordAgentRunTime(requestIdentity("agent_time_duplicate"), project.id, {
      agentRunId: run.id,
      taskId: task.id,
      assignmentId: assignment.id,
    })).rejects.toBeDefined();
  });

  it("ingests multi-contact Gmail messages once and advances last-contact timestamps monotonically", async () => {
    const operations = createClientOperationsService(database!);
    const client = await operations.clients.createClient(requestIdentity("comms_client"), { name: `Comms ${randomUUID()}` });
    fixtureClientIds.add(client.id);
    const first = await operations.clients.createContact(requestIdentity("comms_first"), client.id, { name: "Mailbox One", email: `one-${randomUUID()}@example.invalid` });
    const second = await operations.clients.createContact(requestIdentity("comms_second"), client.id, { name: "Mailbox Two", email: `two-${randomUUID()}@example.invalid` });
    const connection = await database!.integrationConnection.create({
      data: { clientId: client.id, provider: IntegrationProvider.GMAIL, name: `Gmail ${randomUUID()}`, status: IntegrationStatus.CONNECTED },
    });
    fixtureConnectionIds.add(connection.id);
    const occurredAt = new Date("2088-06-02T12:00:00.000Z");
    const message = {
      schemaVersion: 1 as const,
      connectionId: connection.id,
      providerMessageId: `message-${randomUUID()}`,
      occurredAt,
      from: first.email!,
      to: ["owner@example.invalid"],
      cc: [second.email!],
      summary: "Normalized provider fixture",
    };
    const created = await operations.communications.ingestNormalizedGmailMessage(requestIdentity("gmail_ingest"), message);
    const duplicate = await operations.communications.ingestNormalizedGmailMessage(requestIdentity("gmail_duplicate"), message);
    expect(created).toMatchObject({ status: "created", communications: [{ clientId: client.id, contactIds: expect.arrayContaining([first.id, second.id]) }] });
    expect(duplicate).toMatchObject({ status: "duplicate", communications: [{ clientId: client.id }] });
    const communicationId = created.status === "created" ? created.communications[0]!.communicationId : "";
    expect(await database!.communicationContact.count({ where: { communicationId } })).toBe(2);

    await operations.communications.createCommunication(requestIdentity("older_comm"), client.id, {
      contactIds: [first.id, second.id],
      type: CommunicationType.NOTE,
      direction: CommunicationDirection.INTERNAL,
      occurredAt: new Date("2088-06-01T12:00:00.000Z"),
      summary: "Older note",
    });
    const contacts = await database!.contact.findMany({ where: { id: { in: [first.id, second.id] } }, orderBy: { id: "asc" } });
    expect(contacts.every((contact) => contact.lastContactAt?.getTime() === occurredAt.getTime())).toBe(true);
  });

  it("archives, recovers, schedules and cancels deletion with safe audit, outbox, and graph projections", async () => {
    const operations = createClientOperationsService(database!);
    const sensitive = `secret-${randomUUID()}`;
    const client = await operations.clients.createClient(requestIdentity("lifecycle_create"), {
      name: `Lifecycle ${randomUUID()}`,
      notes: sensitive,
      contactName: "Lifecycle Contact",
      contactEmail: `life-${randomUUID()}@example.invalid`,
    });
    fixtureClientIds.add(client.id);
    await operations.clients.archiveClient(requestIdentity("lifecycle_archive"), client.id, sensitive);
    expect((await database!.client.findUniqueOrThrow({ where: { id: client.id } })).archivedAt).not.toBeNull();
    await operations.clients.recoverClient(requestIdentity("lifecycle_recover"), client.id);
    expect((await database!.client.findUniqueOrThrow({ where: { id: client.id } })).archivedAt).toBeNull();

    const scheduledAt = new Date("2089-01-01T00:00:00.000Z");
    const plan = await operations.clients.scheduleClientDeletion(requestIdentity("lifecycle_schedule"), client.id, {
      confirmation: `DELETE ${client.id}`,
      impactAcknowledged: true,
      reason: sensitive,
      now: scheduledAt,
    });
    expect(plan.executeAfter.getTime() - scheduledAt.getTime()).toBe(7 * 24 * 60 * 60 * 1_000);
    expect((await database!.client.findUniqueOrThrow({ where: { id: client.id } })).deletedAt).toEqual(scheduledAt);
    await operations.clients.cancelClientDeletion(requestIdentity("lifecycle_cancel"), client.id, plan.id, sensitive, scheduledAt);
    expect((await database!.client.findUniqueOrThrow({ where: { id: client.id } })).deletedAt).toBeNull();
    const expiredPlan = await operations.clients.scheduleClientDeletion(requestIdentity("lifecycle_reschedule"), client.id, {
      confirmation: `DELETE ${client.id}`,
      impactAcknowledged: true,
      now: scheduledAt,
    });
    await expect(operations.clients.cancelClientDeletion(
      requestIdentity("lifecycle_expired_cancel"), client.id, expiredPlan.id, undefined, expiredPlan.recoveryUntil,
    )).rejects.toMatchObject({ code: "CONFLICT" });

    const graphClient = await database!.graphNode.findUnique({ where: { type_entityId: { type: "CLIENT", entityId: client.id } } });
    const contact = await database!.contact.findFirstOrThrow({ where: { clientId: client.id } });
    const graphContact = await database!.graphNode.findUnique({ where: { type_entityId: { type: "HUMAN", entityId: contact.id } } });
    expect(graphClient).not.toBeNull();
    expect(graphContact).not.toBeNull();
    expect(await database!.graphEdge.count({ where: { sourceId: graphClient!.id, targetId: graphContact!.id, edgeType: "OWNERSHIP" } })).toBe(1);

    const detail = await operations.clients.getClientDetail(requestIdentity("lifecycle_detail"), client.id);
    expect(detail.auditSummaries.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(detail.auditSummaries)).not.toContain(sensitive);
    const events = await database!.outboxEvent.findMany({ where: { aggregateId: client.id } });
    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "client.created",
      "client.archived",
      "client.recovered",
      "client.deletion_scheduled",
      "client.deletion_cancelled",
    ]));
    expect(events.every((event) => (event.payload as { schemaVersion?: number }).schemaVersion === 1)).toBe(true);
  });
});
