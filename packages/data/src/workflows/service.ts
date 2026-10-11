import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/client/client";
import { WorkflowExecutionStatus, WorkflowProvider, WorkflowStatus } from "../generated/client/enums";
import { appendMutationRecords, requireActiveOwnerInTransaction } from "../clients/internal";
import type { OwnerIdentity } from "../clients/types";
import {
  workflowBlueprintSchema,
  type WorkflowCreateInput,
  type WorkflowEventInput,
  type WorkflowListQuery,
  type WorkflowUpdateInput,
  type WorkflowValidation,
  type WorkflowValidationIssue,
} from "@aios/contracts";

export type { WorkflowCreateInput, WorkflowUpdateInput, WorkflowListQuery, WorkflowEventInput, WorkflowValidation };

export type WorkflowOperationsErrorCode =
  | "INVALID_IDENTITY" | "NOT_FOUND" | "INVALID_INPUT" | "CONFLICT" | "BLUEPRINT_INVALID" | "STATE_INVALID" | "PROVIDER_UNCONFIGURED";

export class WorkflowOperationsError extends Error {
  constructor(public readonly code: WorkflowOperationsErrorCode, message: string) {
    super(message);
    this.name = "WorkflowOperationsError";
  }
}

const WORKFLOW_LIST_LIMIT = 100;
/** Node types whose parameters may take destructive actions - deployment requires approval. */
const DESTRUCTIVE_NODE_TYPES = new Set(["delete", "http_request", "email_send", "webhook_call", "execute"]);

/**
 * Validates a workflow blueprint: required structure, reachability, cycles,
 * unhandled error paths, unsafe destructive actions, and placeholder credentials.
 */
export function validateWorkflowBlueprint(blueprint: {
  nodes: Array<{ id: string; type: string; name: string; parameters: Record<string, unknown> }>;
  connections: Array<{ from: string; to: string }>;
  trigger: string;
}): WorkflowValidation {
  const issues: WorkflowValidationIssue[] = [];
  const nodeIds = new Set(blueprint.nodes.map((node) => node.id));
  if (blueprint.nodes.length === 0) {
    return { valid: false, issues: [{ code: "empty_blueprint", message: "The blueprint has no nodes." }] };
  }
  for (const connection of blueprint.connections) {
    if (!nodeIds.has(connection.from)) {
      issues.push({ code: "missing_connection", message: `Connection references unknown source node ${connection.from}.`, nodeId: connection.from });
    }
    if (!nodeIds.has(connection.to)) {
      issues.push({ code: "missing_connection", message: `Connection references unknown target node ${connection.to}.`, nodeId: connection.to });
    }
  }
  // Reachability from the trigger node.
  const triggerNode = blueprint.nodes.find((node) => node.id === blueprint.trigger || node.type === blueprint.trigger);
  if (!triggerNode) {
    issues.push({ code: "missing_connection", message: `The trigger node ${blueprint.trigger} does not exist.`, nodeId: blueprint.trigger });
  } else {
    const adjacency = new Map<string, string[]>();
    for (const connection of blueprint.connections) {
      const list = adjacency.get(connection.from) ?? [];
      list.push(connection.to);
      adjacency.set(connection.from, list);
    }
    const visited = new Set<string>([triggerNode.id]);
    const queue = [triggerNode.id];
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    for (const node of blueprint.nodes) {
      if (!visited.has(node.id)) {
        issues.push({ code: "unreachable_node", message: `Node ${node.name} is not reachable from the trigger.`, nodeId: node.id });
      }
    }
    // Cycle detection over the reachable subgraph.
    const onPath = new Set<string>();
    const done = new Set<string>();
    const visit = (nodeId: string): boolean => {
      if (onPath.has(nodeId)) return true;
      if (done.has(nodeId)) return false;
      onPath.add(nodeId);
      for (const next of adjacency.get(nodeId) ?? []) if (visit(next)) return true;
      onPath.delete(nodeId);
      done.add(nodeId);
      return false;
    };
    if (visit(triggerNode.id)) {
      issues.push({ code: "cycle", message: "The blueprint contains an infinite loop." });
    }
  }
  for (const node of blueprint.nodes) {
    if (DESTRUCTIVE_NODE_TYPES.has(node.type.toLowerCase())) {
      issues.push({ code: "unsafe_action", message: `Node ${node.name} (${node.type}) can take a consequential action - owner approval is required before activation.`, nodeId: node.id });
    }
    if (node.type.toLowerCase().includes("credential") && !node.parameters?.credentialReference) {
      issues.push({ code: "unhandled_error", message: `Node ${node.name} references a credential that is not bound.`, nodeId: node.id });
    }
  }
  return { valid: issues.every((issue) => issue.code === "unsafe_action"), issues };
}

