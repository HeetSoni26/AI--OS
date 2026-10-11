import "server-only";

import type { WorkflowExecution } from "@aios/data";
import { apiEnum, apiIso, apiNumber } from "./domain-service";

type EntityRecord = Record<string, unknown>;

export function mapWorkflowListRow(row: EntityRecord) {
  const versions = Array.isArray(row.versions) ? row.versions as EntityRecord[] : [];
  const version = versions[0];
  return {
    id: row.id as string,
    clientId: row.clientId as string,
    clientName: (row.client as EntityRecord).name as string,
    agentId: row.agentId as string | null,
    name: row.name as string,
    description: row.description as string | null,
    provider: apiEnum(row.provider),
    status: apiEnum(row.status),
    currentVersion: row.currentVersion as number | null,
    webhookUrl: row.webhookUrl as string | null,
    totalExecutions: row.totalExecutions as number,
    successRate: apiNumber(row.successRate as never),
    averageDurationMs: row.averageDurationMs as number | null,
    lastExecutedAt: apiIso(row.lastExecutedAt as Date | null),
    latestValidation: version ? (version.validation as { valid?: boolean; issues?: Array<{ code: string; message: string }> } | null) : null,
    createdAt: apiIso(row.createdAt as Date | null),
    updatedAt: apiIso(row.updatedAt as Date | null),
  };
}

export function mapWorkflowDetail(row: EntityRecord) {
  const versions = (Array.isArray(row.versions) ? row.versions : []) as EntityRecord[];
  const executions = (Array.isArray(row.executions) ? row.executions : []) as EntityRecord[];
  return {
    ...mapWorkflowListRow(row),
    latestVersion: versions[0] ? {
      id: versions[0].id as string,
      version: versions[0].version as number,
      blueprint: versions[0].blueprint as Record<string, unknown>,
      humanPlan: versions[0].humanPlan as string,
      assumptions: [...(versions[0].assumptions as string[] ?? [])],
      validation: versions[0].validation as { valid: boolean; issues: Array<{ code: string; message: string; nodeId?: string }> } | null,
      changeSummary: versions[0].changeSummary as string | null,
      testedAt: apiIso(versions[0].testedAt as Date | null),
      deployedAt: apiIso(versions[0].deployedAt as Date | null),
      createdAt: apiIso(versions[0].createdAt as Date | null),
    } : null,
    versions: versions.map((version) => ({
      version: version.version as number,
      blueprint: version.blueprint as Record<string, unknown>,
      humanPlan: version.humanPlan as string,
      validation: version.validation as { valid: boolean; issues: Array<{ code: string; message: string }> } | null,
      changeSummary: version.changeSummary as string | null,
      testedAt: apiIso(version.testedAt as Date | null),
      deployedAt: apiIso(version.deployedAt as Date | null),
      createdAt: apiIso(version.createdAt as Date | null),
    })),
    executions: executions.map(mapExecution),
  };
}

export function mapExecution(execution: WorkflowExecution | EntityRecord) {
  const row = execution as EntityRecord;
  return {
    id: row.id as string,
    workflowId: row.workflowId as string,
    status: apiEnum(row.status),
    providerExecutionId: row.providerExecutionId as string | null,
    failureStep: row.failureStep as string | null,
    errorMessage: row.errorMessage as string | null,
    durationMs: row.durationMs as number | null,
    startedAt: apiIso(row.startedAt as Date | null),
    completedAt: apiIso(row.completedAt as Date | null),
    createdAt: apiIso(row.createdAt as Date | null),
  };
}
