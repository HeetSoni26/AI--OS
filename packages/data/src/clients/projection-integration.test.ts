import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../generated/client/client";
import {
  AssignmentType,
  CommunicationDirection,
  CommunicationType,
  GraphEdgeProvenance,
  GraphEdgeType,
  GraphNodeType,
  ProjectStatus,
  ProjectType,
  TaskPriority,
  TaskStatus,
} from "../generated/client/enums";
import { PrismaClientCommunicationRepository } from "./communication-repository";
import { upsertClientGraphProjection, upsertContactGraphProjection } from "./internal";
import type { OwnerIdentity } from "./types";
import { PrismaClientWorkRepository } from "./work-repository";

const identity: OwnerIdentity = {
  ownerAccountId: "owner-1",
  ownerSubject: "owner-subject-1",
  correlationId: "part4_projection_test",
};

class InMemoryClientTransaction {
  readonly clients = [{ id: "client-1", name: "Projection Client", archivedAt: null as Date | null, deletedAt: null as Date | null }];
  readonly projects = [{
    id: "project-1",
    clientId: "client-1",
    name: "Projection Project",
    type: ProjectType.CUSTOM,
    status: ProjectStatus.IN_PROGRESS,
    archivedAt: null as Date | null,
    deletedAt: null as Date | null,
  }];
  readonly agents = [{ id: "agent-1", name: "Projection Agent", archivedAt: null as Date | null, deletedAt: null as Date | null }];
  readonly contacts = [{
    id: "contact-1",
    clientId: "client-1",
    name: "Private Contact Name",
    email: "private@example.invalid",
    isPrimary: false,
    lastContactAt: null as Date | null,
    archivedAt: null as Date | null,
    deletedAt: null as Date | null,
  }];
  readonly tasks: Array<Record<string, any>> = [];
  readonly assignments: Array<Record<string, any>> = [];
  readonly communications: Array<Record<string, any>> = [];
  readonly graphNodes: Array<Record<string, any>> = [];
  readonly graphEdges: Array<Record<string, any>> = [];
  readonly audits: Array<Record<string, any>> = [];
  readonly outbox: Array<Record<string, any>> = [];

  private id(prefix: string, rows: readonly unknown[]): string {
    return `${prefix}-${rows.length + 1}`;
  }

  readonly ownerAccount = {
    findFirst: async () => ({ id: identity.ownerAccountId, authSubject: identity.ownerSubject }),
  };

  readonly client = {
    findFirst: async (args: any) => this.clients.find((row) =>
      row.id === args.where.id && (args.where.deletedAt === undefined || row.deletedAt === args.where.deletedAt),
    ) ?? null,
    findUnique: async (args: any) => this.clients.find((row) => row.id === args.where.id) ?? null,
  };

  readonly project = {
    findFirst: async (args: any) => this.projects.find((row) => row.id === args.where.id && row.deletedAt === null) ?? null,
    findUnique: async (args: any) => {
      const row = this.projects.find((candidate) => candidate.id === args.where.id);
      if (!row) return null;
      const client = this.clients.find((candidate) => candidate.id === row.clientId)!;
      return { ...row, client };
    },
  };

  readonly task = {
    create: async (args: any) => {
      const row = {
        id: args.data.id ?? this.id("task", this.tasks),
        projectId: args.data.projectId,
        parentTaskId: args.data.parentTaskId ?? null,
        title: args.data.title,
        description: args.data.description ?? null,
        status: args.data.status ?? TaskStatus.TODO,
        priority: args.data.priority ?? TaskPriority.MEDIUM,
        dueAt: args.data.dueAt ?? null,
        completedAt: args.data.completedAt ?? null,
        archivedAt: null,
        deletedAt: null,
      };
      this.tasks.push(row);
      return { ...row };
    },
    findFirst: async (args: any) => this.tasks.find((row) =>
      row.id === args.where.id
      && (args.where.projectId === undefined || row.projectId === args.where.projectId)
      && (args.where.deletedAt === undefined || row.deletedAt === args.where.deletedAt),
    ) ?? null,
    findUnique: async (args: any) => this.tasks.find((row) => row.id === args.where.id) ?? null,
    update: async (args: any) => {
      const row = this.tasks.find((candidate) => candidate.id === args.where.id)!;
      Object.assign(row, args.data);
      return { ...row };
    },
  };

