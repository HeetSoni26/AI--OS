import "server-only";

import { PipelineOperationsError, PrismaPipelineService, type PrismaClient } from "@aios/data";
import { ApiRequestError } from "./errors";
import { apiEnum, apiIso, apiNumber } from "./domain-service";

export function mapPipelineError(error: unknown): unknown {
  if (error instanceof PipelineOperationsError) {
    const statusByCode: Record<string, number> = {
      INVALID_IDENTITY: 403,
      NOT_FOUND: 404,
      INVALID_INPUT: 422,
      CONFLICT: 409,
      STATE_INVALID: 409,
      DUPLICATE_LEAD: 409,
    };
    return new ApiRequestError(error.code, error.message, { status: statusByCode[error.code] ?? 400, cause: error });
  }
  return error;
}

export function pipelineServiceFactory(database: PrismaClient) {
  return new PrismaPipelineService(database);
}

type EntityRecord = Record<string, unknown>;

export function mapCrmLead(row: EntityRecord) {
  const proposals = (Array.isArray(row.proposals) ? row.proposals : []) as EntityRecord[];
  const history = (Array.isArray(row.stageHistory) ? row.stageHistory : []) as EntityRecord[];
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string | null,
    phone: row.phone as string | null,
    company: row.company as string | null,
    source: row.source as string | null,
    interest: row.interest as string | null,
    notes: row.notes as string | null,
    stage: apiEnum(row.stage),
    value: row.value == null ? null : apiNumber(row.value as never),
    expectedCloseProbability: row.expectedCloseProbability == null ? null : apiNumber(row.expectedCloseProbability as never),
    followUpAt: apiIso(row.followUpAt as Date | null),
    convertedClientId: row.convertedClientId as string | null,
    proposals: proposals.map(mapProposal),
    stageHistory: history.map((entry) => ({
      fromStage: entry.fromStage ? apiEnum(entry.fromStage) : null,
      toStage: apiEnum(entry.toStage),
      reason: entry.reason as string | null,
      changedAt: apiIso(entry.changedAt as Date | null),
    })),
    updatedAt: apiIso(row.updatedAt as Date | null),
    createdAt: apiIso(row.createdAt as Date | null),
  };
}

export function mapProposal(row: EntityRecord) {
  const versions = (Array.isArray(row.versions) ? row.versions : []) as EntityRecord[];
  const lead = row.crmLead as EntityRecord | undefined;
  return {
    id: row.id as string,
    crmLeadId: row.crmLeadId as string,
    leadName: lead?.name as string | undefined ?? null,
    leadCompany: lead?.company as string | undefined ?? null,
    title: row.title as string,
    status: apiEnum(row.status),
    currentVersion: row.currentVersion as number,
    sentAt: apiIso(row.sentAt as Date | null),
    viewedAt: apiIso(row.viewedAt as Date | null),
    acceptedAt: apiIso(row.acceptedAt as Date | null),
    expiresAt: apiIso(row.expiresAt as Date | null),
    scope: versions[0]?.scope as string | undefined ?? null,
    createdAt: apiIso(row.createdAt as Date | null),
  };
}

export function mapSourcedLead(row: EntityRecord) {
  return {
    id: row.id as string,
    clientId: row.clientId as string | null,
    scope: apiEnum(row.scope),
    name: row.name as string,
    company: row.company as string | null,
    title: row.title as string | null,
    email: row.email as string | null,
    linkedinUrl: row.linkedinUrl as string | null,
    companyDomain: row.companyDomain as string | null,
    source: apiEnum(row.source),
    fitScore: row.fitScore as number | null,
    fitExplanation: row.fitExplanation as string | null,
    category: row.category ? apiEnum(row.category) : null,
    stage: apiEnum(row.stage),
    dateFound: iso(row.dateFound as Date | null),
  };
}

function iso(value: Date | null): string {
  return value ? value.toISOString() : new Date(0).toISOString();
}