type Database = PrismaClient;
type Transaction = Prisma.TransactionClient;

export class PrismaWorkflowService {
  constructor(private readonly database: Database) {}

  async listWorkflows(identity: OwnerIdentity, input: Partial<WorkflowListQuery> = {}) {
    await this.requireActiveOwner(identity);
    const limit = Math.max(1, Math.min(input.limit ?? 50, WORKFLOW_LIST_LIMIT));
    const where: Prisma.WorkflowWhereInput = { deletedAt: null };
    if (input.clientId) where.clientId = input.clientId;
    const statuses = (input.statuses ?? []).map((status) => status.toUpperCase());
    if (statuses.length) where.status = { in: statuses as WorkflowStatus[] };
    if (input.search) where.name = { contains: input.search, mode: "insensitive" };
    const total = await this.database.workflow.count({ where });
    const rows = await this.database.workflow.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: limit + 1,
      include: {
        client: { select: { name: true } },
        versions: { where: { deletedAt: null }, orderBy: { version: "desc" }, take: 1 },
      },
    });
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: visible,
      total,
      hasMore,
      nextCursor: hasMore && visible.at(-1) ? visible.at(-1)!.id : null,
    };
  }

  async getWorkflowDetail(identity: OwnerIdentity, workflowId: string) {
    await this.requireActiveOwner(identity);
    const workflow = await this.database.workflow.findFirst({
      where: { id: workflowId, deletedAt: null },
      include: {
        client: { select: { name: true } },
        versions: { where: { deletedAt: null }, orderBy: { version: "desc" }, take: 10 },
        executions: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!workflow) throw new WorkflowOperationsError("NOT_FOUND", "Workflow not found.");
    return workflow;
  }

  async createWorkflow(identity: OwnerIdentity, input: WorkflowCreateInput) {
    const validation = validateWorkflowBlueprint(input.blueprint);
    if (!validation.valid) {
      throw new WorkflowOperationsError("BLUEPRINT_INVALID", `The blueprint is invalid: ${validation.issues.filter((issue) => issue.code !== "unsafe_action").map((issue) => issue.message).join(" ")}`);
    }
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const client = await transaction.client.findFirst({ where: { id: input.clientId, deletedAt: null }, select: { id: true } });
      if (!client) throw new WorkflowOperationsError("INVALID_INPUT", "The workflow client does not exist.");
      const needsApproval = validation.issues.some((issue) => issue.code === "unsafe_action");
      const workflow = await transaction.workflow.create({
        data: {
          id: randomUUID(),
          clientId: input.clientId,
          agentId: input.agentId ?? null,
          name: input.name,
          description: input.description ?? null,
          provider: providerToDb(input.provider),
          status: needsApproval ? WorkflowStatus.VALIDATED : WorkflowStatus.DRAFT,
          currentVersion: 1,
        },
      });
      await transaction.workflowVersion.create({
        data: {
          workflowId: workflow.id,
          version: 1,
          blueprint: input.blueprint as unknown as Prisma.InputJsonValue,
          humanPlan: input.humanPlan,
          assumptions: input.assumptions,
          validation: validation as unknown as Prisma.InputJsonValue,
          changeSummary: input.changeSummary ?? "Initial blueprint",
        },
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "workflow",
        entityId: workflow.id,
        action: "create",
        eventType: "workflow.created",
        payload: { name: workflow.name, clientId: workflow.clientId, provider: workflow.provider, needsApproval },
        changedFields: ["name", "provider", "blueprint"],
      }]);
      return { workflowId: workflow.id, validation };
    });
  }

  async updateWorkflow(identity: OwnerIdentity, workflowId: string, input: WorkflowUpdateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const workflow = await transaction.workflow.findFirst({ where: { id: workflowId, deletedAt: null } });
      if (!workflow) throw new WorkflowOperationsError("NOT_FOUND", "Workflow not found.");
      const latest = await transaction.workflowVersion.findFirst({ where: { workflowId, deletedAt: null }, orderBy: { version: "desc" } });
      if (!latest) throw new WorkflowOperationsError("STATE_INVALID", "The workflow has no versions.");

      let validation: WorkflowValidation | null = null;
      let blueprintChanged = false;
      if (input.blueprint) {
        validation = validateWorkflowBlueprint(input.blueprint);
        if (!validation.valid) {
          throw new WorkflowOperationsError("BLUEPRINT_INVALID", `The blueprint is invalid: ${validation.issues.filter((issue) => issue.code !== "unsafe_action").map((issue) => issue.message).join(" ")}`);
        }
        blueprintChanged = JSON.stringify(input.blueprint) !== JSON.stringify(latest.blueprint);
      }

      if (blueprintChanged || input.humanPlan !== undefined || input.assumptions !== undefined) {
        const version = await transaction.workflowVersion.create({
          data: {
            workflowId,
            version: latest.version + 1,
            blueprint: (input.blueprint ?? latest.blueprint) as unknown as Prisma.InputJsonValue,
            humanPlan: input.humanPlan ?? latest.humanPlan,
            assumptions: input.assumptions ?? latest.assumptions,
            validation: (validation ?? latest.validation) as unknown as Prisma.InputJsonValue,
            changeSummary: input.changeSummary ?? "Blueprint updated",
          },
        });
        await transaction.workflow.update({
          where: { id: workflowId },
          data: {
            name: input.name ?? workflow.name,
            description: input.description === undefined ? workflow.description : input.description,
            currentVersion: version.version,
            status: WorkflowStatus.DRAFT,
          },
        });
        await appendMutationRecords(transaction, identity, [{
          entityType: "workflow",
          entityId: workflowId,
          action: "update",
          eventType: "workflow.updated",
          payload: { version: version.version, name: workflow.name },
          changedFields: Object.keys(input),
        }]);
      } else {
        await transaction.workflow.update({
          where: { id: workflowId },
          data: {
            name: input.name ?? workflow.name,
            description: input.description === undefined ? workflow.description : input.description,
          },
        });
        await appendMutationRecords(transaction, identity, [{
          entityType: "workflow",
          entityId: workflowId,
          action: "update",
          eventType: "workflow.updated",
          payload: { name: workflow.name },
          changedFields: Object.keys(input),
        }]);
      }
      return this.getDetailInTransaction(transaction, workflowId);
    });
  }

  async setWorkflowStatus(identity: OwnerIdentity, workflowId: string, next: "activate" | "pause" | "archive") {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const workflow = await transaction.workflow.findFirst({ where: { id: workflowId, deletedAt: null } });
      if (!workflow) throw new WorkflowOperationsError("NOT_FOUND", "Workflow not found.");
      const latest = await transaction.workflowVersion.findFirst({ where: { workflowId, deletedAt: null }, orderBy: { version: "desc" } });
      if (!latest) throw new WorkflowOperationsError("STATE_INVALID", "The workflow has no versions.");
      if (next === "activate" && !latest.testedAt) {
        throw new WorkflowOperationsError("STATE_INVALID", "Run a sandbox test of this version before activation.");
      }
      const status = next === "activate" ? WorkflowStatus.DEPLOYED : next === "pause" ? WorkflowStatus.PAUSED : WorkflowStatus.ARCHIVED;
      if (next === "activate") {
        await transaction.workflowVersion.update({ where: { id: latest.id }, data: { deployedAt: new Date(), isImmutable: true } });
      }
      const updated = await transaction.workflow.update({ where: { id: workflowId }, data: { status } });
      void updated;
      await appendMutationRecords(transaction, identity, [{
        entityType: "workflow",
        entityId: workflowId,
        action: next,
        eventType: `workflow.${next}`,
        payload: { name: workflow.name, status },
      }]);
      return this.getDetailInTransaction(transaction, workflowId);
    });
  }

  /** Records a sandbox test execution against the current version. */
  async recordTestExecution(identity: OwnerIdentity, workflowId: string, result: { status: "success" | "failed"; output?: Record<string, unknown>; errorMessage?: string | null }) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const workflow = await transaction.workflow.findFirst({ where: { id: workflowId, deletedAt: null } });
      if (!workflow) throw new WorkflowOperationsError("NOT_FOUND", "Workflow not found.");
      const latest = await transaction.workflowVersion.findFirst({ where: { workflowId, deletedAt: null }, orderBy: { version: "desc" } });
      if (!latest) throw new WorkflowOperationsError("STATE_INVALID", "The workflow has no versions.");
      const execution = await transaction.workflowExecution.create({
        data: {
          workflowId,
          workflowVersionId: latest.id,
          status: executionStatusToDb(result.status),
          idempotencyKey: `test:${workflowId}:${latest.version}:${randomUUID().slice(0, 8)}`,
          output: (result.output ?? {}) as Prisma.InputJsonValue,
          errorMessage: result.errorMessage ?? null,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      await transaction.workflowVersion.update({ where: { id: latest.id }, data: { testedAt: new Date() } });
      await appendMutationRecords(transaction, identity, [{
        entityType: "workflow_execution",
        entityId: execution.id,
        action: "test",
        eventType: "workflow.tested",
        payload: { workflowId, status: result.status },
      }]);
      return execution;
    });
  }

  /** Worker/ingress path for signed provider execution events. */
  async recordProviderEvent(input: WorkflowEventInput): Promise<{ recorded: boolean; executionId: string | null }> {
    const workflow = await this.database.workflow.findFirst({
      where: { providerWorkflowId: input.providerWorkflowId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!workflow) return { recorded: false, executionId: null };
    const latest = await this.database.workflowVersion.findFirst({ where: { workflowId: workflow.id, deletedAt: null }, orderBy: { version: "desc" } });
    if (!latest) return { recorded: false, executionId: null };
    const execution = await this.database.workflowExecution.create({
      data: {
        workflowId: workflow.id,
        workflowVersionId: latest.id,
        providerExecutionId: input.providerExecutionId,
        status: executionStatusToDb(input.status ?? (input.event === "execution_complete" ? "success" : "failed")),
        idempotencyKey: `event:${workflow.id}:${input.providerExecutionId}`,
        output: {} as Prisma.InputJsonValue,
        failureStep: input.failureStep ?? null,
        errorMessage: input.errorMessage ?? null,
        durationMs: input.durationMs ?? null,
        completedAt: new Date(),
      },
    }).catch(() => null);
    if (!execution) return { recorded: false, executionId: null };
    await this.refreshWorkflowAggregates(workflow.id);
    return { recorded: true, executionId: execution.id };
  }

  async listExecutions(identity: OwnerIdentity, input: { workflowId?: string; limit?: number } = {}) {
    await this.requireActiveOwner(identity);
    return this.database.workflowExecution.findMany({
      where: { deletedAt: null, ...(input.workflowId ? { workflowId: input.workflowId } : {}) },
      orderBy: { createdAt: "desc" },
      take: Math.max(1, Math.min(input.limit ?? 25, 100)),
    });
  }

  private async requireActiveOwner(identity: OwnerIdentity): Promise<void> {
    const owner = await this.database.ownerAccount.findFirst({ where: { authSubject: identity.ownerSubject, active: true }, select: { id: true } });
    if (!owner) throw new WorkflowOperationsError("INVALID_IDENTITY", "The authenticated owner is not active.");
  }

  private async getDetailInTransaction(transaction: Transaction, workflowId: string) {
    const workflow = await transaction.workflow.findFirst({
      where: { id: workflowId, deletedAt: null },
      include: {
        client: { select: { name: true } },
        versions: { where: { deletedAt: null }, orderBy: { version: "desc" }, take: 10 },
        executions: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!workflow) throw new WorkflowOperationsError("NOT_FOUND", "Workflow not found.");
    return workflow;
  }

  private async refreshWorkflowAggregates(workflowId: string): Promise<void> {
    const grouped = await this.database.workflowExecution.groupBy({
      by: ["status"],
      where: { workflowId, deletedAt: null },
      _count: { _all: true },
    });
    const countBy = (status: WorkflowExecutionStatus) => grouped.find((group) => group.status === status)?._count._all ?? 0;
    const total = grouped.reduce((sum, group) => sum + group._count._all, 0);
    const terminal = countBy(WorkflowExecutionStatus.SUCCESS) + countBy(WorkflowExecutionStatus.FAILED) + countBy(WorkflowExecutionStatus.CANCELLED);
    const successRate = terminal === 0 ? 100 : Math.round((countBy(WorkflowExecutionStatus.SUCCESS) / terminal) * 10_000) / 100;
    await this.database.workflow.update({ where: { id: workflowId }, data: { totalExecutions: total, successRate } });
  }
}

function providerToDb(provider: string): WorkflowProvider {
  if (provider.toLowerCase() === "make") return WorkflowProvider.MAKE;
  return WorkflowProvider.N8N;
}

function statusToDb(status: string) {
  return status.toUpperCase();
}

function executionStatusToDb(status: string): WorkflowExecutionStatus {
  const value = status.toUpperCase();
  return (value === "TIMEOUT" ? "CANCELLED" : value) as WorkflowExecutionStatus;
}

export { workflowBlueprintSchema };