  readonly agent = {
    findFirst: async (args: any) => this.agents.find((row) => row.id === args.where.id && row.deletedAt === null) ?? null,
  };

  readonly assignment = {
    create: async (args: any) => {
      const row = {
        id: args.data.id ?? this.id("assignment", this.assignments),
        projectId: args.data.projectId,
        taskId: args.data.taskId ?? null,
        assigneeType: args.data.assigneeType,
        agentId: args.data.agentId ?? null,
        ownerAccountId: args.data.ownerAccountId ?? null,
        completedAt: null,
        archivedAt: null,
        deletedAt: null,
      };
      this.assignments.push(row);
      return { ...row };
    },
    findMany: async (args: any) => this.assignments.filter((row) => {
      if (args.where.taskId !== undefined && row.taskId !== args.where.taskId) return false;
      if (args.where.assigneeType !== undefined && row.assigneeType !== args.where.assigneeType) return false;
      if (args.where.project?.clientId) {
        const project = this.projects.find((candidate) => candidate.id === row.projectId);
        if (project?.clientId !== args.where.project.clientId) return false;
      }
      return true;
    }).map((row) => ({
      ...row,
      agent: row.agentId ? this.agents.find((candidate) => candidate.id === row.agentId) ?? null : null,
      project: this.projects.find((candidate) => candidate.id === row.projectId),
    })),
    findUnique: async (args: any) => this.assignments.find((row) => row.id === args.where.id) ?? null,
    update: async (args: any) => {
      const row = this.assignments.find((candidate) => candidate.id === args.where.id)!;
      Object.assign(row, args.data);
      return { ...row };
    },
  };

  readonly graphNode = {
    findUnique: async (args: any) => {
      if (args.where.type_entityId) {
        return this.graphNodes.find((row) => row.type === args.where.type_entityId.type && row.entityId === args.where.type_entityId.entityId) ?? null;
      }
      return this.graphNodes.find((row) => row.stableKey === args.where.stableKey) ?? null;
    },
    upsert: async (args: any) => {
      const existing = this.graphNodes.find((row) => row.stableKey === args.where.stableKey);
      if (existing) {
        Object.assign(existing, args.update);
        return { ...existing };
      }
      const row = { id: this.id("node", this.graphNodes), ...args.create };
      this.graphNodes.push(row);
      return { ...row };
    },
  };

  readonly graphEdge = {
    upsert: async (args: any) => {
      const key = args.where.sourceId_sourceType_targetId_targetType_edgeType;
      const existing = this.graphEdges.find((row) =>
        row.sourceId === key.sourceId && row.sourceType === key.sourceType
        && row.targetId === key.targetId && row.targetType === key.targetType
        && row.edgeType === key.edgeType,
      );
      if (existing) {
        Object.assign(existing, args.update);
        return { ...existing };
      }
      const row = { id: this.id("edge", this.graphEdges), ...args.create };
      this.graphEdges.push(row);
      return { ...row };
    },
    updateMany: async (args: any) => {
      const key = args.where;
      const matches = this.graphEdges.filter((row) =>
        row.targetId === key.targetId
        && row.targetType === key.targetType
        && row.edgeType === key.edgeType
        && row.provenance === key.provenance
        && row.deletedAt === key.deletedAt
        && row.metadata?.projectionKey === key.metadata.equals
        && (!key.sourceId?.notIn || !key.sourceId.notIn.includes(row.sourceId)),
      );
      for (const row of matches) Object.assign(row, args.data);
      return { count: matches.length };
    },
  };

  readonly contact = {
    findMany: async (args: any) => this.contacts.filter((row) =>
      args.where.id.in.includes(row.id)
      && row.clientId === args.where.clientId
      && row.archivedAt === args.where.archivedAt
      && row.deletedAt === args.where.deletedAt,
    ),
    updateManyAndReturn: async (args: any) => {
      const advanced = this.contacts.filter((row) =>
        args.where.id.in.includes(row.id)
        && (row.lastContactAt === null || row.lastContactAt < args.data.lastContactAt),
      );
      for (const row of advanced) row.lastContactAt = args.data.lastContactAt;
      return advanced.map((row) => ({ ...row }));
    },
  };

