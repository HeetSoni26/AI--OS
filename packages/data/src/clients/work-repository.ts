import type { Prisma, PrismaClient } from "../generated/client/client";
import { AgentRunStatus, AssignmentType, ProjectStatus, TimeEntrySource } from "../generated/client/enums";
import { appendAuditOutboxRecords } from "../durable";
import { ClientOperationsError, DeliveryBlockedError } from "./errors";
import {
  appendMutationRecords,
  assertDateRange,
  projectEventPayload,
  requireActiveOwner,
  requireActiveOwnerInTransaction,
  requireNonBlank,
  safeAuditSummary,
  taskEventPayload,
  upsertAssignmentGraphProjection,
  upsertTaskGraphProjection,
} from "./internal";
import type {
  CreateAgentRunTimeEntryInput,
  CreateAssignmentInput,
  CreateDeliverableInput,
  CreateManualTimeEntryInput,
  CreateProjectInput,
  CreateTaskInput,
  DeliveryBlocker,
  OwnerIdentity,
  TimeAggregation,
  UpdateAssignmentInput,
  UpdateDeliverableInput,
  UpdateManualTimeEntryInput,
  UpdateProjectInput,
  UpdateTaskInput,
} from "./types";

function positiveMinutes(startedAt: Date, endedAt: Date, supplied?: number): number {
  if (endedAt <= startedAt) throw new ClientOperationsError("INVALID_INPUT", "Time entry end must be after its start.");
  const elapsed = Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000);
  const minutes = supplied ?? elapsed;
  if (!Number.isInteger(minutes) || minutes <= 0) throw new ClientOperationsError("INVALID_INPUT", "Time entry minutes must be a positive integer.");
  return minutes;
}

export class PrismaClientWorkRepository {
  constructor(private readonly database: PrismaClient) {}

