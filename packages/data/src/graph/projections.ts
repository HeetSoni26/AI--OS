import type { Prisma } from "../generated/client/client";
import { GraphEdgeProvenance, GraphEdgeType, GraphNodeType } from "../generated/client/enums";

export const GRAPH_PROJECTION_VERSION = 1 as const;
export const CONTACT_OWNERSHIP_PROJECTION_KEY = "clients.contacts" as const;
export const TASK_OWNERSHIP_PROJECTION_KEY = "clients.tasks" as const;

export interface TaskProjectionSource {
  id: string;
  projectId: string;
  title: string;
  archivedAt: Date | null;
  deletedAt: Date | null;
}

/** Maintains the minimal task projection in the same transaction as source truth. */
export async function upsertTaskGraphProjection(
  transaction: Prisma.TransactionClient,
  task: TaskProjectionSource,
): Promise<void> {
  const project = await transaction.project.findUnique({
    where: { id: task.projectId },
    select: { clientId: true, client: { select: { id: true, name: true, archivedAt: true, deletedAt: true } } },
  });
  if (!project) throw new Error("Task project source was not found while updating its graph projection.");

  const clientNode = await transaction.graphNode.upsert({
    where: { stableKey: `client:${project.clientId}` },
    create: {
      type: GraphNodeType.CLIENT,
      entityId: project.client.id,
      stableKey: `client:${project.client.id}`,
      label: project.client.name,
      metadata: { projectionVersion: GRAPH_PROJECTION_VERSION },
      archivedAt: project.client.archivedAt,
      deletedAt: project.client.deletedAt,
    },
    update: {
      label: project.client.name,
      metadata: { projectionVersion: GRAPH_PROJECTION_VERSION },
      archivedAt: project.client.archivedAt,
      deletedAt: project.client.deletedAt,
    },
  });
  const taskNode = await transaction.graphNode.upsert({
    where: { stableKey: `task:${task.id}` },
    create: {
      type: GraphNodeType.TASK,
      entityId: task.id,
      stableKey: `task:${task.id}`,
      label: task.title,
      metadata: { projectionVersion: GRAPH_PROJECTION_VERSION, projectId: task.projectId, clientId: project.clientId },
      archivedAt: task.archivedAt,
      deletedAt: task.deletedAt,
    },
    update: {
      label: task.title,
      metadata: { projectionVersion: GRAPH_PROJECTION_VERSION, projectId: task.projectId, clientId: project.clientId },
      archivedAt: task.archivedAt,
      deletedAt: task.deletedAt,
    },
  });

  await transaction.graphEdge.upsert({
    where: {
      sourceId_sourceType_targetId_targetType_edgeType: {
        sourceId: clientNode.id,
        sourceType: GraphNodeType.CLIENT,
        targetId: taskNode.id,
        targetType: GraphNodeType.TASK,
        edgeType: GraphEdgeType.OWNERSHIP,
      },
    },
    create: {
      sourceId: clientNode.id,
      sourceType: GraphNodeType.CLIENT,
      targetId: taskNode.id,
      targetType: GraphNodeType.TASK,
      edgeType: GraphEdgeType.OWNERSHIP,
      provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
      label: "has task",
      metadata: { projectionVersion: GRAPH_PROJECTION_VERSION, projectionKey: TASK_OWNERSHIP_PROJECTION_KEY },
      archivedAt: task.archivedAt,
      deletedAt: task.deletedAt,
    },
    update: {
      provenance: GraphEdgeProvenance.SYSTEM_PROJECTION,
      label: "has task",
      metadata: { projectionVersion: GRAPH_PROJECTION_VERSION, projectionKey: TASK_OWNERSHIP_PROJECTION_KEY },
      archivedAt: task.archivedAt,
      deletedAt: task.deletedAt,
    },
  });
}

export function taskEventPayload(task: TaskProjectionSource & { status: string; dueAt: Date | null }) {
  return {
    taskId: task.id,
    projectId: task.projectId,
    status: task.status.toLowerCase(),
    dueAt: task.dueAt?.toISOString() ?? null,
    archivedAt: task.archivedAt?.toISOString() ?? null,
  };
}