  readonly communication = {
    findFirst: async () => null,
    create: async (args: any) => {
      const row = {
        id: args.data.id ?? this.id("communication", this.communications),
        ...args.data,
        contactId: args.data.contactId ?? null,
        direction: args.data.direction ?? CommunicationDirection.INTERNAL,
        source: args.data.source ?? null,
        archivedAt: null,
        deletedAt: null,
        participants: (args.data.participants?.create ?? []).map((participant: { contactId: string }) => ({
          ...participant,
          contact: this.contacts.find((contact) => contact.id === participant.contactId),
        })),
      };
      this.communications.push(row);
      return { ...row };
    },
  };

  readonly auditEvent = {
    create: async (args: any) => {
      const row = { id: this.id("audit", this.audits), ...args.data };
      this.audits.push(row);
      return row;
    },
  };

  readonly outboxEvent = {
    create: async (args: any) => {
      const row = { id: args.data.id ?? this.id("outbox", this.outbox), ...args.data };
      this.outbox.push(row);
      return row;
    },
  };

  readonly integrationConnection = {
    findUnique: async () => null,
  };

  readonly $queryRaw = async () => [];

  asDatabase(): PrismaClient {
    const transaction = this as unknown as PrismaClient;
    return {
      ...(transaction as object),
      $transaction: async (operation: (tx: PrismaClient) => Promise<unknown>) => operation(transaction),
    } as unknown as PrismaClient;
  }
}

