import "server-only";

import { KnowledgeOperationsError, PrismaKnowledgeService, type PrismaClient } from "@aios/data";
import { ApiRequestError } from "./errors";
import { apiEnum, apiIso } from "./domain-service";

export function mapKnowledgeError(error: unknown): unknown {
  if (error instanceof KnowledgeOperationsError) {
    const statusByCode: Record<string, number> = {
      INVALID_IDENTITY: 403,
      NOT_FOUND: 404,
      INVALID_INPUT: 422,
      CONFLICT: 409,
    };
    return new ApiRequestError(error.code, error.message, { status: statusByCode[error.code] ?? 400, cause: error });
  }
  return error;
}

export function knowledgeServiceFactory(database: PrismaClient) {
  return new PrismaKnowledgeService(database);
}

type EntityRecord = Record<string, unknown>;

export function mapKnowledgeEntry(row: EntityRecord) {
  const versions = (Array.isArray(row.versions) ? row.versions : []) as EntityRecord[];
  return {
    id: row.id as string,
    clientId: row.clientId as string | null,
    title: row.title as string,
    category: apiEnum(row.category),
    content: row.content as string,
    tags: [...(row.tags as string[] ?? [])],
    version: row.version as number,
    accessCount: row.accessCount as number,
    lastAccessedAt: apiIso(row.lastAccessedAt as Date | null),
    updatedAt: apiIso(row.updatedAt as Date | null),
    createdAt: apiIso(row.createdAt as Date | null),
    versions: versions.map((version) => ({
      version: version.version as number,
      title: version.title as string,
      changeSummary: version.changeSummary as string | null,
      createdBy: version.createdBy as string | null,
      createdAt: apiIso(version.createdAt as Date | null),
    })),
  };
}

export function mapSop(row: EntityRecord) {
  const steps = (Array.isArray(row.steps) ? row.steps : []) as EntityRecord[];
  const executions = (Array.isArray(row.executions) ? row.executions : []) as EntityRecord[];
  return {
    id: row.id as string,
    clientId: row.clientId as string | null,
    title: row.title as string,
    materials: [...(row.materials as string[] ?? [])],
    expectedOutcome: row.expectedOutcome as string,
    currentVersion: row.currentVersion as number,
    usageCount: row.usageCount as number,
    lastExecutedAt: apiIso(row.lastExecutedAt as Date | null),
    lastTestedAt: apiIso(row.lastTestedAt as Date | null),
    steps: steps.map((step) => ({
      id: step.id as string,
      position: step.position as number,
      title: step.title as string,
      instructions: step.instructions as string,
      expectedResult: step.expectedResult as string | null,
      isOptional: step.isOptional === true,
    })),
    executions: executions.map((execution) => ({
      id: execution.id as string,
      status: apiEnum(execution.status),
      errorMessage: execution.errorMessage as string | null,
      completedAt: apiIso(execution.completedAt as Date | null),
      createdAt: apiIso(execution.createdAt as Date | null),
    })),
    updatedAt: apiIso(row.updatedAt as Date | null),
  };
}

export function mapNotification(row: EntityRecord) {
  return {
    id: row.id as string,
    type: apiEnum(row.type),
    priority: apiEnum(row.priority),
    title: row.title as string,
    body: row.body as string | null,
    entityType: row.entityType as string | null,
    entityId: row.entityId as string | null,
    read: row.read === true,
    createdAt: apiIso(row.createdAt as Date | null) ?? new Date(0).toISOString(),
  };
}