  async listProjects(identity: OwnerIdentity, clientId: string) {
    await requireActiveOwner(this.database, identity);
    const client = await this.database.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new ClientOperationsError("NOT_FOUND", "Client not found.");
    return this.database.project.findMany({
      where: { clientId, deletedAt: null },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: {
        tasks: { where: { deletedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        assignments: { where: { deletedAt: null }, orderBy: [{ assignedAt: "asc" }, { id: "asc" }] },
        timeEntries: { where: { deletedAt: null }, orderBy: [{ startedAt: "desc" }, { id: "desc" }] },
        deliverables: { where: { deletedAt: null }, orderBy: [{ position: "asc" }, { id: "asc" }] },
        statusHistory: { orderBy: [{ changedAt: "desc" }, { id: "desc" }] },
      },
    });
  }

  async getProject(identity: OwnerIdentity, projectId: string) {
    await requireActiveOwner(this.database, identity);
    const project = await this.database.project.findUnique({
      where: { id: projectId },
      include: {
        client: true,
        tasks: { where: { deletedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        assignments: { where: { deletedAt: null }, orderBy: [{ assignedAt: "asc" }, { id: "asc" }] },
        timeEntries: { where: { deletedAt: null }, orderBy: [{ startedAt: "desc" }, { id: "desc" }] },
        deliverables: { where: { deletedAt: null }, orderBy: [{ position: "asc" }, { id: "asc" }] },
        statusHistory: { orderBy: [{ changedAt: "desc" }, { id: "desc" }] },
      },
    });
    if (!project) throw new ClientOperationsError("NOT_FOUND", "Project not found.");
    return project;
  }

  async createProject(identity: OwnerIdentity, clientId: string, input: CreateProjectInput) {
    assertDateRange(input.startDate, input.dueDate, "Project due date");
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const client = await transaction.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true } });
      if (!client) throw new ClientOperationsError("NOT_FOUND", "Active client not found.");
      const project = await transaction.project.create({
        data: {
          id: input.id,
          clientId,
          name: requireNonBlank(input.name, "Project name"),
          type: input.type,
          status: input.status,
          description: input.description,
          startDate: input.startDate,
          dueDate: input.dueDate,
          price: input.price,
        },
      });
      await transaction.projectStatusHistory.create({
        data: {
          projectId: project.id,
          fromStatus: null,
          toStatus: project.status,
          reason: input.statusReason,
          changedBy: identity.ownerSubject,
          correlationId: identity.correlationId,
        },
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "project",
        entityId: project.id,
        action: "create",
        eventType: "project.created",
        payload: projectEventPayload(project),
        changedFields: Object.keys(input),
      }]);
      return project;
    });
  }

  async updateProject(identity: OwnerIdentity, projectId: string, input: UpdateProjectInput) {
    if (!Object.keys(input).length) throw new ClientOperationsError("INVALID_INPUT", "At least one project field is required.");
    const outcome = await this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const current = await transaction.project.findUnique({ where: { id: projectId } });
      if (!current || current.deletedAt) throw new ClientOperationsError("NOT_FOUND", "Project not found.");
      assertDateRange(input.startDate === undefined ? current.startDate : input.startDate, input.dueDate === undefined ? current.dueDate : input.dueDate, "Project due date");
      if (input.status === ProjectStatus.DELIVERED && current.status !== ProjectStatus.DELIVERED) {
        const blockers = await this.deliveryBlockers(transaction, projectId);
        if (blockers.length) {
          await appendAuditOutboxRecords(transaction, {
            audit: {
              actorSubject: identity.ownerSubject,
              actorType: identity.actorType ?? "owner",
              action: "delivery_blocked",
              entityType: "project",
              entityId: projectId,
              correlationId: identity.correlationId,
              changeSummary: safeAuditSummary(["status"], { blockerIds: blockers.map((blocker) => blocker.deliverableId) }),
              ipHash: identity.ipHash,
            },
            outbox: [],
          });
          return { blocked: blockers } as const;
        }
      }
      const { statusReason: _statusReason, ...data } = input;
      const project = await transaction.project.update({ where: { id: projectId }, data });
      if (input.status !== undefined && input.status !== current.status) {
        await transaction.projectStatusHistory.create({
          data: {
            projectId,
            fromStatus: current.status,
            toStatus: input.status,
            reason: input.statusReason,
            changedBy: identity.ownerSubject,
            correlationId: identity.correlationId,
          },
        });
      }
      await appendMutationRecords(transaction, identity, [{
        entityType: "project",
        entityId: project.id,
        action: "update",
        eventType: "project.updated",
        payload: projectEventPayload(project),
        changedFields: Object.keys(input).filter((key) => key !== "statusReason"),
      }]);
      return { project } as const;
    }, { isolationLevel: "Serializable" });
    if ("blocked" in outcome && outcome.blocked) throw new DeliveryBlockedError(outcome.blocked);
    if (!("project" in outcome)) throw new ClientOperationsError("CONFLICT", "Project update did not complete.");
    return outcome.project;
  }

  async deleteProject(identity: OwnerIdentity, projectId: string) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const current = await transaction.project.findUnique({ where: { id: projectId } });
      if (!current || current.deletedAt) throw new ClientOperationsError("NOT_FOUND", "Project not found.");
      const now = new Date();
      const project = await transaction.project.update({ where: { id: projectId }, data: { archivedAt: current.archivedAt ?? now, deletedAt: now } });
      await appendMutationRecords(transaction, identity, [{
        entityType: "project",
        entityId: project.id,
        action: "delete",
        eventType: "project.deleted",
        payload: projectEventPayload(project),
        changedFields: ["archivedAt", "deletedAt"],
      }]);
      return project;
    });
  }

  async createTask(identity: OwnerIdentity, projectId: string, input: CreateTaskInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      await this.requireLiveProject(transaction, projectId);
      if (input.parentTaskId) await this.requireTaskInProject(transaction, input.parentTaskId, projectId);
      const task = await transaction.task.create({
        data: {
          id: input.id,
          projectId,
          parentTaskId: input.parentTaskId,
          title: requireNonBlank(input.title, "Task title"),
          description: input.description,
          status: input.status,
          priority: input.priority,
          dueAt: input.dueAt,
          completedAt: input.completedAt,
        },
      });
      await upsertTaskGraphProjection(transaction, task);
      await appendMutationRecords(transaction, identity, [{
        entityType: "task", entityId: task.id, action: "create", eventType: "task.created",
        payload: taskEventPayload(task), changedFields: Object.keys(input),
      }]);
      return task;
    });
  }

  async updateTask(identity: OwnerIdentity, taskId: string, input: UpdateTaskInput) {
    if (!Object.keys(input).length) throw new ClientOperationsError("INVALID_INPUT", "At least one task field is required.");
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const current = await transaction.task.findUnique({ where: { id: taskId } });
      if (!current || current.deletedAt) throw new ClientOperationsError("NOT_FOUND", "Task not found.");
      if (input.parentTaskId === taskId) throw new ClientOperationsError("INVALID_INPUT", "A task cannot be its own parent.");
      if (input.parentTaskId) await this.requireTaskInProject(transaction, input.parentTaskId, current.projectId);
      const task = await transaction.task.update({
        where: { id: taskId },
        data: { ...input, title: input.title === undefined ? undefined : requireNonBlank(input.title, "Task title") },
      });
      await upsertTaskGraphProjection(transaction, task);
      await appendMutationRecords(transaction, identity, [{
        entityType: "task", entityId: task.id, action: "update", eventType: "task.updated",
        payload: taskEventPayload(task), changedFields: Object.keys(input),
      }]);
      return task;
    });
  }

  async deleteTask(identity: OwnerIdentity, taskId: string) {
    return this.softDeleteWorkEntity(identity, "task", taskId);
  }

  async createAssignment(identity: OwnerIdentity, projectId: string, input: CreateAssignmentInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      await this.requireLiveProject(transaction, projectId);
      if (input.taskId) await this.requireTaskInProject(transaction, input.taskId, projectId);
      if (input.assigneeType === AssignmentType.HUMAN && !input.taskId) {
        throw new ClientOperationsError("INVALID_INPUT", "Human assignments require a task.");
      }
      if (input.assigneeType === AssignmentType.AGENT) {
        const agent = await transaction.agent.findFirst({ where: { id: input.agentId, deletedAt: null }, select: { id: true } });
        if (!agent) throw new ClientOperationsError("NOT_FOUND", "Agent not found.");
      }
      const assignment = await transaction.assignment.create({
        data: input.assigneeType === AssignmentType.AGENT ? {
          id: input.id,
          projectId,
          taskId: input.taskId,
          assigneeType: AssignmentType.AGENT,
          agentId: input.agentId,
          role: input.role,
          assignedAt: input.assignedAt,
        } : {
          id: input.id,
          projectId,
          taskId: input.taskId,
          assigneeType: AssignmentType.HUMAN,
          ownerAccountId: identity.ownerAccountId,
          ownerSubject: identity.ownerSubject,
          role: input.role,
          assignedAt: input.assignedAt,
        },
      });
      await upsertAssignmentGraphProjection(transaction, assignment);
      await appendMutationRecords(transaction, identity, [{
        entityType: "assignment", entityId: assignment.id, action: "create", eventType: "assignment.created",
        payload: { assignmentId: assignment.id, projectId, taskId: assignment.taskId, assigneeType: assignment.assigneeType }, changedFields: Object.keys(input),
      }]);
      return assignment;
    });
  }

  async updateAssignment(identity: OwnerIdentity, assignmentId: string, input: UpdateAssignmentInput) {
    if (!Object.keys(input).length) throw new ClientOperationsError("INVALID_INPUT", "At least one assignment field is required.");
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const existing = await transaction.assignment.findUnique({ where: { id: assignmentId } });
      if (!existing || existing.deletedAt) throw new ClientOperationsError("NOT_FOUND", "Assignment not found.");
      const assignment = await transaction.assignment.update({ where: { id: assignmentId }, data: input });
      await upsertAssignmentGraphProjection(transaction, assignment);
      await appendMutationRecords(transaction, identity, [{
        entityType: "assignment", entityId: assignment.id, action: "update", eventType: "assignment.updated",
        payload: { assignmentId: assignment.id, projectId: assignment.projectId }, changedFields: Object.keys(input),
      }]);
      return assignment;
    });
  }

  async deleteAssignment(identity: OwnerIdentity, assignmentId: string) {
    return this.softDeleteWorkEntity(identity, "assignment", assignmentId);
  }

  async createManualTimeEntry(identity: OwnerIdentity, projectId: string, input: CreateManualTimeEntryInput) {
    const minutes = positiveMinutes(input.startedAt, input.endedAt, input.minutes);
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      await this.requireLiveProject(transaction, projectId);
      await this.validateTimeReferences(transaction, projectId, input.taskId, input.assignmentId, identity.ownerAccountId);
      await this.assertNoManualOverlap(transaction, identity.ownerAccountId, input.startedAt, input.endedAt);
      const entry = await transaction.timeEntry.create({
        data: {
          id: input.id,
          projectId,
          taskId: input.taskId,
          assignmentId: input.assignmentId,
          ownerAccountId: identity.ownerAccountId,
          source: TimeEntrySource.MANUAL,
          description: input.description,
          startedAt: input.startedAt,
          endedAt: input.endedAt,
          minutes,
          hourlyRate: input.hourlyRate,
        },
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "time_entry", entityId: entry.id, action: "create", eventType: "time_entry.created",
        payload: { timeEntryId: entry.id, projectId, source: entry.source, minutes: entry.minutes }, changedFields: Object.keys(input),
      }]);
      return entry;
    }, { isolationLevel: "Serializable" });
  }

  async updateManualTimeEntry(identity: OwnerIdentity, timeEntryId: string, input: UpdateManualTimeEntryInput) {
    if (!Object.keys(input).length) throw new ClientOperationsError("INVALID_INPUT", "At least one time entry field is required.");
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const current = await transaction.timeEntry.findUnique({ where: { id: timeEntryId } });
      if (!current || current.deletedAt || current.source !== TimeEntrySource.MANUAL || current.ownerAccountId !== identity.ownerAccountId || !current.endedAt) {
        throw new ClientOperationsError("NOT_FOUND", "Manual time entry not found for the active owner.");
      }
      const startedAt = input.startedAt ?? current.startedAt;
      const endedAt = input.endedAt ?? current.endedAt;
      const minutes = positiveMinutes(startedAt, endedAt, input.minutes ?? (input.startedAt || input.endedAt ? undefined : current.minutes));
      await this.validateTimeReferences(transaction, current.projectId, input.taskId === undefined ? current.taskId : input.taskId, input.assignmentId === undefined ? current.assignmentId : input.assignmentId, identity.ownerAccountId);
      await this.assertNoManualOverlap(transaction, identity.ownerAccountId, startedAt, endedAt, timeEntryId);
      const entry = await transaction.timeEntry.update({
        where: { id: timeEntryId },
        data: { ...input, startedAt, endedAt, minutes },
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "time_entry", entityId: entry.id, action: "update", eventType: "time_entry.updated",
        payload: { timeEntryId: entry.id, projectId: entry.projectId, source: entry.source, minutes: entry.minutes }, changedFields: Object.keys(input),
      }]);
      return entry;
    }, { isolationLevel: "Serializable" });
  }

  async deleteManualTimeEntry(identity: OwnerIdentity, timeEntryId: string) {
    return this.softDeleteWorkEntity(identity, "timeEntry", timeEntryId, TimeEntrySource.MANUAL);
  }

  /** Records one completed run once, deriving duration from the durable run rather than caller estimates. */
  async recordAgentRunTime(identity: OwnerIdentity, projectId: string, input: CreateAgentRunTimeEntryInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const project = await this.requireLiveProject(transaction, projectId);
      const run = await transaction.agentRun.findFirst({
        where: { id: input.agentRunId, deletedAt: null },
        select: { id: true, agentId: true, clientId: true, status: true, startedAt: true, completedAt: true, durationMs: true },
      });
      if (!run) throw new ClientOperationsError("NOT_FOUND", "Agent run not found.");
      if (run.status !== AgentRunStatus.SUCCESS || !run.startedAt || !run.completedAt) {
        throw new ClientOperationsError("CONFLICT", "Only completed successful agent runs can produce time entries.");
      }
      if (run.clientId !== project.clientId) {
        throw new ClientOperationsError("INVALID_INPUT", "Agent run does not belong to the project's client.");
      }
      await this.validateTimeReferences(transaction, projectId, input.taskId, input.assignmentId);
      if (input.assignmentId) {
        const assignment = await transaction.assignment.findUnique({ where: { id: input.assignmentId } });
        if (!assignment || assignment.assigneeType !== AssignmentType.AGENT || assignment.agentId !== run.agentId) {
          throw new ClientOperationsError("INVALID_INPUT", "Agent run does not match the selected assignment.");
        }
      }
      const elapsedMs = run.durationMs ?? run.completedAt.getTime() - run.startedAt.getTime();
      const minutes = Math.max(1, Math.ceil(elapsedMs / 60_000));
      const entry = await transaction.timeEntry.create({
        data: {
          id: input.id,
          projectId,
          taskId: input.taskId,
          assignmentId: input.assignmentId,
          agentRunId: input.agentRunId,
          source: TimeEntrySource.AGENT_RUN,
          description: input.description,
          startedAt: run.startedAt,
          endedAt: run.completedAt,
          minutes,
          hourlyRate: input.hourlyRate,
        },
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "time_entry", entityId: entry.id, action: "create", eventType: "time_entry.created",
        payload: { timeEntryId: entry.id, projectId, source: entry.source, minutes: entry.minutes }, changedFields: Object.keys(input),
      }]);
      return entry;
    });
  }

  async aggregateProjectTime(identity: OwnerIdentity, projectId: string): Promise<TimeAggregation> {
    await requireActiveOwner(this.database, identity);
    await this.requireLiveProject(this.database, projectId);
    const entries = await this.database.timeEntry.findMany({
      where: { projectId, archivedAt: null, deletedAt: null },
      select: { source: true, minutes: true, hourlyRate: true },
    });
    let manualMinutes = 0;
    let agentRunMinutes = 0;
    let billableAmount = new (await import("../generated/client/client")).Prisma.Decimal(0);
    for (const entry of entries) {
      if (entry.source === TimeEntrySource.MANUAL) manualMinutes += entry.minutes;
      else agentRunMinutes += entry.minutes;
      if (entry.hourlyRate) billableAmount = billableAmount.plus(entry.hourlyRate.mul(entry.minutes).div(60));
    }
    return { projectId, totalMinutes: manualMinutes + agentRunMinutes, manualMinutes, agentRunMinutes, billableAmount };
  }

  async createDeliverable(identity: OwnerIdentity, projectId: string, input: CreateDeliverableInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const project = await this.requireLiveProject(transaction, projectId);
      if (project.status === ProjectStatus.DELIVERED && input.isRequired !== false && !input.completedAt) {
        throw new DeliveryBlockedError([{ deliverableId: input.id ?? "00000000-0000-0000-0000-000000000000", title: input.title, reason: "required_incomplete" }]);
      }
      const maximum = await transaction.deliverable.aggregate({ where: { projectId, archivedAt: null, deletedAt: null }, _max: { position: true } });
      const position = input.position ?? (maximum._max.position ?? 0) + 1;
      if (!Number.isInteger(position) || position <= 0) throw new ClientOperationsError("INVALID_INPUT", "Deliverable position must be a positive integer.");
      const deliverable = await transaction.deliverable.create({
        data: {
          id: input.id,
          projectId,
          title: requireNonBlank(input.title, "Deliverable title"),
          description: input.description,
          position,
          isRequired: input.isRequired,
          completedAt: input.completedAt,
        },
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "deliverable", entityId: deliverable.id, action: "create", eventType: "deliverable.created",
        payload: { deliverableId: deliverable.id, projectId, position }, changedFields: Object.keys(input),
      }]);
      return deliverable;
    });
  }

  async updateDeliverable(identity: OwnerIdentity, deliverableId: string, input: UpdateDeliverableInput) {
    if (!Object.keys(input).length) throw new ClientOperationsError("INVALID_INPUT", "At least one deliverable field is required.");
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const current = await transaction.deliverable.findUnique({ where: { id: deliverableId }, include: { project: true } });
      if (!current || current.deletedAt) throw new ClientOperationsError("NOT_FOUND", "Deliverable not found.");
      const required = input.isRequired ?? current.isRequired;
      const completedAt = input.completedAt === undefined ? current.completedAt : input.completedAt;
      if (current.project.status === ProjectStatus.DELIVERED && required && !completedAt) {
        throw new DeliveryBlockedError([{ deliverableId, title: input.title ?? current.title, reason: "required_incomplete" }]);
      }
      const deliverable = await transaction.deliverable.update({
        where: { id: deliverableId },
        data: { ...input, title: input.title === undefined ? undefined : requireNonBlank(input.title, "Deliverable title") },
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "deliverable", entityId: deliverable.id, action: "update", eventType: "deliverable.updated",
        payload: { deliverableId: deliverable.id, projectId: deliverable.projectId, position: deliverable.position }, changedFields: Object.keys(input),
      }]);
      return deliverable;
    });
  }

  async deleteDeliverable(identity: OwnerIdentity, deliverableId: string) {
    return this.softDeleteWorkEntity(identity, "deliverable", deliverableId);
  }

  async reorderDeliverables(identity: OwnerIdentity, projectId: string, orderedIds: readonly string[]) {
    if (!orderedIds.length || new Set(orderedIds).size !== orderedIds.length) {
      throw new ClientOperationsError("INVALID_INPUT", "A unique ordered deliverable list is required.");
    }
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      await this.requireLiveProject(transaction, projectId);
      const live = await transaction.deliverable.findMany({ where: { projectId, archivedAt: null, deletedAt: null }, orderBy: { position: "asc" } });
      const liveIds = new Set(live.map((deliverable) => deliverable.id));
      if (live.length !== orderedIds.length || orderedIds.some((id) => !liveIds.has(id))) {
        throw new ClientOperationsError("INVALID_INPUT", "Reordering must include every live project deliverable exactly once.");
      }
      const offset = (Math.max(...live.map((deliverable) => deliverable.position), 0) + live.length + 1) * 2;
      for (let index = 0; index < orderedIds.length; index += 1) {
        await transaction.deliverable.update({ where: { id: orderedIds[index]! }, data: { position: offset + index + 1 } });
      }
      for (let index = 0; index < orderedIds.length; index += 1) {
        await transaction.deliverable.update({ where: { id: orderedIds[index]! }, data: { position: index + 1 } });
      }
      const reordered = await transaction.deliverable.findMany({ where: { projectId, archivedAt: null, deletedAt: null }, orderBy: { position: "asc" } });
      await appendMutationRecords(transaction, identity, reordered.map((deliverable) => ({
        entityType: "deliverable", entityId: deliverable.id, action: "reorder", eventType: "deliverable.updated",
        payload: { deliverableId: deliverable.id, projectId, position: deliverable.position }, changedFields: ["position"],
      })));
      return reordered;
    });
  }

  private async deliveryBlockers(transaction: Prisma.TransactionClient, projectId: string): Promise<DeliveryBlocker[]> {
    const deliverables = await transaction.deliverable.findMany({
      where: { projectId, isRequired: true, completedAt: null, archivedAt: null, deletedAt: null },
      select: { id: true, title: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    return deliverables.map((deliverable) => ({ deliverableId: deliverable.id, title: deliverable.title, reason: "required_incomplete" }));
  }

  private async requireLiveProject(transaction: Prisma.TransactionClient | PrismaClient, projectId: string) {
    const project = await transaction.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) throw new ClientOperationsError("NOT_FOUND", "Project not found.");
    return project;
  }

  private async requireTaskInProject(transaction: Prisma.TransactionClient, taskId: string, projectId: string) {
    const task = await transaction.task.findFirst({ where: { id: taskId, projectId, deletedAt: null }, select: { id: true } });
    if (!task) throw new ClientOperationsError("INVALID_INPUT", "Task does not belong to the project.");
    return task;
  }

  private async validateTimeReferences(
    transaction: Prisma.TransactionClient,
    projectId: string,
    taskId?: string | null,
    assignmentId?: string | null,
    ownerAccountId?: string,
  ): Promise<void> {
    if (taskId) await this.requireTaskInProject(transaction, taskId, projectId);
    if (assignmentId) {
      const assignment = await transaction.assignment.findFirst({ where: { id: assignmentId, projectId, deletedAt: null } });
      if (!assignment) throw new ClientOperationsError("INVALID_INPUT", "Assignment does not belong to the project.");
      if (ownerAccountId && (assignment.assigneeType !== AssignmentType.HUMAN || assignment.ownerAccountId !== ownerAccountId)) {
        throw new ClientOperationsError("INVALID_INPUT", "Manual time assignment must belong to the active owner.");
      }
      if (taskId && assignment.taskId !== taskId) throw new ClientOperationsError("INVALID_INPUT", "Assignment does not belong to the selected task.");
    }
  }

  private async assertNoManualOverlap(
    transaction: Prisma.TransactionClient,
    ownerAccountId: string,
    startedAt: Date,
    endedAt: Date,
    excludeId?: string,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM public.time_entries
      WHERE owner_account_id = ${ownerAccountId}::uuid
        AND source = 'manual'
        AND archived_at IS NULL AND deleted_at IS NULL
        AND id <> COALESCE(${excludeId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND tstzrange(started_at, ended_at, '[)') && tstzrange(${startedAt}, ${endedAt}, '[)')
      LIMIT 1
    `;
    if (rows.length) throw new ClientOperationsError("CONFLICT", "Manual time entries for the active owner cannot overlap.", { conflictingTimeEntryId: rows[0]!.id });
  }

  private async softDeleteWorkEntity(
    identity: OwnerIdentity,
    kind: "task" | "assignment" | "deliverable" | "timeEntry",
    id: string,
    requiredSource?: TimeEntrySource,
  ) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const now = new Date();
      if (kind === "task") {
        const current = await transaction.task.findUnique({ where: { id } });
        if (!current || current.deletedAt) throw new ClientOperationsError("NOT_FOUND", "Task not found.");
        const entity = await transaction.task.update({ where: { id }, data: { archivedAt: current.archivedAt ?? now, deletedAt: now } });
        await upsertTaskGraphProjection(transaction, entity);
        await appendMutationRecords(transaction, identity, [{ entityType: "task", entityId: id, action: "delete", eventType: "task.deleted", payload: taskEventPayload(entity), changedFields: ["archivedAt", "deletedAt"] }]);
        return entity;
      }
      if (kind === "assignment") {
        const current = await transaction.assignment.findUnique({ where: { id } });
        if (!current || current.deletedAt) throw new ClientOperationsError("NOT_FOUND", "Assignment not found.");
        const entity = await transaction.assignment.update({ where: { id }, data: { archivedAt: current.archivedAt ?? now, deletedAt: now } });
        await upsertAssignmentGraphProjection(transaction, entity);
        await appendMutationRecords(transaction, identity, [{ entityType: "assignment", entityId: id, action: "delete", eventType: "assignment.deleted", payload: { assignmentId: id, projectId: entity.projectId }, changedFields: ["archivedAt", "deletedAt"] }]);
        return entity;
      }
      if (kind === "deliverable") {
        const current = await transaction.deliverable.findUnique({ where: { id }, include: { project: true } });
        if (!current || current.deletedAt) throw new ClientOperationsError("NOT_FOUND", "Deliverable not found.");
        if (current.project.status === ProjectStatus.DELIVERED && current.isRequired) {
          throw new DeliveryBlockedError([{ deliverableId: id, title: current.title, reason: "required_incomplete" }]);
        }
        const entity = await transaction.deliverable.update({ where: { id }, data: { archivedAt: current.archivedAt ?? now, deletedAt: now } });
        await appendMutationRecords(transaction, identity, [{ entityType: "deliverable", entityId: id, action: "delete", eventType: "deliverable.deleted", payload: { deliverableId: id, projectId: entity.projectId }, changedFields: ["archivedAt", "deletedAt"] }]);
        return entity;
      }
      const current = await transaction.timeEntry.findUnique({ where: { id } });
      if (!current || current.deletedAt || (requiredSource && current.source !== requiredSource)) throw new ClientOperationsError("NOT_FOUND", "Time entry not found.");
      if (requiredSource === TimeEntrySource.MANUAL && current.ownerAccountId !== identity.ownerAccountId) throw new ClientOperationsError("INVALID_IDENTITY", "Manual time entry belongs to another owner.");
      const entity = await transaction.timeEntry.update({ where: { id }, data: { archivedAt: current.archivedAt ?? now, deletedAt: now } });
      await appendMutationRecords(transaction, identity, [{ entityType: "time_entry", entityId: id, action: "delete", eventType: "time_entry.deleted", payload: { timeEntryId: id, projectId: entity.projectId }, changedFields: ["archivedAt", "deletedAt"] }]);
      return entity;
    });
  }
}