describe("Part 4 current-domain graph projection integration", () => {
  it("marks client/contact projection-created ownership edges as SYSTEM_PROJECTION on create and repair", async () => {
    const transaction = new InMemoryClientTransaction();
    const prismaTransaction = transaction as any;
    await upsertClientGraphProjection(prismaTransaction, transaction.clients[0]!);
    await upsertContactGraphProjection(prismaTransaction, transaction.contacts[0]!);
    const edge = transaction.graphEdges[0]!;
    expect(edge).toMatchObject({
      edgeType: GraphEdgeType.OWNERSHIP,
      provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
      metadata: { projectionVersion: 1, projectionKey: "clients.contacts" },
    });

    edge.provenance = GraphEdgeProvenance.OWNER_EXPLICIT;
    await upsertContactGraphProjection(prismaTransaction, transaction.contacts[0]!);
    expect(edge.provenance).toBe(GraphEdgeProvenance.SYSTEM_PROJECTION);
    expect(transaction.graphEdges).toHaveLength(1);
  });

  it("idempotently reconciles real task ownership and agent assignments through task lifecycle paths", async () => {
    const transaction = new InMemoryClientTransaction();
    const work = new PrismaClientWorkRepository(transaction.asDatabase());

    const task = await work.createTask(identity, "project-1", { id: "task-1", title: "Original task", status: TaskStatus.TODO });
    await work.updateTask(identity, task.id, { title: "Updated task", status: TaskStatus.IN_PROGRESS });

    const clientNode = transaction.graphNodes.find((node) => node.stableKey === "client:client-1")!;
    const taskNode = transaction.graphNodes.find((node) => node.stableKey === "task:task-1")!;
    const ownership = transaction.graphEdges.find((edge) => edge.edgeType === GraphEdgeType.OWNERSHIP)!;
    expect(transaction.graphNodes.filter((node) => node.stableKey === "task:task-1")).toHaveLength(1);
    expect(ownership).toMatchObject({
      sourceId: clientNode.id,
      sourceType: GraphNodeType.CLIENT,
      targetId: taskNode.id,
      targetType: GraphNodeType.TASK,
      provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
      metadata: { projectionVersion: 1, projectionKey: "clients.tasks" },
      archivedAt: null,
      deletedAt: null,
    });
    expect(taskNode.label).toBe("Updated task");

    const assignment = await work.createAssignment(identity, "project-1", {
      id: "assignment-1",
      taskId: task.id,
      assigneeType: AssignmentType.AGENT,
      agentId: "agent-1",
    });
    const assignmentEdge = transaction.graphEdges.find((edge) => edge.edgeType === GraphEdgeType.ASSIGNMENT)!;
    expect(assignmentEdge).toMatchObject({
      sourceType: GraphNodeType.AGENT,
      targetId: taskNode.id,
      targetType: GraphNodeType.TASK,
      provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
      metadata: { projectionVersion: 1, projectionKey: "clients.assignments" },
      archivedAt: null,
      deletedAt: null,
    });

    const completedAt = new Date("2030-01-02T00:00:00.000Z");
    await work.updateAssignment(identity, assignment.id, { completedAt });
    expect(assignmentEdge.archivedAt).toEqual(completedAt);
    expect(assignmentEdge.deletedAt).toBeNull();
    await work.updateAssignment(identity, assignment.id, { completedAt: null });
    expect(assignmentEdge.archivedAt).toBeNull();
    expect(transaction.graphEdges.filter((edge) => edge.edgeType === GraphEdgeType.ASSIGNMENT)).toHaveLength(1);

    await work.deleteTask(identity, task.id);
    expect(ownership.provenance).toBe(GraphEdgeProvenance.SYSTEM_PROJECTION);
    expect(ownership.deletedAt).toBeInstanceOf(Date);
    expect(assignmentEdge.provenance).toBe(GraphEdgeProvenance.SYSTEM_PROJECTION);
    expect(assignmentEdge.deletedAt).toBeInstanceOf(Date);
    expect(transaction.outbox.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "task.created",
      "task.updated",
      "assignment.created",
      "assignment.updated",
      "task.deleted",
    ]));
  });

  it("projects project-level agent assignments to the owning client without duplicate edges", async () => {
    const transaction = new InMemoryClientTransaction();
    const work = new PrismaClientWorkRepository(transaction.asDatabase());

    const assignment = await work.createAssignment(identity, "project-1", {
      id: "client-assignment-1",
      taskId: null,
      assigneeType: AssignmentType.AGENT,
      agentId: "agent-1",
    });
    const clientNode = transaction.graphNodes.find((node) => node.stableKey === "client:client-1")!;
    const edge = transaction.graphEdges.find((candidate) => candidate.edgeType === GraphEdgeType.ASSIGNMENT)!;
    expect(edge).toMatchObject({
      sourceType: GraphNodeType.AGENT,
      targetId: clientNode.id,
      targetType: GraphNodeType.CLIENT,
      provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
      metadata: { projectionVersion: 1, projectionKey: "clients.assignments" },
    });

    await work.updateAssignment(identity, assignment.id, { role: "Lead" });
    expect(transaction.graphEdges.filter((candidate) => candidate.edgeType === GraphEdgeType.ASSIGNMENT)).toHaveLength(1);
    await work.deleteAssignment(identity, assignment.id);
    expect(edge.deletedAt).toBeInstanceOf(Date);
  });

  it("emits a PII-free contact.updated event only when communication advances lastContactAt", async () => {
    const transaction = new InMemoryClientTransaction();
    const communications = new PrismaClientCommunicationRepository(transaction.asDatabase());
    const occurredAt = new Date("2031-03-04T05:06:07.000Z");

    await communications.createCommunication(identity, "client-1", {
      id: "communication-1",
      contactId: "contact-1",
      type: CommunicationType.EMAIL,
      direction: CommunicationDirection.INBOUND,
      occurredAt,
      summary: "Private communication summary",
      body: "Private communication body",
      nextAction: "Private next action",
    });

    const contactEvent = transaction.outbox.find((event) => event.eventType === "contact.updated")!;
    expect(transaction.contacts[0]!.lastContactAt).toEqual(occurredAt);
    expect(contactEvent.payload.payload).toEqual({
      contactId: "contact-1",
      clientId: "client-1",
      isPrimary: false,
      lastContactAt: occurredAt.toISOString(),
      archivedAt: null,
    });
    const serialized = JSON.stringify(contactEvent.payload);
    expect(serialized).not.toContain("Private Contact Name");
    expect(serialized).not.toContain("private@example.invalid");
    expect(serialized).not.toContain("Private communication");
    expect(serialized).not.toContain("Private next action");

    await communications.createCommunication(identity, "client-1", {
      id: "communication-2",
      contactId: "contact-1",
      type: CommunicationType.NOTE,
      direction: CommunicationDirection.INTERNAL,
      occurredAt: new Date("2031-03-03T05:06:07.000Z"),
      summary: "Older private note",
    });
    expect(transaction.outbox.filter((event) => event.eventType === "contact.updated")).toHaveLength(1);
  });
});
