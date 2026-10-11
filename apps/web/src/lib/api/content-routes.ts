import "server-only";

import { ContentOperationsError, PrismaContentService, type PrismaClient } from "@aios/data";
import { ApiRequestError } from "./errors";
import { apiEnum, apiIso } from "./domain-service";

export function mapContentError(error: unknown): unknown {
  if (error instanceof ContentOperationsError) {
    const statusByCode: Record<string, number> = {
      INVALID_IDENTITY: 403,
      NOT_FOUND: 404,
      INVALID_INPUT: 422,
      CONFLICT: 409,
      STATE_INVALID: 409,
    };
    return new ApiRequestError(error.code, error.message, { status: statusByCode[error.code] ?? 400, cause: error });
  }
  return error;
}

export function contentServiceFactory(database: PrismaClient) {
  return new PrismaContentService(database);
}

type EntityRecord = Record<string, unknown>;

export function mapBrandProfile(profile: EntityRecord) {
  return {
    id: profile.id as string,
    clientId: profile.clientId as string | null,
    scope: apiEnum(profile.scope),
    name: profile.name as string,
    tone: profile.tone as string,
    vocabulary: [...(profile.vocabulary as string[] ?? [])],
    targetAudience: profile.targetAudience as string,
    keyMessages: [...(profile.keyMessages as string[] ?? [])],
    prohibitedClaims: [...(profile.prohibitedClaims as string[] ?? [])],
    examples: [...(profile.examples as string[] ?? [])],
    version: profile.version as number,
    updatedAt: apiIso(profile.updatedAt as Date | null),
  };
}

export function mapArtifactListRow(row: EntityRecord) {
  const versions = Array.isArray(row.versions) ? row.versions as EntityRecord[] : [];
  const version = versions[0];
  return {
    id: row.id as string,
    clientId: row.clientId as string | null,
    clientName: row.client ? (row.client as EntityRecord).name as string : null,
    scope: apiEnum(row.scope),
    type: apiEnum(row.type),
    status: apiEnum(row.status),
    title: row.title as string,
    brief: row.brief as string | null,
    body: version ? version.body as string : row.body as string,
    claimsToVerify: [...(row.claimsToVerify as string[] ?? [])],
    currentVersion: row.currentVersion as number,
    derivedCount: row.derivedArtifacts ? (row.derivedArtifacts as unknown[]).length : undefined,
    updatedAt: apiIso(row.updatedAt as Date | null),
    createdAt: apiIso(row.createdAt as Date | null),
  };
}

export function mapArtifactDetail(row: EntityRecord) {
  const versions = (Array.isArray(row.versions) ? row.versions : []) as EntityRecord[];
  const calendar = (Array.isArray(row.calendarEntries) ? row.calendarEntries : []) as EntityRecord[];
  const derived = (Array.isArray(row.derivedArtifacts) ? row.derivedArtifacts : []) as EntityRecord[];
  return {
    ...mapArtifactListRow(row),
    versions: versions.map((version) => ({
      version: version.version as number,
      status: apiEnum(version.status),
      title: version.title as string,
      body: version.body as string,
      createdAt: apiIso(version.createdAt as Date | null),
    })),
    calendarEntries: calendar.map((entry) => ({
      id: entry.id as string,
      platform: apiEnum(entry.platform),
      status: apiEnum(entry.status),
      publishAt: apiIso(entry.scheduledFor as Date | null),
    })),
    derived: derived.map((artifact) => ({ id: artifact.id as string, title: artifact.title as string, type: apiEnum(artifact.type) })),
  };
}

export function mapCalendarEntry(entry: EntityRecord) {
  const artifact = entry.artifact as EntityRecord | undefined;
  return {
    id: entry.id as string,
    artifactId: entry.artifactId as string,
    artifactTitle: artifact?.title as string | undefined ?? null,
    artifactType: artifact ? apiEnum(artifact.type) : null,
    clientId: entry.clientId as string | null,
    scope: apiEnum(entry.scope),
    platform: apiEnum(entry.platform),
    status: apiEnum(entry.status),
    publishAt: apiIso(entry.scheduledFor as Date | null) ?? new Date(0).toISOString(),
  };
}
